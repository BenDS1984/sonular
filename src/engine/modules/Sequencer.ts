import { parseStepParam, SEQUENCER_BANKS, SEQUENCER_STEPS } from '../../modules/sequencer/banks';
import type { DspModule, EngineClip } from '../core/types';
import type { Transport } from '../core/Transport';

/** A clock input counts as high above this level and as low again below the lower one. */
const HIGH = 0.6;
const LOW = 0.4;
/** Same tiny offset as the Clock, so a block and a pulse due on the same sample line up. */
const EPS = 1e-9;

/** A timeline block in the form the audio loop reads: its range and the bank it plays. */
interface Block {
  start: number;
  end: number;
  /** Offset of the bank's first step in the pitch/on arrays. */
  base: number;
}

/**
 * Sequencer: eight steps, each with a pitch and an on/off switch, advanced by a clock, in eight
 * banks (see src/modules/sequencer/banks.ts).
 *
 * Input 0: clock. Every rising edge moves to the next step (the first edge plays step 1).
 * Output 0: pitch, 1 per octave, 0 = C4 (the step's semitones / 12). Changes exactly on the
 *           clock edge and holds between edges, so a release tail keeps its note.
 * Output 1: gate. Follows the clock pulse while the current step is on; stays low on steps
 *           that are off.
 *
 * Parameters: "pitch1".."pitch8" in semitones (−24..+24 around C4), "on1".."on8" (0/1) for
 * bank 1, "b2pitch1".."b8on8" for banks 2..8, and "bank": the bank chosen on the module (0..7).
 * Meters: "step", the current step 1..8 (0 before the first clock edge or outside blocks);
 * "bank", the bank playing 1..8 (0 outside blocks).
 *
 * Timeline blocks (`setClips`): when the sequencer has blocks, it plays only inside them, each
 * with the block's bank, and starts at step 1 when a block begins (also when the loop jumps back
 * into a block, or playback starts inside one). Outside blocks the gate stays low and the pitch
 * holds. All of this follows the transport position sample by sample. Without blocks it plays the
 * bank chosen on the module all the time; switching banks keeps the current step.
 */
export class Sequencer implements DspModule {
  readonly numInputs = 1;
  readonly numOutputs = 2;
  /** Holds its pitch indefinitely, so it never sleeps. */
  readonly tailSeconds = Infinity;
  readonly keepsTime = true;
  readonly meterNames = ['step', 'bank'] as const;

  private readonly transport: Transport | null;
  /** All banks after each other: bank b, step s at b * 8 + s. */
  private readonly pitch = new Float32Array(SEQUENCER_BANKS * SEQUENCER_STEPS);
  private readonly on = new Uint8Array(SEQUENCER_BANKS * SEQUENCER_STEPS).fill(1);
  /** Offset of the chosen bank (parameter "bank") in the arrays. */
  private base = 0;
  /** Current step index, −1 before the first clock edge. */
  private step = -1;
  private clockHigh = false;

  /** Timeline blocks, sorted by start. Empty: no timeline, play the chosen bank. */
  private blocks: Block[] = [];
  /** Index of the block being played, −1 outside blocks. */
  private current = -1;
  /** Position of the previous sample, to notice jumps back (loop, playhead moved). */
  private lastBeat = -Infinity;
  /** Outside blocks: where the next block starts (−Infinity: look on the next sample). */
  private next = -Infinity;
  /** Pitch while outside blocks: the last one played. */
  private heldPitch = 0;

  constructor(transport?: Transport) {
    this.transport = transport ?? null;
  }

  setParam(name: string, value: number): void {
    if (name === 'bank') {
      this.base = clampBank(value) * SEQUENCER_STEPS;
      return;
    }
    const p = parseStepParam(name);
    if (!p) return;
    const i = p.bank * SEQUENCER_STEPS + p.step;
    if (p.kind === 'pitch') this.pitch[i] = Math.round(value) / 12;
    else this.on[i] = value >= 0.5 ? 1 : 0;
  }

  /** Replace the timeline blocks (called from the message handler, not the audio loop). */
  setClips(clips: readonly EngineClip[]): void {
    const blocks = clips
      .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
      .map((c): Block => ({ start: c.start, end: c.end, base: clampBank(c.bank) * SEQUENCER_STEPS }))
      .sort((a, b) => a.start - b.start);
    // Keep playing the same block when it is still there (an edit while playing), else find it
    // again on the next sample.
    const old = this.blocks[this.current];
    this.blocks = blocks;
    this.current = old ? blocks.findIndex((b) => b.start === old.start && b.end === old.end) : -1;
    this.next = -Infinity;
  }

  /** Index of the block containing `beat`, or −1. */
  private blockAt(beat: number): number {
    const blocks = this.blocks;
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k]!;
      if (beat < b.start) return -1;
      if (beat < b.end) return k;
    }
    return -1;
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    if (this.blocks.length > 0 && this.transport) this.processBlocks(inputs[0]!, outputs[0]!, outputs[1]!, frames, this.transport);
    else this.processFree(inputs[0]!, outputs[0]!, outputs[1]!, frames);
  }

  /** No timeline: the chosen bank, all the time. */
  private processFree(clock: Float32Array, pitchOut: Float32Array, gateOut: Float32Array, frames: number) {
    let step = this.step;
    let high = this.clockHigh;
    const base = this.base;
    for (let i = 0; i < frames; i++) {
      const c = clock[i]!;
      if (!high && c > HIGH) {
        high = true;
        step = (step + 1) % SEQUENCER_STEPS;
      } else if (high && c < LOW) {
        high = false;
      }
      const s = base + (step < 0 ? 0 : step);
      pitchOut[i] = this.pitch[s]!;
      gateOut[i] = high && step >= 0 && this.on[s] ? 1 : 0;
    }
    this.step = step;
    this.clockHigh = high;
    this.heldPitch = pitchOut[frames - 1] ?? this.heldPitch;
  }

  /** With timeline blocks: only inside blocks, each with its bank. */
  private processBlocks(clock: Float32Array, pitchOut: Float32Array, gateOut: Float32Array, frames: number, t: Transport) {
    const blocks = this.blocks;
    const start = t.beat + EPS;
    const perSample = t.beatsPerSample;
    const wrapAt = t.wrapAt;
    const loopLength = t.loopLength;
    let step = this.step;
    let high = this.clockHigh;
    let current = this.current;
    let lastBeat = this.lastBeat;
    let next = this.next;
    let held = this.heldPitch;
    let block = current >= 0 ? blocks[current] : undefined;
    for (let i = 0; i < frames; i++) {
      let beat = start + i * perSample;
      if (beat >= wrapAt) beat -= loopLength;
      // Entered another block, left one, or jumped back (loop, playhead): look again.
      if (beat < lastBeat || (block ? beat >= block.end : beat >= next)) {
        const found = this.blockAt(beat);
        if (found !== current || beat < lastBeat) step = -1; // a block (re)starts at step 1
        current = found;
        block = found >= 0 ? blocks[found] : undefined;
        next = found >= 0 ? Infinity : this.nextStart(beat);
      }
      lastBeat = beat;
      const c = clock[i]!;
      if (!high && c > HIGH) {
        high = true;
        step = (step + 1) % SEQUENCER_STEPS;
      } else if (high && c < LOW) {
        high = false;
      }
      if (block) {
        const s = block.base + (step < 0 ? 0 : step);
        held = this.pitch[s]!;
        gateOut[i] = high && step >= 0 && this.on[s] ? 1 : 0;
      } else {
        gateOut[i] = 0;
      }
      pitchOut[i] = held;
    }
    this.step = step;
    this.clockHigh = high;
    this.current = current;
    this.lastBeat = lastBeat;
    this.next = next;
    this.heldPitch = held;
  }

  /** Start of the first block after `beat` (Infinity when there is none). */
  private nextStart(beat: number): number {
    const blocks = this.blocks;
    for (let k = 0; k < blocks.length; k++) if (blocks[k]!.start > beat) return blocks[k]!.start;
    return Infinity;
  }

  readMeters(out: Float32Array, offset: number): void {
    if (this.blocks.length > 0 && this.transport) {
      const block = this.blocks[this.current];
      out[offset] = block ? this.step + 1 : 0;
      out[offset + 1] = block ? block.base / SEQUENCER_STEPS + 1 : 0;
    } else {
      out[offset] = this.step + 1;
      out[offset + 1] = this.base / SEQUENCER_STEPS + 1;
    }
  }

  reset(): void {
    this.step = -1;
    this.clockHigh = false;
    this.current = -1;
    this.lastBeat = -Infinity;
    this.next = -Infinity;
  }
}

/** A bank number brought into range (whole, 0..7). */
function clampBank(bank: number): number {
  return Number.isFinite(bank) ? Math.min(SEQUENCER_BANKS - 1, Math.max(0, Math.round(bank))) : 0;
}
