/** Tests for the CV Mix: the sum, flipping, silent inputs, the unipolar range and smooth knobs. */
import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../core/types';
import { CvMix } from './CvMix';

const SR = 48000;

function make(params: Record<string, number> = {}): CvMix {
  const m = new CvMix(SR);
  for (const [k, v] of Object.entries(params)) m.setParam(k, v);
  m.reset();
  return m;
}

/** One block with constant inputs; null means that input is silent (nothing patched). */
function run(m: CvMix, values: (number | null)[]): Float32Array {
  const inputs = values.map((v) => new Float32Array(BLOCK_SIZE).fill(v ?? 0));
  const out = new Float32Array(BLOCK_SIZE);
  m.process(inputs, values.map((v) => v === null), [out], BLOCK_SIZE);
  return out;
}

describe('CV Mix', () => {
  it('adds the three inputs, each times its level', () => {
    const out = run(make({ level1: 1, level2: 0.5, level3: -1 }), [0.2, 0.4, 0.1]);
    expect(out[BLOCK_SIZE - 1]).toBeCloseTo(0.2 + 0.2 - 0.1, 5);
  });

  it('a negative level flips a signal, so it can be subtracted', () => {
    const out = run(make({ level1: 1, level2: -1, level3: 0 }), [0.7, 0.7, 0.9]);
    expect(out[BLOCK_SIZE - 1]).toBeCloseTo(0, 5);
  });

  it('counts an unpatched input as 0', () => {
    const out = run(make({ level1: 1 }), [0.3, null, null]);
    expect(out[0]).toBeCloseTo(0.3, 5);
  });

  it('unipolar squeezes the sum into 0..1 and limits it', () => {
    const m = make({ polarity: 1, level1: 1 });
    expect(run(m, [0, null, null])[0]).toBeCloseTo(0.5, 5);
    expect(run(m, [1, null, null])[0]).toBeCloseTo(1, 5);
    expect(run(m, [-1, null, null])[0]).toBeCloseTo(0, 5);
    const loud = make({ polarity: 1, level1: 1, level2: 1, level3: 1 });
    expect(run(loud, [1, 1, 1])[0]).toBe(1);
    expect(run(loud, [-1, -1, -1])[0]).toBe(0);
  });

  it('glides when a knob jumps, without a step', () => {
    const m = make({ level1: 0, level2: 0, level3: 0 });
    m.setParam('level1', 1);
    const out = run(m, [1, null, null]);
    expect(out[0]).toBeLessThan(0.01);
    let biggest = 0;
    for (let i = 1; i < out.length; i++) biggest = Math.max(biggest, Math.abs(out[i]! - out[i - 1]!));
    expect(biggest).toBeLessThan(0.01);
  });

  it('never gives NaN, also at the extremes', () => {
    const out = run(make({ level1: 99, level2: -99, level3: 1 }), [1, 1, 1]);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});
