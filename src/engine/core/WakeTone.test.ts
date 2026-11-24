import { describe, expect, it } from 'vitest';
import { WAKE_IDLE_MS, WAKE_LEVEL, WAKE_SECONDS, WakeTone } from './WakeTone';

const SR = 48000;
const QUANTUM = 128;

describe('WakeTone', () => {
  it('warms up when Play is pressed after a long silence, and for the length it should', () => {
    const w = new WakeTone(SR);
    w.heard(1000);
    expect(w.begin(1000 + WAKE_IDLE_MS + 1)).toBe(true);
    const L = new Float32Array(QUANTUM);
    const R = new Float32Array(QUANTUM);
    let frames = 0;
    let done = false;
    while (!done) {
      done = w.fill(L, R, QUANTUM);
      frames += QUANTUM;
    }
    expect(frames).toBeGreaterThanOrEqual(WAKE_SECONDS * SR);
    expect(frames).toBeLessThan(WAKE_SECONDS * SR + QUANTUM);
    expect(w.active).toBe(false);
  });

  it('adds nothing after a short pause', () => {
    const w = new WakeTone(SR);
    w.heard(50_000);
    expect(w.begin(50_000 + WAKE_IDLE_MS - 1)).toBe(false);
    expect(w.active).toBe(false);
  });

  it('warms up the first time too (no sound was made yet)', () => {
    expect(new WakeTone(SR).begin(5000)).toBe(true);
  });

  it('is a very soft, non-silent noise on both sides', () => {
    const w = new WakeTone(SR);
    w.begin(1e9);
    const L = new Float32Array(4800);
    const R = new Float32Array(4800);
    w.fill(L, R, 4800);
    const peak = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    for (const ch of [L, R]) {
      expect(peak(ch)).toBeGreaterThan(0);
      expect(peak(ch)).toBeLessThanOrEqual(WAKE_LEVEL);
    }
    expect(WAKE_LEVEL).toBeLessThan(10 ** (-85 / 20)); // quieter than -85 dBFS
    expect(L).not.toEqual(R); // not the same noise twice
  });

  it('can be cancelled by Stop', () => {
    const w = new WakeTone(SR);
    w.begin(1e9);
    expect(w.active).toBe(true);
    w.cancel();
    expect(w.active).toBe(false);
  });
});
