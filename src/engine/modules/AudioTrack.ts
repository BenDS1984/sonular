import { BLOCK_SIZE, type EngineAudioClip, type SinkModule } from '../core/types';
import type { SampleBank, SampleData } from '../core/SampleBank';
import type { Transport } from '../core/Transport';

/** Fade at the edges of a clip (and when playing starts in the middle of one): no clicks. */
const EDGE_FADE_SECONDS = 0.003;
/** Level changes glide, like the patch channels' faders (same smoothing). */
const LEVEL_SMOOTH_HZ = 44.1;
/** How fast the meter falls back after a peak. */
const METER_FALL_SECONDS = 0.25;

interface ClipState {
  clip: EngineAudioClip;
  data: SampleData | undefined;
  active: boolean;
  /** Position in the sample, in the sample's own frames. */
  cursor: number;
  /** Output frames played since the clip started (or playing resumed in it). */
  age: number;
}

/**
 * An audio track: plays the samples of its clips while the song position is inside them, into a
 * stereo channel of its own on the master bus (a sink, like a patch's Channel).
 *
 * Each clip follows the transport: where the song is in the clip decides where in the sample it
 * plays. When the position jumps (Play, the playhead moved, the loop turned round) or the track
 * was not rendering (muted), the clip finds its place again; otherwise it just plays on, at the
 * sample's own speed, whatever the tempo does. Samples play with linear interpolation.
 */
export class AudioTrack implements SinkModule {
  readonly isSink = true;
  readonly numInputs = 0;
  readonly numOutputs = 0;
  readonly tailSeconds = 0;
  readonly outL = new Float32Array(BLOCK_SIZE);
  readonly outR = new Float32Array(BLOCK_SIZE);
  readonly meterNames = ['meterL', 'meterR'] as const;

  private readonly sampleRate: number;
  private readonly transport: Transport;
  private readonly bank: SampleBank;
  private states: ClipState[] = [];
  /** Clips that may sound in the current block (indexes into `states`). */
  private near = new Int32Array(0);
  /** Position of the previous sample, to see when the song position jumped. */
  private lastBeat = NaN;
  private level = 1;
  private levelTarget = 1;
  private readonly levelCoef: number;
  private readonly fadeFrames: number;
  private peakL = 0;
  private peakR = 0;
  private readonly meterFall: number;

  constructor(sampleRate: number, transport: Transport, bank: SampleBank) {
    this.sampleRate = sampleRate;
    this.transport = transport;
    this.bank = bank;
    this.levelCoef = LEVEL_SMOOTH_HZ / sampleRate;
    this.fadeFrames = Math.max(1, Math.round(EDGE_FADE_SECONDS * sampleRate));
    this.meterFall = Math.exp(-BLOCK_SIZE / (METER_FALL_SECONDS * sampleRate));
  }

  setParam(name: string, value: number): void {
    if (name === 'level' && Number.isFinite(value)) this.levelTarget = Math.max(0, value);
  }

  /** Replace the clips (sorted by start). Clips that stay the same keep playing. */
  setAudioClips(clips: readonly EngineAudioClip[]): void {
    const old = this.states;
    this.states = clips.map((clip) => {
      const same = old.find(
        (s) => s.clip.sample === clip.sample && s.clip.start === clip.start && s.clip.end === clip.end && s.clip.offset === clip.offset,
      );
      return same
        ? { ...same, clip }
        : { clip, data: undefined, active: false, cursor: 0, age: 0 };
    });
    this.near = new Int32Array(this.states.length);
  }

  process(_inputs: readonly Float32Array[], _silent: readonly boolean[], _outputs: readonly Float32Array[], frames: number): void {
    const outL = this.outL;
    const outR = this.outR;
    outL.fill(0, 0, frames);
    outR.fill(0, 0, frames);

    const t = this.transport;
    const states = this.states;
    // Which clips can sound in this block: those that overlap its stretch of song. Around a loop
    // turn the stretch is two pieces, so every clip is looked at.
    let count = 0;
    const first = t.beat;
    const last = t.beatAt(frames - 1);
    const wraps = t.wrapAt !== Infinity;
    for (let k = 0; k < states.length; k++) {
      const s = states[k]!;
      if (s.data === undefined) {
        s.data = this.bank.get(s.clip.sample);
        if (s.data === undefined) continue;
      }
      if (wraps || (s.clip.start <= last + t.beatsPerSample && s.clip.end >= first)) this.near[count++] = k;
      else s.active = false;
    }

    const bps = t.beatsPerSample;
    const secondsPerBeat = 60 / t.tempo;
    let lastBeat = this.lastBeat;
    let gain = this.level;
    const target = this.levelTarget;
    const fade = this.fadeFrames;
    const outRate = this.sampleRate;
    for (let i = 0; i < frames; i++) {
      const b = t.beatAt(i);
      // The position did not move on by one sample: Play, a jump of the playhead or the loop.
      const jumped = !(Math.abs(b - lastBeat - bps) <= bps * 0.5 + 1e-12);
      lastBeat = b;
      if (gain !== target) {
        gain += (target - gain) * this.levelCoef;
        if (Math.abs(target - gain) < 1e-5) gain = target;
      }
      let l = 0;
      let r = 0;
      for (let n = 0; n < count; n++) {
        const s = states[this.near[n]!]!;
        const data = s.data;
        if (!data) continue;
        const c = s.clip;
        if (jumped) s.active = false;
        if (b < c.start || b >= c.end) {
          s.active = false;
          continue;
        }
        if (!s.active) {
          s.active = true;
          s.age = 0;
          s.cursor = (c.offset + (b - c.start) * secondsPerBeat) * data.rate;
        }
        const pos = s.cursor;
        const i0 = Math.floor(pos);
        if (i0 >= 0 && i0 < data.length) {
          const frac = pos - i0;
          const i1 = i0 + 1 < data.length ? i0 + 1 : i0;
          let g = 1;
          if (s.age < fade) g = s.age / fade;
          const toEnd = (c.end - b) / bps;
          if (toEnd < fade) g *= toEnd / fade;
          const a = data.left[i0]!;
          l += (a + (data.left[i1]! - a) * frac) * g;
          const a2 = data.right[i0]!;
          r += (a2 + (data.right[i1]! - a2) * frac) * g;
        }
        s.cursor = pos + data.rate / outRate;
        s.age++;
      }
      outL[i] = l * gain;
      outR[i] = r * gain;
    }
    this.lastBeat = lastBeat;
    this.level = gain;

    let pl = this.peakL * this.meterFall;
    let pr = this.peakR * this.meterFall;
    for (let i = 0; i < frames; i++) {
      const al = Math.abs(outL[i]!);
      const ar = Math.abs(outR[i]!);
      if (al > pl) pl = al;
      if (ar > pr) pr = ar;
    }
    this.peakL = pl;
    this.peakR = pr;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.peakL;
    out[offset + 1] = this.peakR;
  }

  reset(): void {
    this.lastBeat = NaN;
    this.peakL = 0;
    this.peakR = 0;
    for (const s of this.states) s.active = false;
    this.outL.fill(0);
    this.outR.fill(0);
  }
}
