import type { DspModule } from '../core/types';

/** Level changes glide over ~20 ms, so turning a knob never jumps the output. */
const LEVEL_GLIDE_SECONDS = 0.02;

/**
 * CV Mix, as in VCV Rack: three signals, each scaled by its own knob, added together.
 *
 * Inputs 0..2: in 1..3 (any signal; an unpatched input counts as 0).
 * Output 0: mix = in1 × level1 + in2 × level2 + in3 × level3.
 *
 * Parameters: "level1".."level3", −1..+1 (0 = off, −1 flips the signal, so inputs can be
 * subtracted); "polarity" 0 bipolar (the plain sum) / 1 unipolar (the sum squeezed into 0..1:
 * 0.5 × sum + 0.5, then limited to 0..1, handy for patching onto a knob).
 */
export class CvMix implements DspModule {
  readonly numInputs = 3;
  readonly numOutputs = 1;
  readonly tailSeconds = 0;

  private readonly coef: number;
  private readonly target = new Float64Array(3);
  private readonly now = new Float64Array(3);
  private unipolar = false;

  constructor(sampleRate: number) {
    this.coef = Math.exp(-1 / (LEVEL_GLIDE_SECONDS * sampleRate));
  }

  setParam(name: string, value: number): void {
    if (name === 'level1' || name === 'level2' || name === 'level3') {
      this.target[Number(name[5]) - 1] = Math.min(1, Math.max(-1, value));
    } else if (name === 'polarity') {
      this.unipolar = value >= 0.5;
    }
  }

  process(inputs: readonly Float32Array[], silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const out = outputs[0]!;
    const in1 = inputs[0]!;
    const in2 = inputs[1]!;
    const in3 = inputs[2]!;
    const s1 = silent[0]!;
    const s2 = silent[1]!;
    const s3 = silent[2]!;
    const c = this.coef;
    const t1 = this.target[0]!;
    const t2 = this.target[1]!;
    const t3 = this.target[2]!;
    let g1 = this.now[0]!;
    let g2 = this.now[1]!;
    let g3 = this.now[2]!;
    const unipolar = this.unipolar;

    for (let i = 0; i < frames; i++) {
      g1 = t1 + (g1 - t1) * c;
      g2 = t2 + (g2 - t2) * c;
      g3 = t3 + (g3 - t3) * c;
      let sum = 0;
      if (!s1) sum += in1[i]! * g1;
      if (!s2) sum += in2[i]! * g2;
      if (!s3) sum += in3[i]! * g3;
      if (unipolar) {
        sum = 0.5 * sum + 0.5;
        sum = sum < 0 ? 0 : sum > 1 ? 1 : sum;
      }
      out[i] = sum;
    }

    this.now[0] = Math.abs(g1 - t1) < 1e-6 ? t1 : g1;
    this.now[1] = Math.abs(g2 - t2) < 1e-6 ? t2 : g2;
    this.now[2] = Math.abs(g3 - t3) < 1e-6 ? t3 : g3;
  }

  reset(): void {
    for (let k = 0; k < 3; k++) this.now[k] = this.target[k]!;
  }
}
