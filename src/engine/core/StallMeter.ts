/**
 * Notices when the audio thread is called late: the sound card did not ask for more sound for a
 * moment, so what is heard stops for that long (a hang or stutter). That has nothing to do with how
 * much the engine computes: it points at the computer or the browser (power saving, a sleeping
 * sound chip, a busy system), not at Sonular's sound code.
 *
 * Called at the start of every audio callback with the wall-clock time. Normal callbacks come in
 * small groups at the rhythm of the sound card's buffer (about 20 ms); only a gap well above that
 * counts. Plain TypeScript, so it can be tested in Node.
 */

/** A gap between two audio callbacks longer than this (ms) counts as a stall. */
export const STALL_MS = 50;

export class StallMeter {
  /** Stalls since the last `reset`. */
  count = 0;
  /** The longest of them in ms (0: none). */
  longestMs = 0;
  /** Wall-clock time of the previous callback (0: none yet). */
  private last = 0;

  /**
   * One audio callback at wall-clock time `nowMs`. `counting` says whether sound is being made (or
   * fading out): while idle a gap is of no interest, but the first callback after Play still counts
   * a sleeping device that took long to wake up.
   */
  tick(nowMs: number, counting: boolean): void {
    const gap = this.last > 0 ? nowMs - this.last : 0;
    this.last = nowMs;
    if (counting && gap > STALL_MS) {
      this.count++;
      if (gap > this.longestMs) this.longestMs = gap;
    }
  }

  /** Forget earlier stalls (when Play starts). */
  reset(): void {
    this.count = 0;
    this.longestMs = 0;
  }
}
