/**
 * Tests for the LFO: speed in Hz, the six waves, amount, polarity and phase, the repeatable random
 * patterns, and following a clock without drifting. Everything renders offline; nothing is played.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../core/types';
import { Lfo, lfoRandom } from './Lfo';

const SR = 48000;

function make(params: Record<string, number> = {}, clocked = false): Lfo {
  const lfo = new Lfo(SR);
  lfo.onConnectionsChanged([clocked]);
  for (const [k, v] of Object.entries(params)) lfo.setParam(k, v);
  lfo.reset();
  return lfo;
}

/** Render `samples` samples, with an optional clock signal by sample number. */
function render(lfo: Lfo, samples: number, clock: (i: number) => number = () => 0, from = 0): Float32Array {
  const out = new Float32Array(samples);
  const inBuf = new Float32Array(BLOCK_SIZE);
  const outBuf = new Float32Array(BLOCK_SIZE);
  for (let pos = 0; pos < samples; pos += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, samples - pos);
    for (let i = 0; i < n; i++) inBuf[i] = clock(from + pos + i);
    lfo.process([inBuf], [false], [outBuf], n);
    out.set(outBuf.subarray(0, n), pos);
  }
  return out;
}

/** A clock pulse every `period` samples, high for the first half of it. */
const pulses = (period: number) => (i: number) => (i % period) < period / 2 ? 1 : 0;

const WAVE = { sine: 0, triangle: 1, saw: 2, square: 3, random: 4, smooth: 5 };

describe('LFO free running', () => {
  it('runs at the Rate in Hz', () => {
    for (const rate of [0.5, 2, 7.5]) {
      const x = render(make({ wave: WAVE.sine, rate }), SR * 4);
      let crossings = 0;
      for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 && x[i]! >= 0) crossings++;
      // A cycle starts at zero, so the very first rising crossing is the start itself.
      expect(crossings, `${rate} Hz`).toBe(Math.round(rate * 4) - 1);
    }
  });

  it('repeats exactly after one cycle', () => {
    const x = render(make({ wave: WAVE.sine, rate: 1 }), SR * 2);
    expect(x[12345]).toBeCloseTo(x[12345 + SR]!, 4);
  });

  it('draws the shapes: sine, triangle, saw and square', () => {
    const at = (wave: number, p: number) => render(make({ wave, rate: 1 }), SR)[Math.round(p * SR)]!;
    expect(at(WAVE.sine, 0.25)).toBeCloseTo(1, 3);
    expect(at(WAVE.sine, 0.75)).toBeCloseTo(-1, 3);
    expect(at(WAVE.triangle, 0)).toBeCloseTo(0, 3);
    expect(at(WAVE.triangle, 0.25)).toBeCloseTo(1, 3);
    expect(at(WAVE.triangle, 0.75)).toBeCloseTo(-1, 3);
    expect(at(WAVE.saw, 0)).toBeCloseTo(-1, 3);
    expect(at(WAVE.saw, 0.5)).toBeCloseTo(0, 3);
    expect(at(WAVE.saw, 0.99)).toBeGreaterThan(0.95);
    expect(at(WAVE.square, 0.2)).toBe(1);
    expect(at(WAVE.square, 0.8)).toBe(-1);
    expect(at(WAVE.square, 0.49)).toBe(1); // half the cycle high, half low
    expect(at(WAVE.square, 0.51)).toBe(-1);
  });

  it('keeps every wave between -1 and +1', () => {
    for (let wave = 0; wave <= 5; wave++) {
      const x = render(make({ wave, rate: 13 }), SR);
      expect(Math.max(...x), `wave ${wave}`).toBeLessThanOrEqual(1);
      expect(Math.min(...x), `wave ${wave}`).toBeGreaterThanOrEqual(-1);
    }
  });
});

describe('LFO amount, polarity and phase', () => {
  it('scales the wave by Amount', () => {
    const x = render(make({ wave: WAVE.sine, rate: 1, amount: 0.4 }), SR);
    expect(Math.max(...x)).toBeCloseTo(0.4, 2);
    expect(Math.min(...x)).toBeCloseTo(-0.4, 2);
    expect(Math.max(...render(make({ wave: WAVE.sine, amount: 0 }), SR))).toBe(0);
  });

  it('unipolar swings between 0 and Amount', () => {
    const x = render(make({ wave: WAVE.sine, rate: 1, polarity: 1, amount: 0.8 }), SR);
    expect(Math.min(...x)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...x)).toBeCloseTo(0.8, 2);
    expect(Math.min(...x)).toBeCloseTo(0, 2);
  });

  it('starts every Play at the set phase', () => {
    const lfo = make({ wave: WAVE.sine, rate: 1, phase: 90 });
    const first = render(lfo, 2000);
    expect(first[0]).toBeCloseTo(1, 3); // a sine a quarter of the way in
    render(lfo, SR); // go on for a while ...
    lfo.reset(); // ... and press Play again
    const again = render(lfo, 2000);
    expect(again).toEqual(first);
  });

  it('glides when Amount is turned, so nothing jumps', () => {
    const lfo = make({ wave: WAVE.square, rate: 0.01, amount: 1 });
    render(lfo, 500);
    lfo.setParam('amount', 0);
    const x = render(lfo, 12000);
    let biggest = 0;
    for (let i = 1; i < x.length; i++) biggest = Math.max(biggest, Math.abs(x[i]! - x[i - 1]!));
    expect(biggest).toBeLessThan(0.01);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(0.001);
  });
});

describe('LFO random waves', () => {
  it('plays the same pattern after every Play, and different levels each cycle', () => {
    const lfo = make({ wave: WAVE.random, rate: 4 });
    const a = render(lfo, SR);
    lfo.reset();
    const b = render(lfo, SR);
    expect(b).toEqual(a);
    const levels = [0, 1, 2, 3].map((c) => a[Math.round(((c + 0.5) / 4) * SR)]!);
    expect(new Set(levels.map((v) => v.toFixed(3))).size).toBe(4);
  });

  it('random holds a level for a whole cycle; its levels follow the pattern', () => {
    const x = render(make({ wave: WAVE.random, rate: 2 }), SR);
    const half = SR / 2;
    for (let c = 0; c < 2; c++) {
      const slice = x.subarray(c * half + 10, (c + 1) * half - 10);
      expect(Math.max(...slice) - Math.min(...slice)).toBeLessThan(1e-6);
      expect(slice[0]).toBeCloseTo(lfoRandom(c), 5);
    }
  });

  it('smooth random glides from one level to the next without jumps', () => {
    const x = render(make({ wave: WAVE.smooth, rate: 3 }), SR * 2);
    let biggest = 0;
    for (let i = 1; i < x.length; i++) biggest = Math.max(biggest, Math.abs(x[i]! - x[i - 1]!));
    expect(biggest).toBeLessThan(0.002);
    // And it does arrive: at the start of a cycle it is at that cycle's level.
    expect(x[0]).toBeCloseTo(lfoRandom(0), 3);
    expect(x[SR / 3]).toBeCloseTo(lfoRandom(1), 2);
  });

  it('gives random numbers that spread over the whole range', () => {
    const values = Array.from({ length: 2000 }, (_, n) => lfoRandom(n));
    expect(Math.min(...values)).toBeLessThan(-0.95);
    expect(Math.max(...values)).toBeGreaterThan(0.95);
    expect(values.reduce((s, v) => s + v, 0) / values.length).toBeCloseTo(0, 1);
  });
});

describe('LFO following a clock', () => {
  const PULSE = 24000; // a quarter note at 120 BPM

  it('waits at its start until the clock gives its first pulse', () => {
    const lfo = make({ wave: WAVE.sine, sync: 5, phase: 90 }, true);
    const x = render(lfo, 20000, () => 0);
    expect(x.every((v) => Math.abs(v - 1) < 1e-6)).toBe(true);
  });

  it('x1: one cycle per pulse, exactly in step with the pulses', () => {
    const x = render(make({ wave: WAVE.sine, sync: 5 }, true), PULSE * 40 + 10, pulses(PULSE));
    // From the second pulse on the speed is known; every pulse starts a new cycle at zero.
    for (const n of [2, 10, 39]) expect(Math.abs(x[n * PULSE]!), `pulse ${n}`).toBeLessThan(0.01);
    expect(x[PULSE * 20 + PULSE / 4]).toBeCloseTo(1, 1);
  });

  it('/4: one cycle every four pulses, without drifting over hundreds of pulses', () => {
    const lfo = make({ wave: WAVE.sine, sync: 3 }, true);
    const x = render(lfo, PULSE * 801 + 10, pulses(PULSE));
    for (const n of [4, 100, 400, 800]) expect(Math.abs(x[n * PULSE]!), `pulse ${n}`).toBeLessThan(0.01);
    expect(x[PULSE * 400 + PULSE]).toBeCloseTo(1, 1); // a quarter of the way through a cycle
    expect(x[PULSE * 802 - PULSE * 3 + 2]).toBeLessThan(1); // (still finite and moving)
  });

  it('x4: four cycles per pulse', () => {
    const x = render(make({ wave: WAVE.sine, sync: 7 }, true), PULSE * 12, pulses(PULSE));
    let crossings = 0;
    for (let i = PULSE * 4 + 1; i < PULSE * 8; i++) if (x[i - 1]! < 0 && x[i]! >= 0) crossings++;
    expect(crossings).toBe(15); // sixteen cycles: the first of them starts on the window's edge
  });

  it('follows a tempo change from the next pulse on', () => {
    const slow = 24000;
    const fast = 12000;
    const clock = (i: number) => (i < slow * 8 ? pulses(slow)(i) : pulses(fast)(i - slow * 8));
    const x = render(make({ wave: WAVE.sine, sync: 5 }, true), slow * 8 + fast * 12, clock);
    // Three pulses after the change the cycles run twice as fast and again start at the pulses.
    for (const n of [4, 8, 10]) expect(Math.abs(x[slow * 8 + fast * n]!), `fast pulse ${n}`).toBeLessThan(0.01);
    expect(x[slow * 8 + fast * 10 + fast / 4]).toBeCloseTo(1, 1);
  });

  it('keeps running at the last tempo when the clock stops', () => {
    const clock = (i: number) => (i < PULSE * 6 ? pulses(PULSE)(i) : 0);
    const x = render(make({ wave: WAVE.sine, sync: 5 }, true), PULSE * 10, clock);
    // Four pulses after the clock stopped it is still a sine, one cycle per pulse length.
    expect(Math.abs(x[PULSE * 9]!)).toBeLessThan(0.02);
    expect(x[PULSE * 8 + PULSE / 4]).toBeCloseTo(1, 1);
  });

  it('starts counting afresh after Play', () => {
    const lfo = make({ wave: WAVE.sine, sync: 3 }, true);
    const first = render(lfo, PULSE * 9, pulses(PULSE));
    lfo.reset();
    const again = render(lfo, PULSE * 9, pulses(PULSE));
    expect(again).toEqual(first);
  });

  it('ignores the clock while nothing is patched in, and runs free at Rate', () => {
    const x = render(make({ wave: WAVE.sine, rate: 2 }, false), SR * 2, pulses(PULSE));
    let crossings = 0;
    for (let i = 1; i < x.length; i++) if (x[i - 1]! < 0 && x[i]! >= 0) crossings++;
    expect(crossings).toBe(3); // four cycles in two seconds, the first starting at zero
  });
});

describe('LFO robustness', () => {
  it('gives no NaN at the extreme settings', () => {
    for (const wave of [0, 1, 2, 3, 4, 5]) {
      for (const rate of [0.01, 50]) {
        for (const clocked of [false, true]) {
          for (const sync of [0, 8]) {
            const x = render(make({ wave, rate, sync, phase: 359, polarity: 1 }, clocked), 20000, pulses(1500));
            expect(x.every((v) => Number.isFinite(v) && v >= -1 && v <= 1), `${wave} ${rate} ${clocked} ${sync}`).toBe(true);
          }
        }
      }
    }
  });

  it('reports where it is in the cycle for the panel', () => {
    const lfo = make({ wave: WAVE.sine, rate: 1 });
    render(lfo, SR / 4);
    const out = new Float32Array(1);
    lfo.readMeters(out, 0);
    expect(out[0]).toBeCloseTo(0.25, 2);
  });
});
