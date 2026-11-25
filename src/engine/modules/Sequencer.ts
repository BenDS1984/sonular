import type { DspModule } from '../core/types';
import { parseLenParam, parseStepParam, SEQUENCER_BANKS, SEQUENCER_STEPS } from '../../modules/sequencer/banks';

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
 * "len" (1..8, "b2len".. for the others) is how many steps of a pattern play before it starts over.
 * Input 1: pattern (optional). With a cable patched in, 0..1 is spread over "range" patterns (1..8, default 8) and
 * added to the pattern chosen with the knob (wrapping from H to A). It is read on each clock pulse, so the
 * new pattern starts with the next step.
 * Meters: "step", the current step, 1..8 (0 before the first clock edge); "pattern", the pattern that
 * plays, 0..7.
 */
export class Sequencer implements DspModule {
  readonly numInputs = 2;
  readonly numOutputs = 2;
  /** Holds its pitch indefinitely, so it never sleeps. */
  readonly tailSeconds = Infinity;
  /**
   * Keeps running (with the clock that feeds it) even when nothing is connected to its outputs, so
   * its panel shows the step it is on. It costs next to nothing: eight steps and a clock edge.
   */
  readonly isObserver = true;
  readonly meterNames = ['step', 'pattern'] as const;

  /** All patterns after each other: pattern b, step s at b * 8 + s. */
  private readonly pitch = new Float32Array(SEQUENCER_BANKS * SEQUENCER_STEPS);
  private readonly on = new Uint8Array(SEQUENCER_BANKS * SEQUENCER_STEPS);
  /** Offset of the chosen pattern (parameter "bank") in the arrays. */
  private base = 0;
  /** Length of each pattern, 1..8. */
  private readonly len = new Uint8Array(SEQUENCER_BANKS).fill(SEQUENCER_STEPS);
  /** Length of the chosen pattern. */
  private curLen = SEQUENCER_STEPS;
  /** The pattern chosen with the knob (parameter "bank"). */
  private bankIndex = 0;
  /** Whether a cable is patched into the pattern input, and the pattern shift it last asked for (0..7). */
  private cvConnected = false;
  private cvOffset = 0;
  /** How many patterns the cv input spans, 1..8 (parameter "range"). */
  private range = SEQUENCER_BANKS;
  /** The pattern that plays: the knob plus the cv shift, wrapping around. */
  private activeBank = 0;
  /** Current step index, −1 before the first clock edge. */
  private step = -1;
  private clockHigh = false;

  setParam(name: string, value: number): void {
    if (name === 'bank') {
      const b = Math.round(value);
      this.bankIndex = b >= 0 && b < SEQUENCER_BANKS ? b : 0;
      this.applyBank();
      return;
    }
    if (name === 'range') {
      this.range = Math.min(SEQUENCER_BANKS, Math.max(1, Math.round(value)));
      // A smaller range may leave the shift beyond it: bring it back inside.
      if (this.cvOffset >= this.range) this.cvOffset = this.range - 1;
      this.applyBank();
      return;
    }
    const lb = parseLenParam(name);
    if (lb !== null) {
      this.len[lb] = Math.min(SEQUENCER_STEPS, Math.max(1, Math.round(value)));
      this.applyBank();
      return;
    }
    const p = parseStepParam(name);
    if (!p) return;
    const i = p.bank * SEQUENCER_STEPS + p.step;
    if (p.kind === 'pitch') this.pitch[i] = Math.round(value) / 12;
    else this.on[i] = value >= 0.5 ? 1 : 0;
  }

  /** Work out which pattern plays: the knob plus the cv shift, wrapping from H back to A. */
  private applyBank(): void {
    this.activeBank = (this.bankIndex + this.cvOffset) % SEQUENCER_BANKS;
    this.base = this.activeBank * SEQUENCER_STEPS;
    this.curLen = this.len[this.activeBank]!;
  }

  onConnectionsChanged(inputsConnected: readonly boolean[]): void {
    this.cvConnected = !!inputsConnected[1];
    if (!this.cvConnected) this.cvOffset = 0;
    this.applyBank();
  }

  /** The pattern shift a cv value asks for: 0..1 is spread over the patterns of the range, the first (low) to the last (high). */
  private shiftFor(cv: number): number {
    const n = Math.floor(cv * this.range);
    return n < 0 ? 0 : n >= this.range ? this.range - 1 : n;
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const clock = inputs[0]!;
    const cv = inputs[1]!;
    const pitchOut = outputs[0]!;
    const gateOut = outputs[1]!;
    let step = this.step;
    let high = this.clockHigh;
    // Before the first clock pulse there is no step to wait for: follow the cv straight away.
    if (this.cvConnected && step < 0) this.setShift(this.shiftFor(cv[0]!));
    for (let i = 0; i < frames; i++) {
      const c = clock[i]!;
      if (!high && c > HIGH) {
        high = true;
        // The pattern is chosen on the pulse, so it changes with the next step and never mid-step.
        if (this.cvConnected) this.setShift(this.shiftFor(cv[i]!));
        step = (step + 1) % this.curLen;
      } else if (high && c < LOW) {
        high = false;
      }
      // A pattern shortened while playing may leave the step beyond its end: wrap it at once.
      if (step >= this.curLen) step = 0;
      const s = this.base + (step < 0 ? 0 : step);
      pitchOut[i] = this.pitch[s]!;
      gateOut[i] = high && step >= 0 && this.on[s] ? 1 : 0;
    }
    this.step = step;
    this.clockHigh = high;
  }

  private setShift(shift: number): void {
    if (shift === this.cvOffset) return;
    this.cvOffset = shift;
    this.applyBank();
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.step + 1;
    out[offset + 1] = this.activeBank;
  }

  reset(): void {
    this.step = -1;
    this.clockHigh = false;
  }
}
