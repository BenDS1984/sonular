import { describe, expect, it } from 'vitest';
import { Limiter, LIMITER_CEILING } from './Limiter';

const SR = 48000;
const BLOCK = 128;

/** Run stereo signals through a limiter in blocks; returns what comes out. */
function run(lim: Limiter, left: Float32Array, right = left): { L: Float32Array; R: Float32Array } {
  const L = Float32Array.from(left);
  const R = Float32Array.from(right);
  for (let i = 0; i < L.length; i += BLOCK) {
    const n = Math.min(BLOCK, L.length - i);
    lim.process(L.subarray(i, i + n), R.subarray(i, i + n), n);
  }
  return { L, R };
}

const peakOf = (a: Float32Array) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

function sine(freq: number, amp: number, seconds: number): Float32Array {
  const a = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < a.length; i++) a[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return a;
}

describe('Limiter', () => {
  it('leaves quiet sound as it is, only later by the look-ahead', () => {
    const lim = new Limiter(SR);
    const input = sine(440, 0.5, 0.2);
    const { L } = run(lim, input);
    const d = lim.size - 1;
    for (let i = d; i < input.length; i += 97) expect(L[i]!).toBeCloseTo(input[i - d]!, 6);
    expect(lim.takeReduction()).toBe(1);
  });

  it('never lets a loud sine over the ceiling', () => {
    for (const [freq, amp] of [
      [40, 4],
      [440, 2],
      [5000, 10],
    ] as const) {
      const lim = new Limiter(SR);
      const { L } = run(lim, sine(freq, amp, 0.5));
      expect(peakOf(L)).toBeLessThanOrEqual(LIMITER_CEILING + 1e-6);
      // It is loud, not squashed to nothing.
      expect(peakOf(L.subarray(SR * 0.3))).toBeGreaterThan(LIMITER_CEILING * 0.9);
    }
  });

  it('catches a sudden single spike, coming down smoothly before it', () => {
    const lim = new Limiter(SR);
    const input = new Float32Array(SR / 10).fill(0.5);
    input[2000] = 8;
    const { L } = run(lim, input);
    expect(peakOf(L)).toBeLessThanOrEqual(LIMITER_CEILING + 1e-6);
    // No jumps: neighbouring samples of the constant part differ only a little.
    const d = lim.size - 1;
    for (let i = d + 1; i < L.length; i++) {
      if (i - d === 2000 || i - d === 2001) continue;
      expect(Math.abs(L[i]! - L[i - 1]!)).toBeLessThan(0.01);
    }
    expect(lim.takeReduction()).toBeLessThan(0.15);
  });

  it('turns both sides down together when only one is loud', () => {
    const lim = new Limiter(SR);
    const loud = sine(200, 3, 0.3);
    const quiet = sine(200, 0.3, 0.3);
    const { L, R } = run(lim, loud, quiet);
    const tail = SR * 0.2;
    expect(peakOf(L.subarray(tail))).toBeLessThanOrEqual(LIMITER_CEILING + 1e-6);
    // The ratio between the sides stays 10 to 1.
    expect(peakOf(L.subarray(tail)) / peakOf(R.subarray(tail))).toBeCloseTo(10, 1);
  });

  it('comes back up after a loud part', () => {
    const lim = new Limiter(SR);
    const input = new Float32Array(2 * SR).fill(0.5);
    input.fill(4, 0, SR / 10); // loud first tenth of a second
    const { L } = run(lim, input);
    expect(L[SR]!).toBeCloseTo(0.5, 2); // within 0.1 dB a second later
    expect(L[2 * SR - 1]!).toBe(0.5); // and then exactly as it was
  });

  it('switched off, lets the sound straight through, peaks and all', () => {
    const lim = new Limiter(SR, false);
    const input = sine(440, 2, 0.2);
    const { L } = run(lim, input);
    expect(Array.from(L)).toEqual(Array.from(input));
  });

  it('switching on and off while playing glides, without jumps', () => {
    const lim = new Limiter(SR, false);
    const input = sine(100, 0.8, 0.3);
    const out = Float32Array.from(input);
    for (let i = 0; i < out.length; i += BLOCK) {
      if (i === 4992) lim.setOn(true);
      if (i === 9984) lim.setOn(false);
      const n = Math.min(BLOCK, out.length - i);
      lim.process(out.subarray(i, i + n), out.subarray(i, i + n).slice(), n);
    }
    // A 100 Hz sine at 0.8 moves at most about 0.0105 per sample; a jump would be far more.
    for (let i = 1; i < out.length; i++) expect(Math.abs(out[i]! - out[i - 1]!)).toBeLessThan(0.02);
  });
});
