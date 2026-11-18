import { describe, expect, it } from 'vitest';
import { CPU_HISTORY_SECONDS, CpuHistory, graphScale } from './cpuHistory';

/** Feed reports 20 times per second from `from` for `seconds`, with load `cpu(t)`. */
function feed(h: CpuHistory, from: number, seconds: number, cpu: (t: number) => number, playing = true) {
  for (let k = 0; k < seconds * 20; k++) {
    const t = from + k / 20;
    h.add(t, cpu(t), playing);
  }
}

describe('CpuHistory', () => {
  it('keeps one averaged point per half second while playing', () => {
    const h = new CpuHistory();
    feed(h, 0, 10, (t) => (t < 5 ? 0.02 : 0.04));
    const points = h.since(0);
    expect(points.length).toBeGreaterThanOrEqual(19);
    expect(points.length).toBeLessThanOrEqual(20);
    expect(points[2]!.value).toBeCloseTo(0.02, 6);
    expect(points.at(-1)!.value).toBeCloseTo(0.04, 6);
  });

  it('summarises average and peak over the chosen span only', () => {
    const h = new CpuHistory();
    feed(h, 0, 60, (t) => (t < 30 ? 0.1 : 0.02));
    const all = h.summary(0)!;
    expect(all.peak).toBeCloseTo(0.1, 6);
    expect(all.average).toBeGreaterThan(0.05);
    const last20 = h.summary(40)!;
    expect(last20.peak).toBeCloseTo(0.02, 6);
    expect(last20.average).toBeCloseTo(0.02, 6);
  });

  it('marks a stop once as a gap, and records nothing while stopped', () => {
    const h = new CpuHistory();
    feed(h, 0, 5, () => 0.03);
    const before = h.since(0).length;
    feed(h, 5, 5, () => 0, false);
    const during = h.since(0);
    expect(during.length).toBe(before + 1);
    expect(Number.isNaN(during.at(-1)!.value)).toBe(true);
    feed(h, 10, 5, () => 0.03);
    expect(h.summary(0)!.average).toBeCloseTo(0.03, 6); // the gap does not count as zero
  });

  it('forgets points older than ten minutes', () => {
    const h = new CpuHistory();
    feed(h, 0, CPU_HISTORY_SECONDS + 120, (t) => (t < 60 ? 0.5 : 0.01));
    expect(h.summary(0)!.peak).toBeCloseTo(0.01, 6);
    expect(h.since(0)[0]!.time).toBeGreaterThan(59);
  });

  it('chooses a scale that leaves room above the peak', () => {
    expect(graphScale(0)).toBe(0.05);
    expect(graphScale(0.03)).toBe(0.05);
    expect(graphScale(0.045)).toBe(0.1);
    expect(graphScale(0.2)).toBe(0.25);
    expect(graphScale(0.85)).toBe(1);
    expect(graphScale(1.2)).toBe(1.5);
  });
});
