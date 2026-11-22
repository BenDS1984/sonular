/**
 * For a gate light: remembers whether a gate was open at any time since the last reading, so a gate
 * shorter than the interval between two readings (about 50 ms) still lights it. A module that
 * makes gates (sequencers, generators) calls `see` with each block of its gate output and reports
 * `take()` as a meter, usually named "gate". Allocation-free, so it is safe on the audio thread.
 */
export class GateLatch {
  private seen = false;

  /** Look at a block of a gate output: any value above 0 counts as open. */
  see(gate: Float32Array, frames: number): void {
    if (this.seen) return;
    for (let i = 0; i < frames; i++) {
      if (gate[i]! > 0) {
        this.seen = true;
        return;
      }
    }
  }

  /** 1 when a gate was open since the last call, else 0; starts over. */
  take(): number {
    const v = this.seen ? 1 : 0;
    this.seen = false;
    return v;
  }
}
