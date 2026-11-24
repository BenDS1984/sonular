import { describe, expect, it } from 'vitest';
import { STALL_MS, StallMeter } from './StallMeter';

/** Callbacks every `every` ms from `from` for `count` callbacks. */
function run(m: StallMeter, from: number, every: number, count: number, counting = true): number {
  let t = from;
  for (let i = 0; i < count; i++, t += every) m.tick(t, counting);
  return t - every;
}

describe('StallMeter', () => {
  it('counts nothing while callbacks come at the sound card rhythm', () => {
    const m = new StallMeter();
    const t = run(m, 1000, 3, 1000); // a steady stream
    run(m, t + 20, 20, 100); // callbacks in groups, one per buffer
    expect(m.count).toBe(0);
    expect(m.longestMs).toBe(0);
  });

  it('counts a callback that comes late, and remembers the longest', () => {
    const m = new StallMeter();
    let t = run(m, 1000, 5, 50);
    t += 140; // a hang of 140 ms
    m.tick(t, true);
    t = run(m, t + 5, 5, 20);
    t += STALL_MS + 20;
    m.tick(t, true);
    expect(m.count).toBe(2);
    expect(m.longestMs).toBe(140);
  });

  it('ignores a gap while nothing plays, but counts the first callback after Play', () => {
    const m = new StallMeter();
    const t = run(m, 1000, 5, 20, false);
    m.tick(t + 900, false); // idle: a long gap does not matter
    expect(m.count).toBe(0);
    m.tick(t + 900 + 300, true); // Play, and the sound card took 300 ms to wake up
    expect(m.count).toBe(1);
    expect(m.longestMs).toBe(300);
  });

  it('starts again after a reset', () => {
    const m = new StallMeter();
    m.tick(1000, true);
    m.tick(1200, true);
    expect(m.count).toBe(1);
    m.reset();
    expect(m.count).toBe(0);
    expect(m.longestMs).toBe(0);
  });
});
