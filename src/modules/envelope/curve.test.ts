import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../../engine/core/types';
import { Envelope } from '../../engine/modules/Envelope';
import { attackLevel, attackTime, decayLevel, decayTime, dotAt, layout, releaseLevel, releaseTime, shape, stageWeight } from './curve';

const SR = 48000;

/** The engine's envelope level per sample, for a gate that is high until `gateOff` seconds. */
function levels(params: { attack: number; decay: number; sustain: number; release: number }, gateOff: number, seconds: number): Float32Array {
  const env = new Envelope(SR);
  for (const [k, v] of Object.entries(params)) env.setParam(k, v);
  const total = Math.round(seconds * SR);
  const out = new Float32Array(total);
  const gate = [new Float32Array(BLOCK_SIZE)];
  const o = [new Float32Array(BLOCK_SIZE)];
  for (let start = 0; start < total; start += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - start);
    for (let i = 0; i < n; i++) gate[0]![i] = start + i < gateOff * SR ? 1 : 0;
    env.process(gate, [false], o, n);
    out.set(o[0]!.subarray(0, n), start);
  }
  return out;
}

describe('Envelope drawing', () => {
  const p = { attack: 0.2, decay: 0.5, sustain: 0.4, release: 0.8 };
  const level = levels(p, 3, 5);
  const at = (seconds: number) => level[Math.round(seconds * SR)]!;

  it('the attack curve is the one the engine plays', () => {
    for (const f of [0.1, 0.4, 0.7, 0.95]) expect(attackLevel(f)).toBeCloseTo(at(f * p.attack), 2);
  });

  it('the decay curve is the one the engine plays', () => {
    for (const f of [0.1, 0.4, 0.7]) expect(decayLevel(f, p.sustain)).toBeCloseTo(at(p.attack + f * p.decay), 2);
  });

  it('the release curve is the one the engine plays', () => {
    for (const f of [0.1, 0.4, 0.7]) expect(releaseLevel(f, p.sustain)).toBeCloseTo(at(3 + f * p.release), 2);
  });

  it('the inverse functions find the place in the stage again', () => {
    for (const f of [0.1, 0.5, 0.9]) {
      expect(attackTime(attackLevel(f))).toBeCloseTo(f, 3);
      expect(decayTime(decayLevel(f, 0.3), 0.3)).toBeCloseTo(f, 3);
      expect(releaseTime(releaseLevel(f, 0.6), 0.6)).toBeCloseTo(f, 3);
    }
  });

  it('gives each stage room: short ones stay visible, long ones do not take everything', () => {
    expect(stageWeight(0.001)).toBeGreaterThan(0.1);
    expect(stageWeight(10)).toBeCloseTo(1, 6);
    const { x } = layout(0.001, 0.001, 10);
    expect(x[0]).toBe(0);
    expect(x[4]).toBeCloseTo(1, 9);
    for (let i = 1; i < x.length; i++) expect(x[i]! - x[i - 1]!).toBeGreaterThan(0.05);
  });

  it('draws from zero up to one, down to the sustain level and away', () => {
    const pts = shape(p.attack, p.decay, p.sustain, p.release);
    expect(pts[0]).toEqual([0, 0]);
    expect(Math.max(...pts.map((q) => q[1]))).toBeCloseTo(1, 6);
    expect(pts[pts.length - 1]![0]).toBeCloseTo(1, 9);
    expect(pts[pts.length - 1]![1]).toBeLessThan(0.001);
    for (let i = 1; i < pts.length; i++) expect(pts[i]![0]).toBeGreaterThanOrEqual(pts[i - 1]![0]);
  });

  it('puts the live dot in the stage the engine is in, and rests on the sustain part', () => {
    expect(dotAt(0, 0, p.attack, p.decay, p.sustain, p.release)).toBeNull();
    const { x } = layout(p.attack, p.decay, p.release);
    const a = dotAt(1, attackLevel(0.5), p.attack, p.decay, p.sustain, p.release)!;
    expect(a[0]).toBeCloseTo(x[0]! + (x[1]! - x[0]!) * 0.5, 3);
    const s = dotAt(2, p.sustain, p.attack, p.decay, p.sustain, p.release)!;
    expect(s[0]).toBeGreaterThan(x[2]!);
    expect(s[0]).toBeLessThan(x[3]!);
    const r = dotAt(3, 0.1, p.attack, p.decay, p.sustain, p.release)!;
    expect(r[0]).toBeGreaterThan(x[3]!);
  });
});
