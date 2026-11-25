import type { DspModule } from '../core/types';

/** Level changes glide over ~20 ms, so turning the knob never clicks. */
const LEVEL_GLIDE_SECONDS = 0.02;
/** Meter peaks fall by about 60 dB in this time. */
const PEAK_RELEASE_SECONDS = 0.3;

/**
 * VCA (voltage-controlled amplifier): the audio input times a gain that follows the cv input.
 *
 * Inputs:  0 audio in, 1 cv (0..1, e.g. an Envelope).
 * Output 0: audio out = in × gain.
 *
 * gain = level + cv × (1 − level), so Level 0 lets only the cv open the VCA, Level 1 leaves it open
 * and in between the cv adds on top of a steady base volume. An unpatched cv counts as 0.
 *
 * Parameter "level" 0..1 (the base volume).
 * Meters: "gain" (the current gain, 0..1), "in" and "out" (peak levels, linear).
 * Always rendered (isObserver), even with nothing on its output, so its panel shows what it does;
 * silent input costs almost nothing.
 */
export class Vca implements DspModule {
  readonly numInputs = 2;
  readonly numOutputs = 1;
  readonly tailSeconds = 0;
  readonly isObserver = true;
  readonly meterNames = ['gain', 'in', 'out'] as const;

  private readonly levelCoef: number;
  private readonly peakCoef: number;
  private level = 0;
  private levelNow = 0;
  private gain = 0;
  private peakIn = 0;
  private peakOut = 0;

  constructor(sampleRate: number) {
    this.levelCoef = Math.exp(-1 / (LEVEL_GLIDE_SECONDS * sampleRate));
    this.peakCoef = Math.exp(-Math.log(1000) / (PEAK_RELEASE_SECONDS * sampleRate));
  }

  setParam(name: string, value: number): void {
    if (name === 'level') this.level = Math.min(1, Math.max(0, value));
  }

  process(inputs: readonly Float32Array[], silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const audio = inputs[0]!;
    const cv = inputs[1]!;
    const out = outputs[0]!;
    const audioSilent = silent[0]!;
    const cvSilent = silent[1]!;
    const target = this.level;
    const lc = this.levelCoef;
    const pc = this.peakCoef;
    let lv = this.levelNow;
    let gain = this.gain;
    let peakIn = this.peakIn;
    let peakOut = this.peakOut;

    for (let i = 0; i < frames; i++) {
      lv = target + (lv - target) * lc;
      const c = cvSilent ? 0 : cv[i]!;
      gain = lv + (c < 0 ? 0 : c > 1 ? 1 : c) * (1 - lv);
      const a = audioSilent ? 0 : audio[i]!;
      const y = a * gain;
      out[i] = y;
      const ai = a < 0 ? -a : a;
      const yo = y < 0 ? -y : y;
      peakIn = ai > peakIn ? ai : peakIn * pc;
      peakOut = yo > peakOut ? yo : peakOut * pc;
    }

    this.levelNow = lv;
    this.gain = gain;
    this.peakIn = peakIn < 1e-6 ? 0 : peakIn;
    this.peakOut = peakOut < 1e-6 ? 0 : peakOut;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.gain;
    out[offset + 1] = this.peakIn;
    out[offset + 2] = this.peakOut;
  }

  reset(): void {
    this.levelNow = this.level;
    this.gain = 0;
    this.peakIn = 0;
    this.peakOut = 0;
  }
}
