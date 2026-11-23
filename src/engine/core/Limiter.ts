/**
 * The master limiter: keeps the master bus under a ceiling without the crackle of clipping.
 *
 * It looks ahead: the sound is delayed by a few milliseconds, so the level can already be turned
 * down smoothly by the time a peak comes out. Per sample:
 * 1. the gain each sample needs to stay under the ceiling (1 when it is under it already);
 * 2. the lowest of those over the look-ahead window (so the gain is down for the whole window);
 * 3. coming back up slowly (release), going down at once;
 * 4. averaged over the window, so the gain glides down in a straight line instead of jumping.
 * Because every value in the average is at most what the delayed sample needs, the gain applied to
 * it is at most that too: no sample ever comes out above the ceiling (up to rounding).
 *
 * Left and right get the same gain, so the stereo image stays where it is. Switched off, the sound
 * comes straight through, without the delay; switching blends between the two over a few
 * milliseconds, so it does not click.
 *
 * No allocation in `process`.
 */

/** Highest level out of the limiter: -0.3 dBFS, a little room below full scale. */
export const LIMITER_CEILING = 10 ** (-0.3 / 20);
/** How far ahead it looks (and how much later everything sounds), in seconds. */
export const LIMITER_LOOKAHEAD_SECONDS = 0.005;
/** How long the level takes to come back after a peak (time constant), in seconds. */
const RELEASE_SECONDS = 0.15;
/** How long switching on or off blends between the limited and the straight sound, in seconds. */
const SWITCH_SECONDS = 0.01;

export class Limiter {
  /** Look-ahead window, in samples; the sound comes out `size - 1` samples later. */
  readonly size: number;
  private readonly delayL: Float32Array;
  private readonly delayR: Float32Array;
  /** Ring of needed gains, for the window minimum (a queue of rising values: indexes into it). */
  private readonly need: Float64Array;
  private readonly queue: Int32Array;
  private qHead = 0;
  private qLen = 0;
  /** Ring of the released gains being averaged, and their sum. */
  private readonly avg: Float64Array;
  private sum: number;
  /** Write position in the rings (all share it). */
  private pos = 0;
  private release: number;
  private readonly releaseCoef: number;
  on: boolean;
  /** Share of the limited sound in the output (1: on, 0: off), gliding when switched. */
  private mix: number;
  private readonly mixStep: number;
  /** Lowest gain applied since the last `takeReduction` (1: it did nothing). */
  private lowest = 1;

  constructor(sampleRate: number, on = true) {
    this.on = on;
    this.mix = on ? 1 : 0;
    this.mixStep = 1 / Math.max(1, SWITCH_SECONDS * sampleRate);
    this.size = Math.max(1, Math.round(LIMITER_LOOKAHEAD_SECONDS * sampleRate));
    this.delayL = new Float32Array(this.size);
    this.delayR = new Float32Array(this.size);
    this.need = new Float64Array(this.size);
    this.queue = new Int32Array(this.size);
    this.avg = new Float64Array(this.size);
    this.releaseCoef = 1 - Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
    this.sum = this.size;
    this.release = 1;
    this.avg.fill(1);
  }

  /** Limit `n` samples of `L` and `R` in place (while on, they come out `size - 1` samples later). */
  process(L: Float32Array, R: Float32Array, n: number): void {
    const size = this.size;
    const need = this.need;
    const queue = this.queue;
    const avg = this.avg;
    const dL = this.delayL;
    const dR = this.delayR;
    const on = this.on;
    const coef = this.releaseCoef;
    let pos = this.pos;
    let head = this.qHead;
    let len = this.qLen;
    let sum = this.sum;
    let rel = this.release;
    let lowest = this.lowest;
    let mix = this.mix;
    const mixTarget = on ? 1 : 0;
    const mixStep = this.mixStep;
    for (let i = 0; i < n; i++) {
      const l = L[i]!;
      const r = R[i]!;
      // 1. The gain this sample needs.
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      const peak = al > ar ? al : ar;
      const g = on && peak > LIMITER_CEILING ? LIMITER_CEILING / peak : 1;
      // 2. The lowest over the window: a queue of ring positions whose gains rise from front to
      // back. The one at `pos` is a full window old, so it leaves before `pos` is written again.
      if (len > 0 && queue[head] === pos) {
        head = head + 1 === size ? 0 : head + 1;
        len--;
      }
      while (len > 0 && need[queue[(head + len - 1) % size]!]! >= g) len--;
      need[pos] = g;
      queue[(head + len) % size] = pos;
      len++;
      const held = need[queue[head]!]!;
      // 3. Down at once, back up slowly.
      rel = held < rel ? held : rel + (held - rel) * coef;
      if (rel > 0.99999 && held === 1) rel = 1; // back: exactly untouched again
      // 4. The average over the window.
      sum += rel - avg[pos]!;
      avg[pos] = rel;
      // Every full turn, add up afresh, so rounding errors cannot pile up.
      if (pos === size - 1) {
        sum = 0;
        for (let k = 0; k < size; k++) sum += avg[k]!;
      }
      const gain = sum / size;
      if (gain < lowest && mix > 0) lowest = gain;
      // In goes the new sample; out comes the one from `size - 1` samples ago, the oldest whose
      // needed gain is in every value of the average.
      dL[pos] = l;
      dR[pos] = r;
      pos = pos + 1 === size ? 0 : pos + 1;
      if (mix === 1) {
        L[i] = dL[pos]! * gain;
        R[i] = dR[pos]! * gain;
      } else {
        // Switched off, or blending after a switch: the straight sound, without the delay.
        if (mix !== mixTarget) mix = mix < mixTarget ? Math.min(mixTarget, mix + mixStep) : Math.max(mixTarget, mix - mixStep);
        if (mix > 0) {
          L[i] = l + (dL[pos]! * gain - l) * mix;
          R[i] = r + (dR[pos]! * gain - r) * mix;
        }
      }
      if (mix === 1 && !on) mix = 1 - mixStep; // start gliding off
    }
    this.mix = mix;
    this.pos = pos;
    this.qHead = head;
    this.qLen = len;
    this.sum = sum;
    this.release = rel;
    this.lowest = lowest;
  }

  /** Switch on or off: gliding (while playing), or at once (before anything plays). */
  setOn(on: boolean, atOnce = false): void {
    this.on = on;
    if (atOnce) this.mix = on ? 1 : 0;
  }

  /** The lowest gain applied since the previous call (1: none), and start again. */
  takeReduction(): number {
    const g = this.lowest;
    this.lowest = 1;
    return g;
  }

  /** Silence the delay and forget earlier peaks. */
  reset(): void {
    this.delayL.fill(0);
    this.delayR.fill(0);
    this.avg.fill(1);
    this.sum = this.size;
    this.release = 1;
    this.qLen = 0;
    this.lowest = 1;
  }
}
