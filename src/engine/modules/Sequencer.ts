import type { DspModule } from '../core/types';

export const SEQUENCER_STEPS = 8;

/** A clock input counts as high above this level and as low again below the lower one. */
const HIGH = 0.6;
const LOW = 0.4;

/**
 * Sequencer: eight steps, each with a pitch and an on/off switch, advanced by a clock.
 *
 * Input 0: clock. Every rising edge moves to the next step (the first edge plays step 1).
 * Output 0: pitch, 1 per octave, 0 = C4 (the step's semitones / 12). Changes exactly on the
 *           clock edge and holds between edges, so a release tail keeps its note.
 * Output 1: gate. Follows the clock pulse while the current step is on; stays low on steps
 *           that are off.
 *
 * Parameters: "pitch1".."pitch8" in semitones (−24..+24 around C4), "on1".."on8" (0/1).
 * Meter "step": the current step, 1..8 (0 before the first clock edge).
 */
export class Sequencer implements DspModule {
  readonly numInputs = 1;
  readonly numOutputs = 2;
  /** Holds its pitch indefinitely, so it never sleeps. */
  readonly tailSeconds = Infinity;
  readonly meterNames = ['step'] as const;

  private readonly pitch = new Float32Array(SEQUENCER_STEPS);
  private readonly on = new Uint8Array(SEQUENCER_STEPS).fill(1);
  /** Current step index, −1 before the first clock edge. */
  private step = -1;
  private clockHigh = false;

  setParam(name: string, value: number): void {
    if (name.startsWith('pitch')) {
      const s = Number(name.slice(5)) - 1;
      if (s >= 0 && s < SEQUENCER_STEPS) this.pitch[s] = Math.round(value) / 12;
    } else if (name.startsWith('on')) {
      const s = Number(name.slice(2)) - 1;
      if (s >= 0 && s < SEQUENCER_STEPS) this.on[s] = value >= 0.5 ? 1 : 0;
    }
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
      const s = step < 0 ? 0 : step;
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
