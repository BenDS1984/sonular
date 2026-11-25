/**
 * Tests for the Filter module, run on the compiled Faust WebAssembly: where the cutoff really is,
 * the slopes, resonance, the modulation input, stability, and clicks when knobs jump.
 * Everything renders offline; nothing is played.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../engine/core/types';
import { FaustDsp, type FaustMeta } from '../engine/faust/FaustDsp';
import { rms } from './testUtils';

const SR = 48000;
const db = (x: number) => 20 * Math.log10(x);

function filter(params: Record<string, number> = {}): FaustDsp {
  const path = (ext: string) => fileURLToPath(new URL(`./generated/filter.${ext}`, import.meta.url));
  const dsp = new FaustDsp(
    new WebAssembly.Module(readFileSync(path('wasm'))),
    JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta,
    SR,
  );
  dsp.onConnectionsChanged([true, true, true]);
  for (const [k, v] of Object.entries(params)) dsp.setParam(k, v);
  return dsp;
}

const sine = (hz: number, amp = 0.5) => (i: number) => amp * Math.sin((2 * Math.PI * hz * i) / SR);

/** Render `seconds` with the given left/right/mod signals; `at` can change knobs along the way. */
function render(
  dsp: FaustDsp,
  seconds: number,
  left: (i: number) => number,
  mod: (i: number) => number = () => 0,
  right: (i: number) => number = left,
  at: Record<number, () => void> = {},
) {
  const total = Math.round(seconds * SR);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const ins = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  for (let pos = 0; pos < total; pos += BLOCK_SIZE) {
    at[pos]?.();
    const n = Math.min(BLOCK_SIZE, total - pos);
    for (let i = 0; i < n; i++) {
      ins[0]![i] = left(pos + i);
      ins[1]![i] = right(pos + i);
      ins[2]![i] = mod(pos + i);
    }
    dsp.process(ins, [false, false, false], outs, n);
    L.set(outs[0]!.subarray(0, n), pos);
    R.set(outs[1]!.subarray(0, n), pos);
  }
  return { L, R };
}

/** Gain in dB of the filter at one frequency (steady state, after the first half second). */
function gainAt(params: Record<string, number>, hz: number, mod = 0): number {
  const amp = 0.05; // small, so that high resonance does not matter for level
  const { L } = render(filter(params), 1, sine(hz, amp), () => mod);
  return db(rms(L.subarray(SR / 2)) / (amp / Math.SQRT2));
}

describe('Filter response', () => {
  it('low-pass: passes the lows, is 3 dB down at the cutoff, falls 12 dB per octave above', () => {
    const p = { type: 0, cutoff: 1000, resonance: 0 };
    expect(gainAt(p, 100)).toBeGreaterThan(-0.1);
    expect(gainAt(p, 1000)).toBeCloseTo(-3.01, 0);
    // Two octaves above the cutoff: about -24 dB (12 dB per octave).
    expect(gainAt(p, 4000)).toBeLessThan(-22);
    expect(gainAt(p, 4000)).toBeGreaterThan(-26);
  });

  it('high-pass: removes the lows, is 3 dB down at the cutoff, passes the highs', () => {
    const p = { type: 2, cutoff: 1000, resonance: 0 };
    expect(gainAt(p, 250)).toBeLessThan(-22);
    expect(gainAt(p, 250)).toBeGreaterThan(-26);
    expect(gainAt(p, 1000)).toBeCloseTo(-3.01, 0);
    expect(gainAt(p, 10000)).toBeGreaterThan(-0.2);
  });

  it('band-pass: 0 dB at the cutoff, falling away on both sides', () => {
    const p = { type: 1, cutoff: 1000, resonance: 0.5 };
    expect(gainAt(p, 1000)).toBeCloseTo(0, 0);
    expect(gainAt(p, 125)).toBeLessThan(-12);
    expect(gainAt(p, 8000)).toBeLessThan(-12);
  });

  it('puts the cutoff where the knob says, from the lowest to the highest setting', () => {
    for (const cutoff of [50, 200, 1000, 5000, 10000, 18000]) {
      const g = gainAt({ type: 0, cutoff, resonance: 0 }, cutoff);
      expect(g, `${cutoff} Hz`).toBeGreaterThan(-3.7);
      expect(g, `${cutoff} Hz`).toBeLessThan(-2.3);
    }
  });

  it('resonance makes a peak at the cutoff and stays stable at the maximum', () => {
    const flat = gainAt({ type: 0, cutoff: 1000, resonance: 0 }, 1000);
    const mid = gainAt({ type: 0, cutoff: 1000, resonance: 0.6 }, 1000);
    const top = gainAt({ type: 0, cutoff: 1000, resonance: 1 }, 1000);
    expect(mid).toBeGreaterThan(flat + 6);
    expect(top).toBeGreaterThan(mid + 6);
    expect(top).toBeLessThan(32); // Q about 25: a lively peak, not runaway
    const { L } = render(filter({ type: 0, cutoff: 1000, resonance: 1 }), 2, sine(1000, 0.9));
    expect(L.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('Filter modulation input', () => {
  it('moves the cutoff by Mod octaves per unit of the signal', () => {
    // Cutoff 1 kHz, Mod +1 octave, signal +1: the cutoff sits at 2 kHz.
    expect(gainAt({ type: 0, cutoff: 1000, resonance: 0, mod: 1 }, 2000, 1)).toBeCloseTo(-3.01, 0);
    // Signal -1: 500 Hz.
    expect(gainAt({ type: 0, cutoff: 1000, resonance: 0, mod: 1 }, 500, -1)).toBeCloseTo(-3.01, 0);
    // A negative Mod turns it around: +1 gives 500 Hz.
    expect(gainAt({ type: 0, cutoff: 1000, resonance: 0, mod: -1 }, 500, 1)).toBeCloseTo(-3.01, 0);
    // No signal: nothing moves.
    expect(gainAt({ type: 0, cutoff: 1000, resonance: 0, mod: 4 }, 1000, 0)).toBeCloseTo(-3.01, 0);
  });

  it('follows a slow LFO without trouble', () => {
    const lfo = (i: number) => Math.sin((2 * Math.PI * 2 * i) / SR);
    const { L } = render(filter({ type: 0, cutoff: 800, resonance: 0.7, mod: 3 }), 2, sine(220, 0.5), lfo);
    expect(L.every((v) => Number.isFinite(v) && Math.abs(v) < 5)).toBe(true);
    expect(rms(L.subarray(SR / 2))).toBeGreaterThan(0.01);
  });
});

describe('Filter stereo and silence', () => {
  it('treats left and right alike, and keeps them apart', () => {
    const both = render(filter({ cutoff: 1000 }), 1, sine(500));
    expect(both.L).toEqual(both.R);
    const onlyLeft = render(filter({ cutoff: 1000 }), 1, sine(500), () => 0, () => 0);
    expect(rms(onlyLeft.L)).toBeGreaterThan(0.01);
    expect(rms(onlyLeft.R)).toBe(0);
  });

  it('is silent for silence and never gives NaN at the extremes', () => {
    for (const type of [0, 1, 2]) {
      for (const cutoff of [20, 20000]) {
        for (const resonance of [0, 1]) {
          for (const mod of [-4, 4]) {
            const { L, R } = render(
              filter({ type, cutoff, resonance, mod }),
              0.5,
              (i) => (i % 97) / 97 - 0.5,
              (i) => Math.sin(i * 0.001) * 3,
            );
            expect(L.every(Number.isFinite) && R.every(Number.isFinite), `${type} ${cutoff} ${resonance} ${mod}`).toBe(true);
          }
        }
      }
    }
    const { L } = render(filter({ cutoff: 500 }), 0.5, () => 0);
    expect(L.every((v) => v === 0)).toBe(true);
  });

  it('plays at full level from the very start after Play', () => {
    const dsp = filter({ cutoff: 20000, type: 0 });
    render(dsp, 0.3, sine(1000));
    dsp.reset(); // Play restarts the engine
    const { L } = render(dsp, 0.05, sine(1000));
    // A 20 kHz low-pass passes 1 kHz untouched; a smoother fading in from zero would not.
    expect(rms(L.subarray(0, 480))).toBeGreaterThan(0.9 * (0.5 / Math.SQRT2));
  });
});

/** Fourth-order high-pass at 5 kHz: leaves only clicks, not the test tone. */
function highpass(x: Float32Array, hz: number): Float32Array {
  const w = (2 * Math.PI * hz) / SR;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 + c) / 2 / a0;
  const b1 = -(1 + c) / a0;
  const a1 = (-2 * c) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

function clickDb(x: Float32Array, at: number, span = SR / 4): number {
  const h = highpass(highpass(highpass(highpass(x, 5000), 5000), 5000), 5000);
  const level = rms(x.subarray(at - SR / 2, at));
  const n = Math.round(SR * 0.002);
  let worst = -Infinity;
  for (let i = at; i + n <= at + span; i += n) worst = Math.max(worst, db(rms(h.subarray(i, i + n)) / level));
  return worst;
}

describe('Filter knobs do not click', () => {
  const jumps: [string, number][] = [
    ['cutoff', 18000],
    ['resonance', 0.95],
    ['mod', 3],
  ];
  const jumpAt = Math.round((SR * 1.5) / BLOCK_SIZE) * BLOCK_SIZE;
  for (const [param, to] of jumps) {
    it(`${param} jumps while a tone plays`, () => {
      const dsp = filter({ type: 0, cutoff: 600, resonance: 0.3, mod: 0 });
      const { L } = render(dsp, 2.2, sine(220), () => 0.5, undefined, { [jumpAt]: () => dsp.setParam(param, to) });
      expect(clickDb(L, jumpAt), `${param}: high-frequency burst (dB)`).toBeLessThan(-70);
    });
  }

  it('type switches without a click', () => {
    for (const to of [1, 2]) {
      const dsp = filter({ type: 0, cutoff: 3000, resonance: 0.3 });
      const { L } = render(dsp, 2.2, sine(220), undefined, undefined, { [jumpAt]: () => dsp.setParam('type', to) });
      expect(clickDb(L, jumpAt), `type -> ${to}`).toBeLessThan(-70);
    }
  });

  it('would detect a real click', () => {
    const { L } = render(filter({ cutoff: 20000 }), 2.2, sine(220));
    L[jumpAt + 100] = L[jumpAt + 100]! + 0.05;
    expect(clickDb(L, jumpAt)).toBeGreaterThan(-50);
  });
});
