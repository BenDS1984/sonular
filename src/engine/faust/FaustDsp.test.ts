import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../core/types';
import { FaustDsp, type FaustMeta } from './FaustDsp';

const generated = (file: string) => fileURLToPath(new URL(`../../dsp/generated/${file}`, import.meta.url));

function loadTestTone(sr: number) {
  const module = new WebAssembly.Module(readFileSync(generated('testtone.wasm')));
  const meta = JSON.parse(readFileSync(generated('testtone.json'), 'utf8')) as FaustMeta;
  return new FaustDsp(module, meta, sr);
}

function renderSeconds(dsp: FaustDsp, sr: number, seconds: number): Float32Array {
  const total = Math.round(sr * seconds);
  const out = new Float32Array(total);
  const block = new Float32Array(BLOCK_SIZE);
  for (let pos = 0; pos < total; pos += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - pos);
    dsp.process([], [], [block], n);
    out.set(block.subarray(0, n), pos);
  }
  return out;
}

/** Frequency estimate from rising zero crossings. */
function estimateFrequency(x: Float32Array, sr: number): number {
  let first = -1;
  let last = -1;
  let count = 0;
  for (let i = 1; i < x.length; i++) {
    if (x[i - 1]! < 0 && x[i]! >= 0) {
      const t = i - 1 + -x[i - 1]! / (x[i]! - x[i - 1]!);
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  return ((count - 1) * sr) / (last - first);
}

function rms(x: Float32Array): number {
  let s = 0;
  for (const v of x) s += v * v;
  return Math.sqrt(s / x.length);
}

describe('FaustDsp (test tone)', () => {
  const SR = 48000;

  it('exposes channel counts, parameters and the declared tail', () => {
    const dsp = loadTestTone(SR);
    expect(dsp.numInputs).toBe(0);
    expect(dsp.numOutputs).toBe(1);
    expect(dsp.tailSeconds).toBe(Infinity); // no `declare tail`: never assumed silent
    expect(dsp.paramNames.sort()).toEqual(['freq', 'gain']);
  });

  it('produces a 440 Hz sine at −18 dBFS by default', () => {
    const dsp = loadTestTone(SR);
    const x = renderSeconds(dsp, SR, 1.0).subarray(SR / 2); // skip the smoothing ramp
    expect(estimateFrequency(x, SR)).toBeCloseTo(440, 1);
    expect(rms(x)).toBeCloseTo(0.125 / Math.SQRT2, 3);
  });

  it('follows parameter changes and clamps them to their range', () => {
    const dsp = loadTestTone(SR);
    dsp.setParam('freq', 1000);
    dsp.setParam('gain', 5); // above max: clamped to 1
    expect(dsp.getParam('gain')).toBe(1);
    const x = renderSeconds(dsp, SR, 1.0).subarray(SR / 2);
    expect(estimateFrequency(x, SR)).toBeCloseTo(1000, 0);
    expect(rms(x)).toBeCloseTo(1 / Math.SQRT2, 2);
  });

  it('is free of clicks: no jump between samples larger than a clean sine allows', () => {
    const dsp = loadTestTone(SR);
    const x = renderSeconds(dsp, SR, 10).subarray(SR); // 10 s, skip the smoothing ramp
    // Largest possible step of a sine with amplitude A at frequency f: 2π·f·A / sr.
    const maxStep = ((2 * Math.PI * 440 * 0.125) / SR) * 1.01;
    let worst = 0;
    for (let i = 1; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i]! - x[i - 1]!));
    expect(worst).toBeLessThanOrEqual(maxStep);
  });

  it('runs at 44.1 kHz too', () => {
    const sr = 44100;
    const dsp = loadTestTone(sr);
    const x = renderSeconds(dsp, sr, 1.0).subarray(sr / 2);
    expect(estimateFrequency(x, sr)).toBeCloseTo(440, 1);
  });
});
