import type { DspModule } from '../core/types';
import { parseStepParam, SEQUENCER_BANKS, SEQUENCER_STEPS } from '../../modules/sequencer/banks';

/** A clock input counts as high above this level and as low again below the lower one. */
const HIGH = 0.6;
const LOW = 0.4;

/**
 * Sequencer: eight steps, each with a pitch and an on/off switch, advanced by a clock, in eight
 * patterns (banks A–H) of which the one chosen on the module plays.
 *
 * Input 0: clock. Every rising edge moves to the next step (the first edge plays step 1).
 * Output 0: pitch, 1 per octave, 0 = C4 (the step's semitones / 12). Changes exactly on the
 *           clock edge and holds between edges, so a release tail keeps its note.
 * Output 1: gate. Follows the clock pulse while the current step is on; stays low on steps
 *           that are off.
 *
 * Parameters: "pitch1".."pitch8" in semitones (−24..+24 around C4), "on1".."on8" (0/1) for pattern
 * A, "b2pitch1".."b8on8" for the others, and "bank" (0..7), the pattern that plays. Switching
 * pattern while playing keeps the step going: the next step is simply read from the new pattern.
 * Meter "step": the current step, 1..8 (0 before the first clock edge).
 */
export class Sequencer implements DspModule {
  readonly numInputs = 1;
  readonly numOutputs = 2;
  /** Holds its pitch indefinitely, so it never sleeps. */
  readonly tailSeconds = Infinity;
  /**
   * Keeps running (with the clock that feeds it) even when nothing is connected to its outputs, so
   * its panel shows the step it is on. It costs next to nothing: eight steps and a clock edge.
   */
  readonly isObserver = true;
  readonly meterNames = ['step'] as const;

  /** All patterns after each other: pattern b, step s at b * 8 + s. */
  private readonly pitch = new Float32Array(SEQUENCER_BANKS * SEQUENCER_STEPS);
  private readonly on = new Uint8Array(SEQUENCER_BANKS * SEQUENCER_STEPS);
  /** Offset of the chosen pattern (parameter "bank") in the arrays. */
  private base = 0;
  /** Current step index, −1 before the first clock edge. */
  private step = -1;
  private clockHigh = false;

  setParam(name: string, value: number): void {
    if (name === 'bank') {
      const b = Math.round(value);
      this.base = (b >= 0 && b < SEQUENCER_BANKS ? b : 0) * SEQUENCER_STEPS;
      return;
    }
    const p = parseStepParam(name);
    if (!p) return;
    const i = p.bank * SEQUENCER_STEPS + p.step;
    if (p.kind === 'pitch') this.pitch[i] = Math.round(value) / 12;
    else this.on[i] = value >= 0.5 ? 1 : 0;
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const clock = inputs[0]!;
    const pitchOut = outputs[0]!;
    const gateOut = outputs[1]!;
    let step = this.step;
    let high = this.clockHigh;
    for (let i = 0; i < frames; i++) {
      const c = clock[i]!;
      if (!high && c > HIGH) {
        high = true;
        step = (step + 1) % SEQUENCER_STEPS;
      } else if (high && c < LOW) {
        high = false;
      }
      const s = this.base + (step < 0 ? 0 : step);
      pitchOut[i] = this.pitch[s]!;
      gateOut[i] = high && step >= 0 && this.on[s] ? 1 : 0;
    }
    this.step = step;
    this.clockHigh = high;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.step + 1;
  }

  reset(): void {
    this.step = -1;
    this.clockHigh = false;
  }
}
