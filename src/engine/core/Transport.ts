/**
 * The master transport: tempo and musical position, advanced by the engine block by block.
 *
 * Positions are counted in beats (quarter notes) from the start of the song. Modules that follow
 * the tempo (the Clock) read the position of the current block and step through it sample by
 * sample, so timing is sample-accurate and never depends on main-thread messages.
 *
 * With the loop on, the position jumps from the loop end back to the loop start on the exact
 * sample. A position already past the loop end (Play started there) runs on without looping.
 * Within a block, the position of sample i is `beat + i * beatsPerSample`, minus `loopLength`
 * once it reaches `wrapAt` (use `beatAt(i)`, or inline the same in hot loops).
 */

export const DEFAULT_TEMPO = 120;
export const MIN_TEMPO = 20;
export const MAX_TEMPO = 300;

export function clampTempo(bpm: number): number {
  return Number.isFinite(bpm) ? Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, bpm)) : DEFAULT_TEMPO;
}

export class Transport {
  readonly sampleRate: number;
  /** Tempo in beats per minute. A change takes effect at the next block. */
  tempo = DEFAULT_TEMPO;
  /** Position in beats at the first sample of the current block. */
  beat = 0;
  /** Beats advanced per sample during the current block. */
  beatsPerSample: number;
  /** Where the position jumps back during the current block (Infinity: it does not). */
  wrapAt = Infinity;
  /** How far it jumps back. */
  loopLength = 0;

  private loopOn = false;
  private loopStart = 0;
  private loopEnd = 0;

  // The position is computed from a whole number of samples since the last tempo change rather
  // than added up block by block, so rounding errors never accumulate.
  private samples = 0;
  private anchorSample = 0;
  private anchorBeat = 0;
  private anchorTempo = DEFAULT_TEMPO;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.beatsPerSample = this.tempo / 60 / sampleRate;
  }

  setTempo(bpm: number): void {
    this.tempo = clampTempo(bpm);
  }

  /** Loop on or off, between two positions in beats. A change takes effect at the next block. */
  setLoop(on: boolean, start: number, end: number): void {
    const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
    this.loopOn = on && valid;
    if (valid) {
      this.loopStart = start;
      this.loopEnd = end;
    }
  }

  /** Jump to a position in beats (Play pressed, or the playhead moved while playing). */
  rewind(beat = 0): void {
    this.beat = Number.isFinite(beat) ? Math.max(0, beat) : 0;
    this.samples = 0;
    this.anchorSample = 0;
    this.anchorBeat = this.beat;
  }

  /** Position of sample `i` of the current block, in beats. */
  beatAt(i: number): number {
    const b = this.beat + i * this.beatsPerSample;
    return b >= this.wrapAt ? b - this.loopLength : b;
  }

  /** Called by the engine before rendering a block. */
  beginBlock(): void {
    if (this.tempo !== this.anchorTempo) {
      this.anchorBeat = this.beat;
      this.anchorSample = this.samples;
      this.anchorTempo = this.tempo;
    }
    this.beatsPerSample = this.tempo / 60 / this.sampleRate;
    const looping = this.loopOn && this.beat < this.loopEnd;
    // A hair early, so a jump due exactly on a sample never lands one sample late through rounding.
    this.wrapAt = looping ? this.loopEnd - 1e-9 : Infinity;
    this.loopLength = looping ? this.loopEnd - this.loopStart : 0;
  }

  /** Called by the engine after rendering a block of `frames` samples. */
  endBlock(frames: number): void {
    this.samples += frames;
    const beat = this.anchorBeat + (this.samples - this.anchorSample) * this.beatsPerSample;
    if (beat >= this.wrapAt) {
      // Jumped back during this block: shift the anchor so later positions continue from there.
      this.anchorBeat -= this.loopLength;
      this.beat = beat - this.loopLength;
    } else {
      this.beat = beat;
    }
  }
}
