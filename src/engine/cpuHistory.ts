/**
 * History of the audio engine's CPU load, for the graph behind the CPU meter.
 *
 * The engine reports its load 20 times per second; this keeps one averaged point per
 * `CPU_SAMPLE_SECONDS`, for at most `CPU_HISTORY_SECONDS`. While playback is stopped nothing is
 * recorded, and a single gap marker (NaN) makes the graph break the line instead of drawing a
 * drop to zero.
 *
 * Plain TypeScript without browser APIs, so it can be tested in Node.
 */

export const CPU_SAMPLE_SECONDS = 0.5;
export const CPU_HISTORY_SECONDS = 600;
const CAPACITY = Math.ceil(CPU_HISTORY_SECONDS / CPU_SAMPLE_SECONDS) + 2;

export interface CpuPoint {
  /** Seconds (any steadily increasing clock). */
  time: number;
  /** Share of the real-time budget (0..1+), or NaN for a gap (playback stopped). */
  value: number;
}

export interface CpuSummary {
  average: number;
  peak: number;
}

export class CpuHistory {
  private readonly times = new Float64Array(CAPACITY);
  private readonly values = new Float32Array(CAPACITY);
  /** Index of the oldest point, and how many points are stored. */
  private start = 0;
  private count = 0;

  private sum = 0;
  private sumCount = 0;
  private sumStart = NaN;
  private gapMarked = true;

  /** Feed one engine report. Returns true when a point was added (the graph may redraw). */
  add(time: number, cpu: number, playing: boolean): boolean {
    if (!playing) {
      this.sum = 0;
      this.sumCount = 0;
      this.sumStart = NaN;
      if (this.gapMarked) return false;
      this.gapMarked = true;
      this.push(time, NaN);
      return true;
    }
    if (Number.isNaN(this.sumStart)) this.sumStart = time;
    this.sum += cpu;
    this.sumCount++;
    if (time - this.sumStart < CPU_SAMPLE_SECONDS) return false;
    this.push(time, this.sum / this.sumCount);
    this.sum = 0;
    this.sumCount = 0;
    this.sumStart = time;
    this.gapMarked = false;
    return true;
  }

  /** Points from `from` (seconds) onwards, oldest first; includes the gap markers. */
  since(from: number): CpuPoint[] {
    const out: CpuPoint[] = [];
    for (let k = 0; k < this.count; k++) {
      const i = (this.start + k) % CAPACITY;
      if (this.times[i]! >= from) out.push({ time: this.times[i]!, value: this.values[i]! });
    }
    return out;
  }

  /** Average and peak over the points since `from`, or null when there are none. */
  summary(from: number): CpuSummary | null {
    let sum = 0;
    let n = 0;
    let peak = 0;
    for (const p of this.since(from)) {
      if (Number.isNaN(p.value)) continue;
      sum += p.value;
      n++;
      if (p.value > peak) peak = p.value;
    }
    return n ? { average: sum / n, peak } : null;
  }

  /** Time of the newest point, or NaN when empty. */
  get latest(): number {
    return this.count ? this.times[(this.start + this.count - 1) % CAPACITY]! : NaN;
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
    this.sum = 0;
    this.sumCount = 0;
    this.sumStart = NaN;
    this.gapMarked = true;
  }

  private push(time: number, value: number) {
    const i = (this.start + this.count) % CAPACITY;
    this.times[i] = time;
    this.values[i] = value;
    if (this.count < CAPACITY) this.count++;
    else this.start = (this.start + 1) % CAPACITY;
  }
}

/**
 * Top of the graph's vertical scale: the smallest of a few round values that leaves some room
 * above the peak, so a load of 2-3 % still fills the graph instead of hugging the bottom.
 */
export function graphScale(peak: number): number {
  for (const top of [0.05, 0.1, 0.25, 0.5, 1]) if (peak * 1.15 <= top) return top;
  return Math.ceil(peak * 1.15 * 2) / 2;
}
