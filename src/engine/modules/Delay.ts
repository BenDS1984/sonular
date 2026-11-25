import type { DspModule } from '../core/types';
import type { Transport } from '../core/Transport';

/** Note lengths for the tempo-synced delay times, indexed by "divL" / "divR" (a quarter note is one beat). */
export const DELAY_DIVISIONS: readonly { label: string; beats: number }[] = [
  { label: '1/32', beats: 0.125 },
  { label: '1/16', beats: 0.25 },
  { label: '1/8', beats: 0.5 },
  { label: '1/4', beats: 1 },
  { label: '1/2', beats: 2 },
  { label: '1/1', beats: 4 },
];
/** How a note is played, indexed by "modeL" / "modeR": as written, as a triplet (⅔) or dotted (1½). */
export const DELAY_MODES: readonly { label: string; factor: number }[] = [
  { label: 'Straight', factor: 1 },
  { label: 'Triplet', factor: 2 / 3 },
  { label: 'Dotted', factor: 3 / 2 },
];
/** The routing choices, indexed by "routing". */
export const DELAY_ROUTING = ['Stereo', 'Ping-pong'] as const;

/** Free delay times run from 1 ms to this many ms. */
export const DELAY_FREE_MAX_MS = 5000;
/** The longest delay the lines hold, in seconds (a dotted whole note at 40 BPM is 9 s). */
const BUFFER_SECONDS = 10;

/** Where the filters stand open: a low-pass at or above this or a high-pass at or below the other is bypassed. */
export const DELAY_LP_OPEN_HZ = 19500;
export const DELAY_HP_OPEN_HZ = 25;

/** The delay time glides when it changes (time constant ~60 ms, at most an octave of bend), like a tape delay: no clicks. */
const TIME_GLIDE_SECONDS = 0.06;
/** The delay time never moves faster than this many samples per sample (±0.5 = at most an octave of bend). */
const MAX_SLEW = 0.5;
/** Feedback, filters, tape, mix and routing glide over ~20 ms. */
const PARAM_GLIDE_SECONDS = 0.02;
/** Below this, written samples count as silence (−120 dB). */
const QUIET = 1e-6;

/** Tape wobble at full "tape": a slow wow of this many seconds and a quick flutter. */
const WOW_SECONDS = 0.002;
const FLUTTER_SECONDS = 0.00015;
/** Wow and flutter rates in Hz, per line (the lines drift against each other). */
const WOW_HZ = [0.55, 0.71];
const FLUTTER_HZ = [5.3, 6.1];
/** The wobble fades out for delay times below this, where it would swamp the delay itself. */
const WOBBLE_FULL_SECONDS = 0.08;

/** A soft clip: ~x for small x, leveling off towards ±1 (a cheap stand-in for tanh). */
function softClip(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  return (x * (27 + x * x)) / (27 + 9 * x * x);
}

/**
 * Dual Delay: a left and a right delay line with their own musical times, one shared feedback, a
 * high-pass and a low-pass in the loop, tape character and a dry/wet mix. Like Ableton's Echo.
 *
 * Inputs:  0 L, 1 R (unpatched R follows L). Outputs: 0 L, 1 R.
 *
 * Stereo: each line delays its own side. Ping-pong: the input is summed to mono into the left line;
 * the left line feeds the right and the right feeds the left again, so the echoes bounce.
 *
 * Time: with "sync" on, each line lasts a note value of the project tempo (the tempo in the top
 * bar): "divL"/"divR" pick 1/32 … 1/1 and "modeL"/"modeR" make it straight, a triplet or dotted.
 * With "sync" off, "timeL"/"timeR" set it in ms.
 *
 * Parameters: "feedback" 0..0.95 (both lines), "hp" and "lp" in Hz (the filters in the loop; fully
 * open they are bypassed), "tape" 0..1 (soft saturation in the loop plus a slow wobble of the delay
 * times), "mix" 0..1 (equal-power dry/wet), "routing" (index into DELAY_ROUTING), "sync" 0/1.
 *
 * Costs nothing while idle: with no input and nothing left in the lines it skips the work.
 */
export class Delay implements DspModule {
  readonly numInputs = 2;
  readonly numOutputs = 2;
  /** Echoes can ring for a long time; the module puts itself to sleep when they have died out. */
  readonly tailSeconds = Infinity;

  private readonly sampleRate: number;
  private readonly transport: Transport;
  private readonly size: number;
  private readonly mask: number;
  private readonly timeCoef: number;
  private readonly paramCoef: number;
  private readonly bufL: Float32Array;
  private readonly bufR: Float32Array;
  private write = 0;

  // Targets, set by the parameters.
  private sync = 1;
  private timeMs = [375, 500];
  private division = [2, 3];
  private mode = [2, 0];
  private feedback = 0.4;
  private hp = DELAY_HP_OPEN_HZ;
  private lp = 20000;
  private tape = 0.3;
  private mix = 0.35;
  private ping = 0;

  // Smoothed values in use.
  private timeNow = [0, 0];
  private feedbackNow = 0.4;
  private klNow = 1;
  private khNow = 0;
  private tapeNow = 0.3;
  private dryNow = Math.cos(0.35 * Math.PI * 0.5);
  private wetNow = Math.sin(0.35 * Math.PI * 0.5);
  private pingNow = 0;
  private started = false;

  // Filter states in the loop, per line: the low-pass, and the low-pass inside the high-pass.
  private lpL = 0;
  private lpR = 0;
  private hpL = 0;
  private hpR = 0;

  // The tape wobble: rotating phasors (cosine, sine) so no sin() is needed per sample.
  private readonly wowRe = [1, 0.6];
  private readonly wowIm = [0, 0.8];
  private readonly flutRe = [1, 0.8];
  private readonly flutIm = [0, 0.6];
  private readonly wowCos: number[];
  private readonly wowSin: number[];
  private readonly flutCos: number[];
  private readonly flutSin: number[];

  /** Samples in a row for which everything written into the lines was silent. */
  private quietRun = 0;
  private idle = true;
  private rightConnected = false;

  constructor(sampleRate: number, transport: Transport) {
    this.sampleRate = sampleRate;
    this.transport = transport;
    let size = 1024;
    while (size < BUFFER_SECONDS * sampleRate + 4) size *= 2;
    this.size = size;
    this.mask = size - 1;
    this.bufL = new Float32Array(size);
    this.bufR = new Float32Array(size);
    this.timeCoef = Math.exp(-1 / (TIME_GLIDE_SECONDS * sampleRate));
    this.paramCoef = Math.exp(-1 / (PARAM_GLIDE_SECONDS * sampleRate));
    this.wowCos = WOW_HZ.map((f) => Math.cos((2 * Math.PI * f) / sampleRate));
    this.wowSin = WOW_HZ.map((f) => Math.sin((2 * Math.PI * f) / sampleRate));
    this.flutCos = FLUTTER_HZ.map((f) => Math.cos((2 * Math.PI * f) / sampleRate));
    this.flutSin = FLUTTER_HZ.map((f) => Math.sin((2 * Math.PI * f) / sampleRate));
  }

  setParam(name: string, value: number): void {
    const side = name.endsWith('L') ? 0 : name.endsWith('R') ? 1 : -1;
    const base = side < 0 ? name : name.slice(0, -1);
    switch (base) {
      case 'time':
        if (side >= 0) this.timeMs[side] = Math.min(DELAY_FREE_MAX_MS, Math.max(1, value));
        break;
      case 'div':
        if (side >= 0) this.division[side] = Math.max(0, Math.min(DELAY_DIVISIONS.length - 1, Math.round(value)));
        break;
      case 'mode':
        if (side >= 0) this.mode[side] = Math.max(0, Math.min(DELAY_MODES.length - 1, Math.round(value)));
        break;
      case 'sync':
        this.sync = value >= 0.5 ? 1 : 0;
        break;
      case 'feedback':
        this.feedback = Math.min(0.95, Math.max(0, value));
        break;
      case 'hp':
        this.hp = Math.max(1, value);
        break;
      case 'lp':
        this.lp = Math.max(20, value);
        break;
      case 'tape':
        this.tape = Math.min(1, Math.max(0, value));
        break;
      case 'mix':
        this.mix = Math.min(1, Math.max(0, value));
        break;
      case 'routing':
        this.ping = Math.round(value) === 1 ? 1 : 0;
        break;
    }
  }

  onConnectionsChanged(inputsConnected: readonly boolean[]): void {
    this.rightConnected = !!inputsConnected[1];
  }

  /** The delay time of one side in samples: a note of the project tempo, or the knob's milliseconds. */
  private targetSamples(side: number): number {
    let t: number;
    if (this.sync) {
      const beats = DELAY_DIVISIONS[this.division[side]!]!.beats * DELAY_MODES[this.mode[side]!]!.factor;
      t = beats / this.transport.beatsPerSample;
    } else {
      t = (this.timeMs[side]! * this.sampleRate) / 1000;
    }
    return Math.min(this.size - 2, Math.max(1, t));
  }

  process(inputs: readonly Float32Array[], silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const outL = outputs[0]!;
    const outR = outputs[1]!;
    const inLSilent = silent[0]!;
    const inRSilent = this.rightConnected ? silent[1]! : inLSilent;

    if (inLSilent && inRSilent && this.idle) {
      outL.fill(0, 0, frames);
      outR.fill(0, 0, frames);
      return;
    }
    if (!(inLSilent && inRSilent)) {
      this.idle = false;
      this.quietRun = 0;
    }

    const tL = this.targetSamples(0);
    const tR = this.targetSamples(1);
    if (!this.started) {
      this.timeNow[0] = tL;
      this.timeNow[1] = tR;
      this.started = true;
    }

    const inL = inputs[0]!;
    const inR = this.rightConnected ? inputs[1]! : inL;
    const mask = this.mask;
    const bL = this.bufL;
    const bR = this.bufR;
    const tc = this.timeCoef;
    const pc = this.paramCoef;
    const fbT = this.feedback;
    const pingT = this.ping;
    const tapeT = this.tape;
    // The filters' one-pole coefficients, from their cutoffs (bypassed when fully open).
    const klT = this.lp >= DELAY_LP_OPEN_HZ ? 1 : 1 - Math.exp((-2 * Math.PI * this.lp) / this.sampleRate);
    const khT = this.hp <= DELAY_HP_OPEN_HZ ? 0 : 1 - Math.exp((-2 * Math.PI * this.hp) / this.sampleRate);
    // Equal-power dry/wet: a 50/50 mix is as loud as either side.
    const dryT = Math.cos(this.mix * Math.PI * 0.5);
    const wetT = Math.sin(this.mix * Math.PI * 0.5);
    const wowDepth = WOW_SECONDS * this.sampleRate;
    const flutDepth = FLUTTER_SECONDS * this.sampleRate;
    const fullAt = WOBBLE_FULL_SECONDS * this.sampleRate;
    const wobL = Math.min(1, tL / fullAt);
    const wobR = Math.min(1, tR / fullAt);
    const wowC0 = this.wowCos[0]!;
    const wowS0 = this.wowSin[0]!;
    const wowC1 = this.wowCos[1]!;
    const wowS1 = this.wowSin[1]!;
    const fluC0 = this.flutCos[0]!;
    const fluS0 = this.flutSin[0]!;
    const fluC1 = this.flutCos[1]!;
    const fluS1 = this.flutSin[1]!;
    let wr0 = this.wowRe[0]!;
    let wi0 = this.wowIm[0]!;
    let wr1 = this.wowRe[1]!;
    let wi1 = this.wowIm[1]!;
    let fr0 = this.flutRe[0]!;
    let fi0 = this.flutIm[0]!;
    let fr1 = this.flutRe[1]!;
    let fi1 = this.flutIm[1]!;
    let w = this.write;
    let dL = this.timeNow[0]!;
    let dR = this.timeNow[1]!;
    let fb = this.feedbackNow;
    let kl = this.klNow;
    let kh = this.khNow;
    let tape = this.tapeNow;
    let dry = this.dryNow;
    let wet = this.wetNow;
    let png = this.pingNow;
    let lpL = this.lpL;
    let lpR = this.lpR;
    let hpL = this.hpL;
    let hpR = this.hpR;
    let blockMax = 0;

    for (let i = 0; i < frames; i++) {
      let sL = (tL - dL) * (1 - tc);
      let sR = (tR - dR) * (1 - tc);
      if (sL > MAX_SLEW) sL = MAX_SLEW;
      else if (sL < -MAX_SLEW) sL = -MAX_SLEW;
      if (sR > MAX_SLEW) sR = MAX_SLEW;
      else if (sR < -MAX_SLEW) sR = -MAX_SLEW;
      dL += sL;
      dR += sR;
      fb = fbT + (fb - fbT) * pc;
      kl = klT + (kl - klT) * pc;
      kh = khT + (kh - khT) * pc;
      tape = tapeT + (tape - tapeT) * pc;
      dry = dryT + (dry - dryT) * pc;
      wet = wetT + (wet - wetT) * pc;
      png = pingT + (png - pingT) * pc;

      // The tape wobble: each line drifts on its own wow and flutter.
      const nwr0 = wr0 * wowC0 - wi0 * wowS0;
      wi0 = wr0 * wowS0 + wi0 * wowC0;
      wr0 = nwr0;
      const nwr1 = wr1 * wowC1 - wi1 * wowS1;
      wi1 = wr1 * wowS1 + wi1 * wowC1;
      wr1 = nwr1;
      const nfr0 = fr0 * fluC0 - fi0 * fluS0;
      fi0 = fr0 * fluS0 + fi0 * fluC0;
      fr0 = nfr0;
      const nfr1 = fr1 * fluC1 - fi1 * fluS1;
      fi1 = fr1 * fluS1 + fi1 * fluC1;
      fr1 = nfr1;
      let eL = dL + tape * wobL * (wowDepth * wi0 + flutDepth * fi0);
      let eR = dR + tape * wobR * (wowDepth * wi1 + flutDepth * fi1);
      if (eL < 1) eL = 1;
      if (eR < 1) eR = 1;

      const xl = inLSilent ? 0 : inL[i]!;
      const xr = inRSilent ? 0 : inR[i]!;
      const mono = 0.5 * (xl + xr);

      // Read both lines, interpolating between the two nearest samples.
      const nL = Math.floor(eL);
      const fL = eL - nL;
      const aL = (w - nL) & mask;
      const cL = (aL - 1) & mask;
      const yL = bL[aL]! * (1 - fL) + bL[cL]! * fL;
      const nR = Math.floor(eR);
      const fR = eR - nR;
      const aR = (w - nR) & mask;
      const cR = (aR - 1) & mask;
      const yR = bR[aR]! * (1 - fR) + bR[cR]! * fR;

      // Into the lines: stereo = each side its own input and its own feedback. Ping-pong = the mono input
      // into the left line only, and each line fed back into the other.
      let vL = xl + png * (mono - xl) + fb * (yL + png * (yR - yL));
      let vR = xr * (1 - png) + fb * (yR + png * (yL - yR));

      // The filters in the loop.
      lpL += kl * (vL - lpL);
      lpR += kl * (vR - lpR);
      hpL += kh * (lpL - hpL);
      hpR += kh * (lpR - hpR);
      vL = lpL - hpL;
      vR = lpR - hpR;

      // Tape: a soft clip in the loop, harder at higher settings (small signals stay about the same).
      if (tape > 0.001) {
        const drive = 1 + 2.5 * tape;
        const inv = 1 / drive;
        vL = softClip(vL * drive) * inv;
        vR = softClip(vR * drive) * inv;
      }

      bL[w] = vL;
      bR[w] = vR;
      w = (w + 1) & mask;

      const m0 = vL < 0 ? -vL : vL;
      const m1 = vR < 0 ? -vR : vR;
      const mx = m0 > m1 ? m0 : m1;
      if (mx > blockMax) blockMax = mx;

      outL[i] = dry * xl + wet * yL;
      outR[i] = dry * xr + wet * yR;
    }

    this.write = w;
    this.timeNow[0] = dL;
    this.timeNow[1] = dR;
    this.feedbackNow = fb;
    this.klNow = kl;
    this.khNow = kh;
    this.tapeNow = tape;
    this.dryNow = dry;
    this.wetNow = wet;
    this.pingNow = png;
    this.lpL = lpL;
    this.lpR = lpR;
    this.hpL = hpL;
    this.hpR = hpR;
    // The phasors drift in length from rounding: bring them back to 1.
    const n0w = 1 / Math.hypot(wr0, wi0);
    const n1w = 1 / Math.hypot(wr1, wi1);
    const n0f = 1 / Math.hypot(fr0, fi0);
    const n1f = 1 / Math.hypot(fr1, fi1);
    this.wowRe[0] = wr0 * n0w;
    this.wowIm[0] = wi0 * n0w;
    this.wowRe[1] = wr1 * n1w;
    this.wowIm[1] = wi1 * n1w;
    this.flutRe[0] = fr0 * n0f;
    this.flutIm[0] = fi0 * n0f;
    this.flutRe[1] = fr1 * n1f;
    this.flutIm[1] = fi1 * n1f;

    // Everything written was silent for a whole trip through the lines: nothing is left.
    if (blockMax < QUIET) {
      this.quietRun += frames;
      if (this.quietRun >= this.size) {
        this.idle = true;
        this.clearLines();
      }
    } else {
      this.quietRun = 0;
    }
  }

  private clearLines(): void {
    this.bufL.fill(0);
    this.bufR.fill(0);
    this.lpL = 0;
    this.lpR = 0;
    this.hpL = 0;
    this.hpR = 0;
  }

  reset(): void {
    this.clearLines();
    this.write = 0;
    this.started = false;
    this.quietRun = 0;
    this.idle = true;
    this.feedbackNow = this.feedback;
    this.klNow = this.lp >= DELAY_LP_OPEN_HZ ? 1 : 1 - Math.exp((-2 * Math.PI * this.lp) / this.sampleRate);
    this.khNow = this.hp <= DELAY_HP_OPEN_HZ ? 0 : 1 - Math.exp((-2 * Math.PI * this.hp) / this.sampleRate);
    this.tapeNow = this.tape;
    this.dryNow = Math.cos(this.mix * Math.PI * 0.5);
    this.wetNow = Math.sin(this.mix * Math.PI * 0.5);
    this.pingNow = this.ping;
  }
}
