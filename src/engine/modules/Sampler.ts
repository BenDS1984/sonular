import type { DspModule, SampleData } from '../core/types';

/** A gate input counts as high above this level and as low again below the lower one. */
const HIGH = 0.6;
const LOW = 0.4;

/** When a new gate restarts the sample, the old playback fades out over this long, so it never clicks. */
const RETRIGGER_FADE_SECONDS = 0.003;
/** The level glides over ~20 ms, so turning the knob never clicks. */
const LEVEL_GLIDE_SECONDS = 0.02;

/**
 * Sampler: plays one sample, started by a gate.
 *
 * Input 0:  gate. Every rising edge starts the sample from "start"; a new gate while it plays
 *           restarts it (the old playback fades out in 3 ms). The sample always plays to its end,
 *           whatever the gate does afterwards.
 * Outputs: 0 L, 1 R (a mono sample comes out on both).
 *
 * Parameters: "tune" in semitones (the sample plays faster or slower, so its pitch follows),
 * "start" 0..1 (where in the sample it begins), "level" 0..1.
 * Meters: "position" (how far the sample has played, 0..1) and "active" (1 while it plays).
 *
 * The audio arrives from the main thread through setSample, as plain arrays. Reading is linear
 * interpolation, at the speed of tune × (the sample's rate / the engine's rate). Costs nothing while
 * no sample plays.
 */
export class Sampler implements DspModule {
  readonly numInputs = 1;
  readonly numOutputs = 2;
  /** Samples play to their end on their own, so the module never goes to sleep. */
  readonly tailSeconds = Infinity;
  /** Its panel shows the playhead, so it keeps running even with nothing on its outputs. */
  readonly isObserver = true;
  readonly meterNames = ['position', 'active'] as const;

  private readonly sampleRate: number;
  private readonly fadeStep: number;
  private readonly levelCoef: number;

  private data: SampleData | null = null;
  private tune = 0;
  private start = 0;
  private level = 0.8;
  private levelNow = 0.8;

  private gateHigh = false;
  // The voice that plays, and the one fading out after a retrigger.
  private pos = 0;
  private active = false;
  private oldPos = 0;
  private oldSpeed = 1;
  private oldGain = 0;
  private oldActive = false;
  private position = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.fadeStep = 1 / (RETRIGGER_FADE_SECONDS * sampleRate);
    this.levelCoef = Math.exp(-1 / (LEVEL_GLIDE_SECONDS * sampleRate));
  }

  setSample(data: SampleData | null): void {
    this.data = data && data.left.length > 1 ? data : null;
    this.active = false;
    this.oldActive = false;
    this.position = 0;
  }

  setParam(name: string, value: number): void {
    switch (name) {
      case 'tune':
        this.tune = Math.min(24, Math.max(-24, value));
        break;
      case 'start':
        this.start = Math.min(1, Math.max(0, value));
        break;
      case 'level':
        this.level = Math.min(1, Math.max(0, value));
        break;
    }
  }

  /** Samples to move through the sample per output sample, for the current tune. */
  private speedNow(data: SampleData): number {
    return Math.pow(2, this.tune / 12) * (data.sampleRate / this.sampleRate);
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const gate = inputs[0]!;
    const outL = outputs[0]!;
    const outR = outputs[1]!;
    const data = this.data;
    let high = this.gateHigh;

    if (!data) {
      // No sample: still follow the gate, so a sample chosen later starts on the next one.
      for (let i = 0; i < frames; i++) {
        const g = gate[i]!;
        if (!high && g > HIGH) high = true;
        else if (high && g < LOW) high = false;
      }
      this.gateHigh = high;
      outL.fill(0, 0, frames);
      outR.fill(0, 0, frames);
      return;
    }

    const left = data.left;
    const right = data.right ?? data.left;
    const length = left.length;
    const last = length - 1;
    const lc = this.levelCoef;
    const levelT = this.level;
    const fadeStep = this.fadeStep;
    const speedNew = this.speedNow(data);
    const startPos = this.start * last;
    let level = this.levelNow;
    let pos = this.pos;
    // A change of tune is heard at once, also while the sample plays.
    let speed = speedNew;
    let active = this.active;
    let oPos = this.oldPos;
    let oSpeed = this.oldSpeed;
    let oGain = this.oldGain;
    let oActive = this.oldActive;

    for (let i = 0; i < frames; i++) {
      const g = gate[i]!;
      if (!high && g > HIGH) {
        high = true;
        if (active) {
          // Move the playing voice to the fading one and begin again.
          oPos = pos;
          oSpeed = speed;
          oGain = 1;
          oActive = true;
        }
        pos = startPos;
        speed = speedNew;
        active = true;
      } else if (high && g < LOW) {
        high = false;
      }
      level = levelT + (level - levelT) * lc;

      let l = 0;
      let r = 0;
      if (active) {
        const i0 = pos | 0;
        const f = pos - i0;
        const i1 = i0 < last ? i0 + 1 : last;
        l = left[i0]! + (left[i1]! - left[i0]!) * f;
        r = right[i0]! + (right[i1]! - right[i0]!) * f;
        pos += speed;
        if (pos >= last) active = false;
      }
      if (oActive) {
        const i0 = oPos | 0;
        const f = oPos - i0;
        const i1 = i0 < last ? i0 + 1 : last;
        l += (left[i0]! + (left[i1]! - left[i0]!) * f) * oGain;
        r += (right[i0]! + (right[i1]! - right[i0]!) * f) * oGain;
        oPos += oSpeed;
        oGain -= fadeStep;
        if (oGain <= 0 || oPos >= last) oActive = false;
      }
      outL[i] = l * level;
      outR[i] = r * level;
    }

    this.levelNow = level;
    this.gateHigh = high;
    this.pos = pos;
    this.active = active;
    this.oldPos = oPos;
    this.oldSpeed = oSpeed;
    this.oldGain = oGain;
    this.oldActive = oActive;
    this.position = active ? pos / last : this.position;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.active ? this.position : 0;
    out[offset + 1] = this.active ? 1 : 0;
  }

  reset(): void {
    this.gateHigh = false;
    this.active = false;
    this.oldActive = false;
    this.position = 0;
    this.levelNow = this.level;
  }
}
