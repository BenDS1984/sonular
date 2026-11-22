import { describe, expect, it } from 'vitest';
import { computeWaveform, waveColumns, waveShape } from './waveform';

/** One second at 8 kHz: silent, then a burst between 0.5 s and 0.6 s, then silent again. */
function burst() {
  const rate = 8000;
  const ch = new Float32Array(rate);
  for (let i = 4000; i < 4800; i++) ch[i] = i % 2 ? 0.8 : -0.6;
  return { ch, rate };
}

describe('waveforms', () => {
  it('keeps the lowest and highest value of each stretch, at every level', () => {
    const { ch, rate } = burst();
    const w = computeWaveform([ch], rate);
    expect(w.frames).toBe(8000);
    expect(w.levels.map((l) => l.size)).toEqual([64, 512, 4096]);
    for (const l of w.levels) {
      expect(Math.max(...l.max)).toBeCloseTo(0.8);
      expect(Math.min(...l.min)).toBeCloseTo(-0.6);
    }
  });

  it('puts the burst in the right columns', () => {
    const { ch, rate } = burst();
    const w = computeWaveform([ch], rate);
    const cols = waveColumns(w, 0, 1, 10); // 0.1 s each
    expect(cols.max[4]).toBeCloseTo(0.8);
    expect(cols.max[5]).toBeCloseTo(0.8); // 0.5–0.6 s is column 5
    expect(cols.max[2]).toBe(0);
    expect(cols.min[8]).toBe(0);
  });

  it('draws the same burst with fewer, wider columns and is silent outside the sample', () => {
    const { ch, rate } = burst();
    const w = computeWaveform([ch], rate);
    expect(Math.max(...waveColumns(w, 0, 1, 2).max)).toBeCloseTo(0.8);
    const out = waveColumns(w, 2, 3, 4); // after the end
    expect(Math.max(...out.max)).toBe(0);
  });

  it('combines the channels', () => {
    const left = new Float32Array(1000).fill(0.2);
    const right = new Float32Array(1000).fill(-0.9);
    const w = computeWaveform([left, right], 1000);
    const cols = waveColumns(w, 0, 1, 1);
    expect(cols.max[0]).toBeCloseTo(0.2);
    expect(cols.min[0]).toBeCloseTo(-0.9);
  });

  it('makes a polygon with a thin line for silence', () => {
    const shape = waveShape({ min: new Float32Array(2), max: new Float32Array(2) });
    expect(shape.split(' ')).toHaveLength(8);
    expect(shape).toContain('0,-0.015');
  });
});
