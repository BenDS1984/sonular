/**
 * Tests for the oscillator's modulation: pulse width, tune/FM inputs. Everything renders
 * offline on the compiled Faust WebAssembly; nothing is played.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../engine/core/types';
import { FaustDsp, type FaustMeta } from '../engine/faust/FaustDsp';
import { aliasingDb, estimateFrequency, powerSpectrum, rms } from './testUtils';

const SR = 48000;
const C4 = 261.6255653;

function osc(params: Record<string, number> = {}): FaustDsp {
  const path = (ext: string) => fileURLToPath(new URL(`./generated/osc.${ext}`, import.meta.url));
  const dsp = new FaustDsp(
    new WebAssembly.Module(readFileSync(path('wasm'))),
    JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta,
    SR,
  );
  for (const [k, v] of Object.entries({ level: 1, ...params })) dsp.setParam(k, v);
  return dsp;
}

type Signal = number | ((i: number) => number) | undefined;
interface Inputs {
  pitch?: Signal;
  tune?: Signal;
  pwm?: Signal;
  fm?: Signal;
  sync?: Signal;
}

/** Render `seconds`; an input left out is unpatched (silent), the others are constants or functions of the sample number. */
function render(dsp: FaustDsp, seconds: number, inputs: Inputs = {}): Float32Array {
  const names = ['pitch', 'tune', 'pwm', 'fm', 'sync'] as const;
  const total = Math.round(SR * seconds);
  const out = new Float32Array(total);
  const bufs = names.map(() => new Float32Array(BLOCK_SIZE));
  const outBuf = new Float32Array(BLOCK_SIZE);
  const silent = names.map((n) => inputs[n] === undefined);
  for (let pos = 0; pos < total; pos += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - pos);
    names.forEach((name, k) => {
      const s = inputs[name];
      for (let i = 0; i < n; i++) bufs[k]![i] = typeof s === 'function' ? s(pos + i) : (s ?? 0);
    });
    dsp.process(bufs, silent, [outBuf], n);
    out.set(outBuf.subarray(0, n), pos);
  }
  return out;
}

const tail = (x: Float32Array, from = SR / 2) => x.subarray(from);
const mean = (x: Float32Array) => x.reduce((s, v) => s + v, 0) / x.length;

describe('Oscillator pulse width', () => {
  const dutyOf = (x: Float32Array) => x.filter((v) => v > 0).length / x.length;

  it('the knob sets how long the square stays high, and the mean stays at zero', () => {
    for (const pw of [0.5, 0.25, 0.1, 0.8]) {
      const x = tail(render(osc({ wave: 3, pw }), 1));
      // The edges are smoothed over about a sample on each side, which moves the count by ~1%.
      expect(Math.abs(dutyOf(x) - pw), `pw ${pw}`).toBeLessThan(0.015);
      expect(Math.abs(mean(x)), `mean at pw ${pw}`).toBeLessThan(0.01);
      expect(Math.max(...x.map(Math.abs)), `peak at pw ${pw}`).toBeLessThan(1.05);
    }
  });

  it('at 50% it is the plain square, full level', () => {
    expect(rms(tail(render(osc({ wave: 3, pw: 0.5 }), 1)))).toBeGreaterThan(0.99);
  });

  it('the pwm input moves the width: +1 gives 95%, -1 gives 5%', () => {
    expect(Math.abs(dutyOf(tail(render(osc({ wave: 3, pw: 0.5 }), 1, { pwm: 1 }))) - 0.95)).toBeLessThan(0.015);
    expect(Math.abs(dutyOf(tail(render(osc({ wave: 3, pw: 0.5 }), 1, { pwm: -1 }))) - 0.05)).toBeLessThan(0.015);
  });

  it('a pulse stays alias-free', () => {
    for (const pw of [0.25, 0.1]) {
      for (const f of [445, 1783, 3520]) {
        const x = render(osc({ wave: 3, pw }), (SR / 2 + 65536) / SR, { pitch: Math.log2(f / C4) }).subarray(SR / 2, SR / 2 + 65536);
        expect(aliasingDb(x, f, SR, 12000), `${f} Hz pw ${pw}`).toBeLessThan(-65);
      }
    }
  });

  it('an LFO on pwm never clicks', () => {
    const x = render(osc({ wave: 3 }), 1, { pitch: Math.log2(110 / C4), pwm: (i) => Math.sin((2 * Math.PI * 3 * i) / SR) });
    let worst = 0;
    for (let i = 1; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i]! - x[i - 1]!));
    expect(worst).toBeLessThan(2.2);
    expect(x.every(Number.isFinite)).toBe(true);
  });
});

describe('Oscillator modulation inputs', () => {
  it('tune: +0.5 raises the pitch by 12 semitones, and nothing patched changes nothing', () => {
    const base = estimateFrequency(tail(render(osc({ wave: 0 }), 1)));
    const up = estimateFrequency(tail(render(osc({ wave: 0 }), 1, { tune: 0.5 })));
    expect(up / base).toBeCloseTo(2, 2);
    expect(base).toBeCloseTo(C4, 1);
  });
});

describe('Oscillator FM', () => {
  it('with the fm knob at 0 the input does nothing', () => {
    const a = tail(render(osc({ wave: 0 }), 1));
    const b = tail(render(osc({ wave: 0, fm: 0 }), 1, { fm: (i) => Math.sin(i / 7) }));
    expect(estimateFrequency(b)).toBeCloseTo(estimateFrequency(a), 1);
  });

  it('a steady signal of +1 shifts the pitch by the fm amount in octaves', () => {
    const f = estimateFrequency(tail(render(osc({ wave: 0, fm: 1 }), 1, { fm: 1 })));
    expect(f / C4).toBeCloseTo(2, 2);
    const g = estimateFrequency(tail(render(osc({ wave: 0, fm: 2 }), 1, { fm: -1 })));
    expect(g / C4).toBeCloseTo(0.25, 2);
  });

  it('a sine as modulator gives sidebands around the carrier', () => {
    const fc = 1000;
    const fmod = 100;
    const x = tail(render(osc({ wave: 0, fm: 0.05 }), 2, { pitch: Math.log2(fc / C4), fm: (i) => Math.sin((2 * Math.PI * fmod * i) / SR) }), SR / 2);
    // Power at the carrier +- the modulator frequency, compared with a spot far away from both.
    const N = 1 << 15;
    const seg = x.subarray(0, N);
    const re = (f: number) => {
      let a = 0;
      let b = 0;
      for (let i = 0; i < N; i++) {
        a += seg[i]! * Math.cos((2 * Math.PI * f * i) / SR);
        b += seg[i]! * Math.sin((2 * Math.PI * f * i) / SR);
      }
      return Math.hypot(a, b) / N;
    };
    expect(re(fc + fmod)).toBeGreaterThan(20 * re(fc + 55));
    expect(re(fc - fmod)).toBeGreaterThan(20 * re(fc - 55));
  });

  it('never goes NaN or silent-wrong with extreme modulation', () => {
    const x = render(osc({ wave: 2, fm: 4, pw: 0.05 }), 0.5, { fm: (i) => 50 * Math.sin(i / 3), pwm: 9, tune: -9 });
    expect(x.every(Number.isFinite)).toBe(true);
    expect(Math.max(...x.map(Math.abs))).toBeLessThan(2);
  });
});

describe('Oscillator hard sync', () => {
  // A master whose period is a whole number of samples (100), so a synced output repeats exactly.
  const PERIOD = 100;
  const master = SR / PERIOD;
  const slave = 1.73 * master;
  const square = (i: number) => (i % PERIOD < PERIOD / 2 ? 1 : -1);

  it('nothing patched: the oscillator runs free', () => {
    const f = estimateFrequency(tail(render(osc({ wave: 2 }), 1)));
    expect(f).toBeCloseTo(C4, 1);
  });

  it('a synced oscillator repeats every master period, whatever its own frequency', () => {
    for (const wave of [0, 1, 2, 3]) {
      const x = tail(render(osc({ wave }), 1, { pitch: Math.log2(slave / C4), sync: square }));
      let worst = 0;
      for (let i = 0; i + PERIOD < x.length; i++) worst = Math.max(worst, Math.abs(x[i + PERIOD]! - x[i]!));
      expect(worst, `wave ${wave}`).toBeLessThan(0.01);
    }
  });

  /** Share of the signal's power above 15 kHz, in dB: a hard reset puts a lot there unless it is smoothed. */
  function highDb(x: Float32Array): number {
    const p = powerSpectrum(x);
    let hi = 0;
    let all = 0;
    for (let b = 1; b < p.length; b++) {
      all += p[b]!;
      if ((b * SR) / (2 * p.length) > 15000) hi += p[b]!;
    }
    return 10 * Math.log10(hi / all);
  }

  it('the jump at the reset is smoothed: far less high-frequency content than a plain reset', () => {
    const N = 1 << 15;
    const start = SR / 2;
    const x = render(osc({ wave: 2 }), (start + N) / SR, { pitch: Math.log2(slave / C4), sync: square }).subarray(start, start + N);
    // A plain reset of a naive saw at the same frequencies, for comparison.
    const plain = new Float32Array(N);
    let ph = 0;
    for (let i = 0; i < N + start; i++) {
      if (i % PERIOD === 0) ph = 0;
      if (i >= start) plain[i - start] = 2 * ph - 1;
      ph = (ph + slave / SR) % 1;
    }
    const good = highDb(x);
    const bad = highDb(plain);
    console.log(`[hard sync, power above 15 kHz] smoothed ${good.toFixed(1)} dB, plain reset ${bad.toFixed(1)} dB`);
    expect(good).toBeLessThan(bad - 10);
  });

  it('never goes NaN with a noisy sync input', () => {
    const x = render(osc({ wave: 2 }), 0.5, { pitch: 1, sync: (i) => Math.sin(i * 1.3) * 3 });
    expect(x.every(Number.isFinite)).toBe(true);
    expect(Math.max(...x.map(Math.abs))).toBeLessThan(2);
  });
});
