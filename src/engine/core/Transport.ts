/**
 * The master transport: tempo and musical position, advanced by the engine block by block.
 *
 * Positions are counted in beats (quarter notes) since Play was pressed. Modules that follow
 * the tempo (the Clock) read the position of the current block and step through it sample by
 * sample, so timing is sample-accurate and never depends on main-thread messages.
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

  /** Back to the start (Play pressed). */
  rewind(): void {
    this.beat = 0;
    this.samples = 0;
    this.anchorSample = 0;
    this.anchorBeat = 0;
  }

  /** Called by the engine before rendering a block. */
  beginBlock(): void {
    if (this.tempo !== this.anchorTempo) {
      this.anchorBeat = this.beat;
      this.anchorSample = this.samples;
      this.anchorTempo = this.tempo;
    }
    this.beatsPerSample = this.tempo / 60 / this.sampleRate;
  }

  /** Called by the engine after rendering a block of `frames` samples. */
  endBlock(frames: number): void {
    this.samples += frames;
    this.beat = this.anchorBeat + (this.samples - this.anchorSample) * this.beatsPerSample;
  }
}
