/**
 * Tests for the TypeScript modules (Clock, Sequencer, Envelope) and for the transport, plus a
 * whole patch Clock -> Sequencer -> Oscillator -> Envelope -> Output. Everything renders
 * offline; nothing is played.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Engine } from '../core/Engine';
import { Transport } from '../core/Transport';
import { BLOCK_SIZE, type DspModule, type EnginePatch } from '../core/types';
import { FaustDsp, type FaustMeta } from '../faust/FaustDsp';
import { FaustSink } from '../faust/FaustSink';
import { estimateFrequency } from '../../dsp/testUtils';
import { Clock, CLOCK_RATIOS } from './Clock';
import { Envelope } from './Envelope';
import { Sequencer } from './Sequencer';
import { NATIVE_MODULES } from './native';

const SR = 48000;

/**
 * Run a module for `seconds`, block by block, with the transport advancing as in the engine.
 * `input(c, i)` gives input c at sample i. Returns every output as one long buffer.
 */
function run(
  module: DspModule,
  seconds: number,
  input: (c: number, i: number) => number = () => 0,
  transport?: Transport,
  onBlock?: (block: number) => void,
): Float32Array[] {
  const total = Math.round(seconds * SR);
  const outs = Array.from({ length: module.numOutputs }, () => new Float32Array(total));
  const ins = Array.from({ length: module.numInputs }, () => new Float32Array(BLOCK_SIZE));
  const silent = ins.map(() => false);
  const blockOuts = outs.map(() => new Float32Array(BLOCK_SIZE));
  for (let start = 0, b = 0; start < total; start += BLOCK_SIZE, b++) {
    onBlock?.(b);
    const n = Math.min(BLOCK_SIZE, total - start);
    for (let c = 0; c < ins.length; c++) for (let i = 0; i < n; i++) ins[c]![i] = input(c, start + i);
    transport?.beginBlock();
    module.process(ins, silent, blockOuts, n);
    transport?.endBlock(n);
    for (let o = 0; o < outs.length; o++) outs[o]!.set(blockOuts[o]!.subarray(0, n), start);
  }
  return outs;
}

/** Sample indexes where a gate goes from low to high. */
function risingEdges(x: Float32Array): number[] {
  const edges: number[] = [];
  let prev = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i]! >= 0.5 && prev < 0.5) edges.push(i);
    prev = x[i]!;
  }
  return edges;
}

/** A gate that is high for the first `width` samples of every `period`. */
const pulses = (period: number, width = period / 2) => (i: number) => (i % period < width ? 1 : 0);

describe('Clock', () => {
  it('pulses each output at its ratio of the tempo, all starting on beat 0', () => {
    const t = new Transport(SR);
    t.setTempo(120); // one beat = 0.5 s = 24000 samples
    const clock = new Clock(t);
    const ratios = ['×4', '×1', '÷3', '÷16'].map((l) => CLOCK_RATIOS.findIndex((r) => r.label === l));
    ratios.forEach((r, o) => clock.setParam(`ratio${o + 1}`, r));
    const outs = run(clock, 33, undefined, t);
    const expected = [6000, 24000, 72000, 384000];
    outs.forEach((out, o) => {
      const edges = risingEdges(out);
      expect(edges[0]).toBe(0);
      // Exact spacing: no drift, even over many periods.
      edges.forEach((e, k) => expect(Math.abs(e - k * expected[o]!)).toBeLessThanOrEqual(1));
      // High for half of each period.
      const high = out.subarray(0, expected[o]!).reduce((a, v) => a + v, 0);
      expect(Math.abs(high - expected[o]! / 2)).toBeLessThanOrEqual(1);
    });
  });

  it('follows a tempo change at once', () => {
    const t = new Transport(SR);
    const clock = new Clock(t);
    clock.setParam('ratio1', CLOCK_RATIOS.findIndex((r) => r.label === '×1'));
    // 120 BPM for the first second (2 beats), then 60 BPM.
    const firstSecond = SR / BLOCK_SIZE;
    const [out] = run(clock, 4, undefined, t, (b) => b === firstSecond && t.setTempo(60));
    const edges = risingEdges(out!);
    expect(edges.slice(0, 2)).toEqual([0, 24000]);
    // Beat 2 lands right at 1 s; from there each beat lasts 1 s.
    expect(edges[2]).toBe(48000);
    expect(Math.abs(edges[3]! - 96000)).toBeLessThanOrEqual(1);
  });
});

describe('Sequencer', () => {
  const NOTES = [0, 2, 4, 5, 7, 9, 11, 12];

  function sequencer(off: number[] = []) {
    const seq = new Sequencer();
    NOTES.forEach((st, s) => seq.setParam(`pitch${s + 1}`, st));
    off.forEach((s) => seq.setParam(`on${s}`, 0));
    return seq;
  }

  it('moves one step per clock pulse and wraps after eight', () => {
    const period = 4800;
    const [pitch, gate] = run(sequencer(), (period * 10) / SR, (_c, i) => pulses(period)(i));
    for (let k = 0; k < 10; k++) {
      // Pitch changes exactly on the clock edge and holds until the next one.
      expect(pitch![k * period]).toBeCloseTo(NOTES[k % 8]! / 12, 6);
      expect(pitch![k * period + period - 1]).toBeCloseTo(NOTES[k % 8]! / 12, 6);
    }
    expect(risingEdges(gate!)).toHaveLength(10);
  });

  it('keeps the gate low on steps that are off, and the pitch moving', () => {
    const period = 4800;
    const [pitch, gate] = run(sequencer([2, 5]), (period * 8) / SR, (_c, i) => pulses(period)(i));
    const gates = Array.from({ length: 8 }, (_, k) => gate![k * period + 10]);
    expect(gates).toEqual([1, 0, 1, 1, 0, 1, 1, 1]);
    expect(pitch![period + 10]).toBeCloseTo(2 / 12, 6);
  });

  it('starts again at step 1 after a reset', () => {
    const seq = sequencer();
    run(seq, 0.5, (_c, i) => pulses(4800)(i));
    seq.reset();
    const [pitch] = run(seq, 0.05, (_c, i) => pulses(4800)(i));
    expect(pitch![10]).toBe(0);
  });
});

describe('Envelope', () => {
  function envelope(params: Record<string, number>) {
    const env = new Envelope(SR);
    for (const [k, v] of Object.entries(params)) env.setParam(k, v);
    return env;
  }
  const gateFor = (seconds: number) => (c: number, i: number) => (c === 0 ? (i < seconds * SR ? 1 : 0) : 0.5);

  it('rises in the attack time, settles at the sustain level and releases in the release time', () => {
    const env = envelope({ attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 });
    const [out, level] = run(env, 1, gateFor(0.5));
    const peakAt = level!.findIndex((v) => v >= 1);
    expect(Math.abs(peakAt - 0.01 * SR)).toBeLessThan(3);
    expect(level![Math.round(0.4 * SR)]).toBeCloseTo(0.5, 3);
    // Release: −60 dB (0.5 → 0.0005) after 0.2 s.
    expect(level![Math.round(0.7 * SR)]).toBeCloseTo(0.0005, 4);
    // The VCA multiplies the audio input by the envelope.
    expect(out![Math.round(0.4 * SR)]).toBeCloseTo(0.25, 3);
  });

  it('retriggers from the current level, without jumps', () => {
    const env = envelope({ attack: 0.005, decay: 0.05, sustain: 0.3, release: 0.5 });
    // Gate on 0.2 s, off 0.05 s (half-way through the release), on again.
    const [, level] = run(env, 0.5, (c, i) => (c === 1 ? 0 : i < 0.2 * SR || i >= 0.25 * SR ? 1 : 0));
    let maxStep = 0;
    for (let i = 1; i < level!.length; i++) maxStep = Math.max(maxStep, Math.abs(level![i]! - level![i - 1]!));
    // The steepest move is the 5 ms attack: about 1/240 per sample, never a jump.
    expect(maxStep).toBeLessThan(0.01);
    expect(level![Math.round(0.25 * SR)]).toBeGreaterThan(0.1);
  });

  it('glides when the sustain knob jumps', () => {
    const env = envelope({ attack: 0.001, decay: 0.001, sustain: 1, release: 0.1 });
    const [, level] = run(env, 0.2, (c) => (c === 0 ? 1 : 0), undefined, (b) => b === 400 && env.setParam('sustain', 0));
    let maxStep = 0;
    for (let i = SR / 10; i < level!.length; i++) maxStep = Math.max(maxStep, Math.abs(level![i]! - level![i - 1]!));
    expect(maxStep).toBeLessThan(0.002);
  });

  it('falls silent after the release, so the engine can let it sleep', () => {
    const [out, level] = run(envelope({ release: 0.05 }), 1, gateFor(0.1));
    expect(level![level!.length - 1]).toBe(0);
    expect(out![out!.length - 1]).toBe(0);
  });
});

describe('Clock, Sequencer and Envelope in a patch', () => {
  function program(name: string) {
    const path = (ext: string) => fileURLToPath(new URL(`../../dsp/generated/${name}.${ext}`, import.meta.url));
    return {
      module: new WebAssembly.Module(readFileSync(path('wasm'))),
      meta: JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta,
    };
  }
  const osc = program('osc');
  const output = program('channel');

  function setup(tempo: number) {
    const engine = new Engine(SR, {
      ...NATIVE_MODULES,
      'faust:osc': (sr) => new FaustDsp(osc.module, osc.meta, sr),
      'faust:channel': (sr) => new FaustSink(new FaustDsp(output.module, output.meta, sr)),
    });
    engine.setTempo(tempo);
    const patch: EnginePatch = {
      nodes: [
        { id: 'clock', kind: 'native:clock', params: { ratio1: 0 } }, // ×4: sixteenth notes
        { id: 'seq', kind: 'native:sequencer', params: { pitch1: 0, pitch2: 12, pitch3: -12, on4: 0 } },
        { id: 'osc', kind: 'faust:osc', params: { wave: 0, level: 0.5 } },
        { id: 'env', kind: 'native:envelope', params: { attack: 0.002, decay: 0.05, sustain: 1, release: 0.01 } },
        { id: 'out', kind: 'faust:channel', params: { level: 1 } },
      ],
      connections: [
        { from: { node: 'clock', port: 0 }, to: { node: 'seq', port: 0 } },
        { from: { node: 'seq', port: 0 }, to: { node: 'osc', port: 0 } },
        { from: { node: 'seq', port: 1 }, to: { node: 'env', port: 0 } },
        { from: { node: 'osc', port: 0 }, to: { node: 'env', port: 1 } },
        { from: { node: 'env', port: 0 }, to: { node: 'out', port: 0 } },
      ],
    };
    engine.setPatch(patch);
    engine.restart();
    return engine;
  }

  it('plays the steps as notes of the right pitch, in time', () => {
    const engine = setup(120); // sixteenths every 0.125 s, gate open for the first 62.5 ms
    const L = new Float32Array(SR);
    engine.render(L, new Float32Array(SR), SR);
    const sixteenth = SR / 8;
    const note = (k: number) => L.subarray(k * sixteenth + 600, k * sixteenth + 2400);
    expect(estimateFrequency(note(0))).toBeCloseTo(261.63, 0);
    expect(estimateFrequency(note(1))).toBeCloseTo(523.25, 0);
    expect(estimateFrequency(note(2))).toBeCloseTo(130.81, 0);
    // Step 4 is off: silence. Between notes (gate closed, 10 ms release) as well.
    expect(Math.max(...note(3).map(Math.abs))).toBe(0);
    expect(Math.max(...L.subarray(sixteenth - 2000, sixteenth).map(Math.abs))).toBeLessThan(1e-4);
  });

  it('starts from the first step again after a restart', () => {
    const engine = setup(120);
    engine.render(new Float32Array(SR), new Float32Array(SR), SR * 0.3);
    engine.restart();
    expect(engine.transport.beat).toBe(0);
    const L = new Float32Array(2400);
    engine.render(L, new Float32Array(2400), 2400);
    expect(estimateFrequency(L.subarray(600))).toBeCloseTo(261.63, 0);
  });
});
