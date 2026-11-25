import type { DspModule } from '../core/types';

/** Samples per analysis window (about 170 ms at 48 kHz: 6 Hz resolution, so low notes stay narrow). */
export const SPECTRUM_FFT = 8192;
/** A new picture every this many samples (the windows overlap by seven eighths). */
const HOP = 1024;
/** Number of columns of the picture. */
export const SPECTRUM_BANDS = 192;
/** Levels are in dB relative to a full-scale sine (0 dB); anything quieter is shown as this. */
export const SPECTRUM_FLOOR_DB = -160;

/** Lowest frequency of the logarithmic axis (Hz); the lowest column of the linear axis is 0 Hz. */
const F_MIN = 20;
/** Highest frequency shown (Hz), or just below Nyquist at low sample rates. */
const F_MAX = 20000;

/** How fast the bars fall back at the two ends of the Decay knob, in dB per second. */
const FALL_FAST = 400;
const FALL_SLOW = 10;

/** A held peak stays for this long (seconds), then falls at PEAK_FALL dB per second. */
const PEAK_HOLD_SECONDS = 1.2;
const PEAK_FALL = 25;

const TWO_PI = 2 * Math.PI;

/**
 * Spectrum analyser: shows which frequencies are in the sound, low on the left, high on the right.
 * The signals pass through unchanged, so it can sit between two modules.
 *
 * Inputs:  0 L, 1 R.   Outputs: 0 L, 1 R (copies of the inputs).
 *
 * The picture is made from the sum of the connected channels (a single channel counts fully, so a
 * full-scale sine shows 0 dB either way), with a Hann window and an FFT of `SPECTRUM_FFT` samples.
 *
 * Parameters:
 * - "decay": 0..1, how slowly the bars fall back (0 = at once, 1 = very slowly); rising is immediate;
 * - "peak": 0 / 1, a thin line that holds the highest level for a moment;
 * - "scale": 0 = logarithmic frequency axis (how we hear), 1 = linear.
 * The "range" parameter (how many dB the screen shows) only affects drawing and is handled by the panel.
 *
 * Display: `SPECTRUM_BANDS` levels in dB, then `SPECTRUM_BANDS` peak levels in dB. A column holds the
 * loudest bin in its frequency range; where columns are narrower than a bin (the low end of the
 * logarithmic axis) the level is interpolated between bins.
 *
 * Observer: the engine processes it even when its outputs lead nowhere. It never sleeps, but does no
 * FFT while its inputs are silent, and nothing at all once the picture has fallen to silence.
 */
export class Spectrum implements DspModule {
  readonly numInputs = 2;
  readonly numOutputs = 2;
  readonly tailSeconds = Infinity;
  readonly isObserver = true;
  readonly displayLength = 2 * SPECTRUM_BANDS;

  private readonly sampleRate: number;
  private readonly hopSeconds: number;

  // FFT tables.
  private readonly cos = new Float64Array(SPECTRUM_FFT / 2);
  private readonly sin = new Float64Array(SPECTRUM_FFT / 2);
  private readonly bitrev = new Uint16Array(SPECTRUM_FFT);
  private readonly window = new Float64Array(SPECTRUM_FFT);
  private readonly re = new Float64Array(SPECTRUM_FFT);
  private readonly im = new Float64Array(SPECTRUM_FFT);
  /** Level of every bin in dB (only the lower half is used). */
  private readonly binDb = new Float64Array(SPECTRUM_FFT / 2 + 1);

  // Which bins make up each column (see layoutColumns).
  private readonly colFrom = new Int32Array(SPECTRUM_BANDS);
  private readonly colTo = new Int32Array(SPECTRUM_BANDS);
  /** For narrow columns: the fractional bin to read, else -1. */
  private readonly colAt = new Float64Array(SPECTRUM_BANDS);

  private readonly ring = new Float32Array(SPECTRUM_FFT);
  private writePos = 0;
  private sinceHop = 0;
  private silentRun = 0;
  private weightL = 0.5;
  private weightR = 0.5;

  private readonly newDb = new Float64Array(SPECTRUM_BANDS);
  private readonly level = new Float64Array(SPECTRUM_BANDS).fill(SPECTRUM_FLOOR_DB);
  private readonly peakDb = new Float64Array(SPECTRUM_BANDS).fill(SPECTRUM_FLOOR_DB);
  private readonly peakHold = new Float64Array(SPECTRUM_BANDS);
  /** Everything has fallen to the floor: nothing to compute until sound arrives. */
  private settled = true;

  private fallPerHop = 60;
  private showPeaks = false;
  private linear = false;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.hopSeconds = HOP / sampleRate;
    const N = SPECTRUM_FFT;
    for (let k = 0; k < N / 2; k++) {
      this.cos[k] = Math.cos((TWO_PI * k) / N);
      this.sin[k] = -Math.sin((TWO_PI * k) / N);
    }
    const bits = Math.log2(N);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.bitrev[i] = r;
      this.window[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / N);
    }
    this.setParam('decay', 0);
    this.layoutColumns();
  }

  setParam(name: string, value: number): void {
    switch (name) {
      case 'decay': {
        const d = Math.min(1, Math.max(0, value));
        this.fallPerHop = FALL_FAST * Math.pow(FALL_SLOW / FALL_FAST, d) * this.hopSeconds;
        break;
      }
      case 'peak':
        this.showPeaks = value >= 0.5;
        if (!this.showPeaks) {
          this.peakDb.fill(SPECTRUM_FLOOR_DB);
          this.peakHold.fill(0);
        }
        break;
      case 'scale': {
        const linear = value >= 0.5;
        if (linear !== this.linear) {
          this.linear = linear;
          this.layoutColumns();
          // The old picture belongs to the old axis.
          this.level.fill(SPECTRUM_FLOOR_DB);
          this.peakDb.fill(SPECTRUM_FLOOR_DB);
          this.peakHold.fill(0);
          this.settled = true;
        }
        break;
      }
    }
  }

  onConnectionsChanged(connected: readonly boolean[]): void {
    const l = !!connected[0];
    const r = !!connected[1];
    // The sum of the connected channels, scaled so that one channel or two equal ones show alike.
    this.weightL = l && r ? 0.5 : l ? 1 : 0;
    this.weightR = l && r ? 0.5 : r ? 1 : 0;
  }

  /** Work out the bins every column covers, for the current axis. */
  private layoutColumns(): void {
    const N = SPECTRUM_FFT;
    const binHz = this.sampleRate / N;
    const fMax = Math.min(F_MAX, this.sampleRate * 0.49);
    const fMin = this.linear ? 0 : F_MIN;
    const edge = (c: number) =>
      this.linear ? fMin + ((fMax - fMin) * c) / SPECTRUM_BANDS : fMin * Math.pow(fMax / fMin, c / SPECTRUM_BANDS);
    const top = N / 2;
    for (let c = 0; c < SPECTRUM_BANDS; c++) {
      const b0 = edge(c) / binHz;
      const b1 = edge(c + 1) / binHz;
      if (b1 - b0 < 1) {
        // Narrower than a bin: read between the bins around the column's middle.
        this.colAt[c] = Math.min(top - 1e-6, (b0 + b1) / 2);
        this.colFrom[c] = this.colTo[c] = 0;
      } else {
        this.colAt[c] = -1;
        this.colFrom[c] = Math.max(1, Math.ceil(b0));
        this.colTo[c] = Math.min(top, Math.max(this.colFrom[c]!, Math.floor(b1)));
      }
    }
  }

  process(inputs: readonly Float32Array[], silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const a = inputs[0]!;
    const b = inputs[1]!;
    outputs[0]!.set(a.subarray(0, frames));
    outputs[1]!.set(b.subarray(0, frames));

    // Everything has fallen to silence and nothing new comes in: no work at all.
    const quiet = !!silent[0] && !!silent[1];
    if (quiet && this.settled) {
      this.silentRun = SPECTRUM_FFT;
      return;
    }
    this.silentRun = quiet ? this.silentRun + frames : 0;

    const ring = this.ring;
    const wl = this.weightL;
    const wr = this.weightR;
    let pos = this.writePos;
    let since = this.sinceHop;
    for (let i = 0; i < frames; i++) {
      ring[pos] = a[i]! * wl + b[i]! * wr;
      pos = (pos + 1) & (SPECTRUM_FFT - 1);
      if (++since >= HOP) {
        since = 0;
        this.writePos = pos;
        this.analyse();
      }
    }
    this.writePos = pos;
    this.sinceHop = since;
  }

  /** One new picture from the last `SPECTRUM_FFT` samples. */
  private analyse(): void {
    const N = SPECTRUM_FFT;
    const newDb = this.newDb;
    if (this.silentRun >= N) {
      newDb.fill(SPECTRUM_FLOOR_DB); // the window holds only silence
    } else {
      const re = this.re;
      const im = this.im;
      const ring = this.ring;
      const win = this.window;
      const rev = this.bitrev;
      const start = this.writePos;
      for (let i = 0; i < N; i++) {
        re[rev[i]!] = ring[(start + i) & (N - 1)]! * win[i]!;
        im[rev[i]!] = 0;
      }
      const cos = this.cos;
      const sin = this.sin;
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1;
        const step = N / size;
        for (let base = 0; base < N; base += size) {
          for (let j = 0, k = 0; j < half; j++, k += step) {
            const p = base + j;
            const q = p + half;
            const tr = re[q]! * cos[k]! - im[q]! * sin[k]!;
            const ti = re[q]! * sin[k]! + im[q]! * cos[k]!;
            re[q] = re[p]! - tr;
            im[q] = im[p]! - ti;
            re[p] = re[p]! + tr;
            im[p] = im[p]! + ti;
          }
        }
      }
      // |X| * 4 / N is the amplitude of a sine in the middle of a bin (Hann window: gain N / 4), so
      // the level in dB is 10 * log10(power * (4 / N)^2). (Math.hypot is slow; this is not.)
      const norm = (4 / N) * (4 / N);
      const dbPerLn = 10 / Math.LN10;
      const binDb = this.binDb;
      for (let k = 0; k <= N / 2; k++) {
        const power = (re[k]! * re[k]! + im[k]! * im[k]!) * norm;
        binDb[k] = power > 1e-16 ? dbPerLn * Math.log(power) : SPECTRUM_FLOOR_DB;
      }
      for (let c = 0; c < SPECTRUM_BANDS; c++) {
        const at = this.colAt[c]!;
        if (at >= 0) {
          const k = Math.floor(at);
          const f = at - k;
          newDb[c] = binDb[k]! * (1 - f) + binDb[k + 1]! * f;
        } else {
          let m = SPECTRUM_FLOOR_DB;
          for (let k = this.colFrom[c]!; k <= this.colTo[c]!; k++) if (binDb[k]! > m) m = binDb[k]!;
          newDb[c] = m;
        }
      }
    }

    // Bars rise at once and fall back at the chosen speed; peaks hold, then fall.
    const level = this.level;
    const peak = this.peakDb;
    const hold = this.peakHold;
    const fall = this.fallPerHop;
    const peakFall = PEAK_FALL * this.hopSeconds;
    let alive = false;
    for (let c = 0; c < SPECTRUM_BANDS; c++) {
      const x = newDb[c]!;
      const l = Math.max(x, level[c]! - fall);
      level[c] = l > SPECTRUM_FLOOR_DB ? l : SPECTRUM_FLOOR_DB;
      if (this.showPeaks) {
        if (x >= peak[c]!) {
          peak[c] = x;
          hold[c] = PEAK_HOLD_SECONDS;
        } else if (hold[c]! > 0) {
          hold[c] = hold[c]! - this.hopSeconds;
        } else {
          peak[c] = Math.max(SPECTRUM_FLOOR_DB, peak[c]! - peakFall);
        }
        if (peak[c]! > SPECTRUM_FLOOR_DB) alive = true;
      }
      if (level[c]! > SPECTRUM_FLOOR_DB) alive = true;
    }
    this.settled = !alive && this.silentRun >= N;
  }

  readDisplay(out: Float32Array, offset: number): void {
    out.set(this.level, offset);
    out.set(this.peakDb, offset + SPECTRUM_BANDS);
  }

  reset(): void {
    this.ring.fill(0);
    this.writePos = 0;
    this.sinceHop = 0;
    this.silentRun = SPECTRUM_FFT;
    this.level.fill(SPECTRUM_FLOOR_DB);
    this.peakDb.fill(SPECTRUM_FLOOR_DB);
    this.peakHold.fill(0);
    this.settled = true;
  }
}
