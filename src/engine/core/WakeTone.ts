/**
 * A warm-up tone before the sound starts after a long silence.
 *
 * Some sound hardware (laptop speaker amplifiers, USB interfaces) powers down after a while of digital
 * silence and needs a few milliseconds to wake up when sound arrives, so the first part of the music
 * is cut off or crackles. If Play is pressed after the output has been silent for a while, a very
 * soft noise (about -90 dBFS, far below what any speaker or ear can use) is sent for a short time
 * first: the hardware wakes up on that, and the music then starts on an awake device. After a short
 * pause nothing is added, so Play starts at once.
 *
 * Plain TypeScript (no browser APIs), so it can be tested in Node.
 */

/** Silence for longer than this (ms) makes the next Play start with the warm-up tone. */
export const WAKE_IDLE_MS = 10_000;
/** How long the warm-up tone lasts, in seconds. */
export const WAKE_SECONDS = 0.1;
/** Peak level of the tone: about one step of a 16-bit sound card (-90 dBFS). */
export const WAKE_LEVEL = 3e-5;

export class WakeTone {
  private readonly frames: number;
  private readonly random: () => number;
  /** Frames of the tone still to send (0: not warming up). */
  private remaining = 0;
  /** Wall-clock time (ms) sound was last made; before any sound, never. */
  private lastSound = -Infinity;

  constructor(sampleRate: number, random: () => number = Math.random) {
    this.frames = Math.max(1, Math.round(WAKE_SECONDS * sampleRate));
    this.random = random;
  }

  /** Sound is being made (or fading out) at wall-clock time `nowMs`: the device is awake. */
  heard(nowMs: number): void {
    this.lastSound = nowMs;
  }

  /**
   * Play was pressed from silence at `nowMs`: starts the warm-up when the output has been silent for
   * long, and says whether it did.
   */
  begin(nowMs: number): boolean {
    this.remaining = nowMs - this.lastSound > WAKE_IDLE_MS ? this.frames : 0;
    return this.remaining > 0;
  }

  /** Whether the warm-up tone is being sent. */
  get active(): boolean {
    return this.remaining > 0;
  }

  /** Stop before the sound started (Stop was pressed during the warm-up). */
  cancel(): void {
    this.remaining = 0;
  }

  /**
   * Fill the next `frames` of both channels with the tone. Returns true when the warm-up is over:
   * the sound can start with the next piece.
   */
  fill(L: Float32Array, R: Float32Array, frames: number): boolean {
    for (let i = 0; i < frames; i++) {
      L[i] = (this.random() * 2 - 1) * WAKE_LEVEL;
      R[i] = (this.random() * 2 - 1) * WAKE_LEVEL;
    }
    this.remaining -= frames;
    if (this.remaining <= 0) {
      this.remaining = 0;
      return true;
    }
    return false;
  }
}
