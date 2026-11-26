import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE, type EnginePatch, type SampleData } from '../core/types';
import { Engine } from '../core/Engine';
import { NATIVE_MODULES } from './native';
import { Sampler } from './Sampler';

const SR = 48000;

/** A ramp 0, 1, 2 ... (scaled to stay under 1), so the playing position can be read from the output. */
function ramp(length: number, rate = SR, stereo = false): SampleData {
  const left = Float32Array.from({ length }, (_, i) => i / length);
  return { left, right: stereo ? Float32Array.from(left, (v) => -v) : null, sampleRate: rate };
}

function run(s: Sampler, seconds: number, gate: (i: number) => number, onBlock?: (b: number) => void) {
  const total = Math.round(seconds * SR);
  const outL = new Float32Array(total);
  const outR = new Float32Array(total);
  const inp = [new Float32Array(BLOCK_SIZE)];
  const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  for (let start = 0, b = 0; start < total; start += BLOCK_SIZE, b++) {
    onBlock?.(b);
    const n = Math.min(BLOCK_SIZE, total - start);
    for (let i = 0; i < n; i++) inp[0]![i] = gate(start + i);
    s.process(inp, [false], outs, n);
    outL.set(outs[0]!.subarray(0, n), start);
    outR.set(outs[1]!.subarray(0, n), start);
  }
  return { L: outL, R: outR };
}

function sampler(data: SampleData | null, params: Record<string, number> = {}) {
  const s = new Sampler(SR);
  s.setSample(data);
  for (const [k, v] of Object.entries({ level: 1, ...params })) s.setParam(k, v);
  s.reset();
  return s;
}

/** A gate that goes high at sample `at` and stays high for 100 samples. */
const pulseAt = (at: number) => (i: number) => (i >= at && i < at + 100 ? 1 : 0);

describe('Sampler', () => {
  it('is silent until a gate comes, then plays the sample from the start', () => {
    const { L } = run(sampler(ramp(1000)), 0.05, pulseAt(480));
    expect(Math.max(...L.subarray(0, 480).map(Math.abs))).toBe(0);
    expect(L[480]).toBeCloseTo(0, 6);
    expect(L[480 + 500]).toBeCloseTo(0.5, 3);
  });

  it('plays to the end, also when the gate is already low, and then stops', () => {
    const { L } = run(sampler(ramp(1000)), 0.05, pulseAt(0));
    expect(L[900]).toBeGreaterThan(0.85);
    expect(Math.max(...L.subarray(1100).map(Math.abs))).toBe(0);
  });

  it('tune changes the speed: +12 semitones plays twice as fast, −12 half as fast', () => {
    const up = run(sampler(ramp(4000), { tune: 12 }), 0.05, pulseAt(0));
    expect(up.L[500]).toBeCloseTo(0.25, 3); // at 2x speed sample 1000 of 4000
    const down = run(sampler(ramp(4000), { tune: -12 }), 0.05, pulseAt(0));
    expect(down.L[1000]).toBeCloseTo(0.125, 3); // at 0.5x speed sample 500 of 4000
  });

  it('allows for the sample rate of the file: a 24 kHz sample plays at the right pitch', () => {
    const { L } = run(sampler(ramp(2000, 24000)), 0.05, pulseAt(0));
    expect(L[1000]).toBeCloseTo(0.25, 3); // 1000 output samples = 500 sample samples of 2000
  });

  it('starts where "start" says', () => {
    const { L } = run(sampler(ramp(1000), { start: 0.5 }), 0.05, pulseAt(0));
    expect(L[0]).toBeCloseTo(0.5, 2);
  });

  it('a new gate restarts the sample, and the old playback fades out without a jump', () => {
    const gate = (i: number) => (i % 2000 < 100 ? 1 : 0);
    const { L } = run(sampler(ramp(48000)), 0.2, gate);
    // After the retrigger at 2000 the sample is back at the start (a small value again).
    expect(L[2000 + 400]).toBeLessThan(0.02);
    // No jump anywhere: the biggest step is far smaller than the ramp's size.
    let worst = 0;
    for (let i = 1; i < L.length; i++) worst = Math.max(worst, Math.abs(L[i]! - L[i - 1]!));
    expect(worst).toBeLessThan(0.05);
  });

  it('plays a stereo sample on both channels, a mono one on both the same', () => {
    const stereo = run(sampler(ramp(1000, SR, true)), 0.05, pulseAt(0));
    expect(stereo.L[500]).toBeCloseTo(0.5, 3);
    expect(stereo.R[500]).toBeCloseTo(-0.5, 3);
    const mono = run(sampler(ramp(1000)), 0.05, pulseAt(0));
    for (let i = 0; i < 1000; i++) expect(mono.R[i]).toBe(mono.L[i]);
  });

  it('applies level, and stays silent without a sample', () => {
    const half = run(sampler(ramp(1000), { level: 0.5 }), 0.05, pulseAt(0));
    expect(half.L[500]).toBeCloseTo(0.25, 2);
    const none = run(sampler(null), 0.05, pulseAt(0));
    expect(Math.max(...none.L.map(Math.abs))).toBe(0);
  });

  it('reports where it is while playing', () => {
    const s = sampler(ramp(48000));
    run(s, 0.25, pulseAt(0)); // 12000 of 48000 samples
    const m = new Float32Array(2);
    s.readMeters(m, 0);
    expect(m[0]).toBeCloseTo(0.25, 2);
    expect(m[1]).toBe(1);
    run(s, 1.5, () => 0);
    s.readMeters(m, 0);
    expect(m[1]).toBe(0);
  });

  it('gets its sample from the engine, by the hash set on the node', () => {
    const engine = new Engine(SR, { ...NATIVE_MODULES });
    const hash = 'a'.repeat(64);
    const patch: EnginePatch = {
      nodes: [
        { id: 'gate', kind: 'native:clock', params: {} },
        { id: 's', kind: 'native:sampler', params: { level: 1 }, sample: hash },
      ],
      connections: [{ from: { node: 'gate', port: 0 }, to: { node: 's', port: 0 } }],
    };
    engine.setPatch(patch);
    engine.addSample(hash, ramp(1000));
    engine.restart();
    // The Sampler observes (isObserver), so it renders even with nothing on its outputs.
    engine.render(new Float32Array(SR), new Float32Array(SR), SR / 4);
    const meters = new Float32Array(engine.meterValueCount);
    engine.readMeters(meters);
    const names = engine.meterLayout.flatMap((e) => e.names.map((n) => `${e.node}:${n}`));
    expect(names).toContain('s:position');
  });
});

describe('Sampler attack and decay', () => {
  /** Two seconds of a constant 0.5, so the output is the envelope itself (times 0.5). */
  const flat = (): SampleData => ({ left: new Float32Array(SR * 2).fill(0.5), right: null, sampleRate: SR });

  it('with Attack at its minimum and Decay off, nothing changes', () => {
    const { L } = run(sampler(flat(), { attack: 0.001, decay: 10 }), 0.5, pulseAt(0));
    expect(L[0]).toBeCloseTo(0.5, 6);
    expect(L[SR * 0.4]).toBeCloseTo(0.5, 6);
  });

  it('Attack fades the sound in over its time', () => {
    const { L } = run(sampler(flat(), { attack: 0.1, decay: 10 }), 0.3, pulseAt(0));
    expect(L[0]).toBeCloseTo(0, 6);
    expect(L[Math.round(0.05 * SR)]).toBeCloseTo(0.25, 2);
    expect(L[Math.round(0.15 * SR)]).toBeCloseTo(0.5, 6);
  });

  it('Decay fades the sound out and stops it, even though the sample is longer', () => {
    const { L } = run(sampler(flat(), { attack: 0.001, decay: 0.2 }), 1, pulseAt(0));
    expect(L[Math.round(0.1 * SR)]).toBeCloseTo(0.5 * 0.25, 2); // halfway: (1 − 0.5)² of full
    expect(Math.max(...L.subarray(Math.round(0.21 * SR)).map(Math.abs))).toBe(0);
    for (let i = 1; i < L.length; i++) expect(Math.abs(L[i]! - L[i - 1]!)).toBeLessThan(0.002);
  });

  it('a new gate starts Attack again without a click', () => {
    const { L } = run(sampler(flat(), { attack: 0.05, decay: 10 }), 0.5, (i) => (i === 0 || i === Math.round(0.2 * SR) ? 1 : 0));
    let biggest = 0;
    for (let i = 1; i < L.length; i++) biggest = Math.max(biggest, Math.abs(L[i]! - L[i - 1]!));
    expect(biggest).toBeLessThan(0.02);
  });
});
