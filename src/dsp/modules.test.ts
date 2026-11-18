/**
 * Sound-quality and behaviour tests for the first three DSP modules (oscillator, mixer, output),
 * run on the actual compiled Faust WebAssembly.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/core/Engine';
import { BLOCK_SIZE } from '../engine/core/types';
import { FaustDsp, declaredSink, type FaustMeta } from '../engine/faust/FaustDsp';
import { FaustSink } from '../engine/faust/FaustSink';
import { aliasingDb, estimateFrequency, naive, rms } from './testUtils';

const SR = 48000;

function program(name: string) {
  const path = (ext: string) => fileURLToPath(new URL(`./generated/${name}.${ext}`, import.meta.url));
  return {
    module: new WebAssembly.Module(readFileSync(path('wasm'))),
    meta: JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta,
  };
}

function load(name: string, sr = SR) {
  const p = program(name);
  return new FaustDsp(p.module, p.meta, sr);
}

/** Render a mono-output module for `seconds`, with an optional constant on input 0. */
function render(dsp: FaustDsp, seconds: number, input = 0, sr = SR): Float32Array {
  const total = Math.round(sr * seconds);
  const out = new Float32Array(total);
  const inBuf = new Float32Array(BLOCK_SIZE).fill(input);
  const outBuf = new Float32Array(BLOCK_SIZE);
  for (let pos = 0; pos < total; pos += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - pos);
    dsp.process(dsp.numInputs ? [inBuf] : [], [input === 0], [outBuf], n);
    out.set(outBuf.subarray(0, n), pos);
  }
  return out;
}

const WAVES = { sine: 0, triangle: 1, saw: 2, square: 3 } as const;

describe('Oscillator', () => {
  it('plays C4 by default and follows tune, fine and the pitch input', () => {
    const osc = load('osc');
    osc.setParam('wave', WAVES.sine);
    expect(estimateFrequency(render(osc, 1).subarray(SR / 2))).toBeCloseTo(261.63, 1);

    const up = load('osc');
    up.setParam('wave', WAVES.sine);
    expect(estimateFrequency(render(up, 1, 1).subarray(SR / 2))).toBeCloseTo(523.25, 1); // +1 octave

    const tuned = load('osc');
    tuned.setParam('wave', WAVES.sine);
    tuned.setParam('tune', 7);
    tuned.setParam('fine', 50);
    // C4 + 7.5 semitones
    expect(estimateFrequency(render(tuned, 1).subarray(SR / 2))).toBeCloseTo(261.6256 * 2 ** (7.5 / 12), 0);
  });

  it('outputs the set level', () => {
    const osc = load('osc');
    osc.setParam('wave', WAVES.sine);
    osc.setParam('level', 0.5);
    expect(rms(render(osc, 1).subarray(SR / 2))).toBeCloseTo(0.5 / Math.SQRT2, 3);
  });

  // Aliasing is measured below 12 kHz, where inharmonic components are most audible, at
  // fundamentals that don't divide the sample rate evenly.
  const N = 1 << 16;
  const LIMIT = 12000;
  const measured: Record<string, string> = {};
  const MAX_ALIAS_DB = { saw: -70, square: -70, triangle: -60 } as const;

  function renderAt(shape: keyof typeof WAVES, freq: number, length: number) {
    const osc = load('osc');
    osc.setParam('wave', WAVES[shape]);
    osc.setParam('level', 1);
    // Reach the frequency through the pitch input: log2(freq / C4) octaves.
    return render(osc, (SR / 2 + length) / SR, Math.log2(freq / 261.6255653)).subarray(SR / 2, SR / 2 + length);
  }

  for (const shape of ['saw', 'square', 'triangle'] as const) {
    it(`${shape}: aliasing stays below ${MAX_ALIAS_DB[shape]} dB up to 7 kHz`, () => {
      const results: string[] = [];
      for (const f of [445, 1783, 3520, 7089]) {
        const bl = aliasingDb(renderAt(shape, f, N), f, SR, LIMIT);
        const nv = aliasingDb(naive(shape, f, N), f, SR, LIMIT);
        results.push(`${f} Hz: ${bl.toFixed(1)} dB (naive ${nv.toFixed(1)})`);
        expect(bl).toBeLessThan(MAX_ALIAS_DB[shape]);
        expect(bl).toBeLessThan(nv - 20);
      }
      measured[shape] = results.join(', ');
    });
  }

  it('reports the aliasing figures', () => {
    // Printed so the numbers can be reported; the assertions are in the tests above.
    console.log('[aliasing below 12 kHz @ 48 kHz]', JSON.stringify(measured, null, 1));
    expect(Object.keys(measured)).toHaveLength(3);
  });

  it('stays well-behaved when the pitch jumps', () => {
    for (const shape of ['saw', 'square', 'triangle'] as const) {
      const osc = load('osc');
      osc.setParam('wave', WAVES[shape]);
      osc.setParam('level', 1);
      const pitchBuf = new Float32Array(BLOCK_SIZE);
      const out = new Float32Array(BLOCK_SIZE);
      let peak = 0;
      for (let b = 0; b < Math.floor(SR / BLOCK_SIZE); b++) {
        // Jump between about 100 Hz and 2 kHz every 50 ms.
        pitchBuf.fill(Math.floor((b * BLOCK_SIZE) / 2400) % 2 ? Math.log2(2000 / 261.63) : Math.log2(100 / 261.63));
        osc.process([pitchBuf], [false], [out], BLOCK_SIZE);
        if (b > 40) for (const v of out) peak = Math.max(peak, Math.abs(v));
      }
      expect(peak, shape).toBeLessThan(1.1);
    }
  });

  it('keeps full amplitude at very low pitch', () => {
    for (const shape of ['saw', 'square', 'triangle'] as const) {
      const x = renderAt(shape, 2, SR);
      const expected = shape === 'square' ? 1 : 1 / Math.sqrt(3);
      expect(rms(x), shape).toBeCloseTo(expected, 2);
    }
  });

  it('changes level smoothly while a knob is being dragged', () => {
    const osc = load('osc');
    osc.setParam('wave', WAVES.sine);
    const pitch = new Float32Array(BLOCK_SIZE);
    const out = new Float32Array(BLOCK_SIZE);
    for (let b = 0; b < 100; b++) osc.process([pitch], [true], [out], BLOCK_SIZE);
    let prev = out[BLOCK_SIZE - 1]!;
    let worst = 0;
    let peak = 0;
    for (let b = 0; b < 1200; b++) {
      // A new level about every 16 ms, like knob updates from the UI.
      if (b % 6 === 0) osc.setParam('level', 0.4 + 0.3 * Math.sin(b / 40));
      osc.process([pitch], [true], [out], BLOCK_SIZE);
      for (const v of out) {
        worst = Math.max(worst, Math.abs(v - prev));
        peak = Math.max(peak, Math.abs(v));
        prev = v;
      }
    }
    // A clean C4 sine at level ≤ 0.7 never steps more than 2π·f·0.7/sr ≈ 0.024 per sample.
    expect(worst).toBeLessThan(0.025);
    expect(peak).toBeLessThanOrEqual(0.7001);
  });

  it('refuses metadata that does not belong to its code', () => {
    const osc = program('osc');
    const mixerMeta = program('mixer').meta;
    expect(() => new FaustDsp(osc.module, mixerMeta, SR)).toThrow(/does not match/);
  });

  it('switches waveform without clicks', () => {
    const osc = load('osc');
    osc.setParam('wave', WAVES.sine);
    const a = render(osc, 0.5);
    osc.setParam('wave', WAVES.triangle);
    const b = render(osc, 0.2);
    const x = new Float32Array(a.length + b.length);
    x.set(a);
    x.set(b, a.length);
    let worst = 0;
    for (let i = SR / 4; i < x.length; i++) worst = Math.max(worst, Math.abs(x[i]! - x[i - 1]!));
    // Both shapes are continuous: steps stay tiny (a click would be a jump of ~1).
    expect(worst).toBeLessThan(0.05);
  });
});

describe('Mixer', () => {
  function mix(setup: (m: FaustDsp) => void, inputs: number[], seconds = 0.3) {
    const m = load('mixer');
    setup(m);
    const ins = inputs.map((v) => new Float32Array(BLOCK_SIZE).fill(v));
    const silent = inputs.map((v) => v === 0);
    const L = new Float32Array(BLOCK_SIZE);
    const R = new Float32Array(BLOCK_SIZE);
    const blocks = Math.ceil((seconds * SR) / BLOCK_SIZE);
    for (let b = 0; b < blocks; b++) m.process(ins, silent, [L, R], BLOCK_SIZE);
    const meters = new Float32Array(m.meterNames.length);
    m.readMeters(meters, 0);
    const meter = (name: string) => meters[m.meterNames.indexOf(name)]!;
    return { L: L[BLOCK_SIZE - 1]!, R: R[BLOCK_SIZE - 1]!, meter };
  }

  it('pans a centred channel at −3 dB to both sides (equal-power law)', () => {
    const r = mix(() => {}, [0.5, 0, 0, 0]);
    expect(r.L).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
    expect(r.R).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
  });

  it('pans hard left and right', () => {
    const left = mix((m) => m.setParam('pan1', -1), [0.5, 0, 0, 0]);
    expect(left.L).toBeCloseTo(0.5, 3);
    expect(left.R).toBeCloseTo(0, 3);
  });

  it('sums channels, applies level, main and mute', () => {
    const r = mix(
      (m) => {
        m.setParam('gain2', 0.5);
        m.setParam('mute3', 1);
        m.setParam('main', 2);
      },
      [0.2, 0.2, 0.9, 0],
    );
    // (0.2 + 0.1) · 0.7071 · 2 ; channel 3 muted
    expect(r.L).toBeCloseTo(0.3 * Math.SQRT1_2 * 2, 3);
  });

  it('reports silent meters before anything has been processed', () => {
    const m = load('mixer');
    const meters = new Float32Array(m.meterNames.length).fill(-1);
    m.readMeters(meters, 0);
    expect(Array.from(meters)).toEqual(new Array(meters.length).fill(0));
  });

  it('reports per-channel and main meters', () => {
    const r = mix(() => {}, [0.5, 0.25, 0, 0]);
    expect(r.meter('meter1')).toBeCloseTo(0.5, 2);
    expect(r.meter('meter2')).toBeCloseTo(0.25, 2);
    expect(r.meter('meter3')).toBeCloseTo(0, 3);
    expect(r.meter('mainL')).toBeCloseTo(0.75 * Math.SQRT1_2, 2);
  });
});

describe('Output and a full patch', () => {
  it('is declared as a sink', () => {
    expect(declaredSink(program('output').meta)).toBe(true);
    expect(declaredSink(program('mixer').meta)).toBe(false);
  });

  it('renders Oscillator -> Mixer -> Output to the master bus at the expected level', () => {
    const progs = { osc: program('osc'), mixer: program('mixer'), output: program('output') };
    const engine = new Engine(SR, {
      'faust:osc': (sr) => new FaustDsp(progs.osc.module, progs.osc.meta, sr),
      'faust:mixer': (sr) => new FaustDsp(progs.mixer.module, progs.mixer.meta, sr),
      'faust:output': (sr) => new FaustSink(new FaustDsp(progs.output.module, progs.output.meta, sr)),
    });
    engine.setPatch({
      nodes: [
        { id: 'osc1', kind: 'faust:osc', params: { wave: WAVES.sine, level: 0.7 } },
        { id: 'mixer1', kind: 'faust:mixer' },
        { id: 'output1', kind: 'faust:output', params: { volume: 0.5 } },
      ],
      connections: [
        { from: { node: 'osc1', port: 0 }, to: { node: 'mixer1', port: 0 } },
        { from: { node: 'mixer1', port: 0 }, to: { node: 'output1', port: 0 } },
        { from: { node: 'mixer1', port: 1 }, to: { node: 'output1', port: 1 } },
      ],
    });
    const total = SR;
    const L = new Float32Array(total);
    const R = new Float32Array(total);
    engine.render(L, R, total);
    const expected = (0.7 / Math.SQRT2) * Math.SQRT1_2 * 0.5;
    expect(rms(L.subarray(SR / 2))).toBeCloseTo(expected, 3);
    expect(rms(R.subarray(SR / 2))).toBeCloseTo(expected, 3);
    expect(engine.meterLayout.map((e) => e.node)).toEqual(['mixer1', 'output1']);
  });

  it('plays at full level from the very start after Play, not fading in', () => {
    // Play clears every module. Knob smoothers used to restart from zero then and fade in over
    // ~60 ms per module, so the start of the first note was missing (2026-11-18).
    const progs = { osc: program('osc'), mixer: program('mixer'), output: program('output') };
    const engine = new Engine(SR, {
      'faust:osc': (sr) => new FaustDsp(progs.osc.module, progs.osc.meta, sr),
      'faust:mixer': (sr) => new FaustDsp(progs.mixer.module, progs.mixer.meta, sr),
      'faust:output': (sr) => new FaustSink(new FaustDsp(progs.output.module, progs.output.meta, sr)),
    });
    engine.setPatch({
      nodes: [
        { id: 'osc1', kind: 'faust:osc', params: { wave: WAVES.square, level: 0.7, tune: 7 } },
        { id: 'mixer1', kind: 'faust:mixer', params: { pan1: -1 } },
        { id: 'output1', kind: 'faust:output', params: { volume: 0.5 } },
      ],
      connections: [
        { from: { node: 'osc1', port: 0 }, to: { node: 'mixer1', port: 0 } },
        { from: { node: 'mixer1', port: 0 }, to: { node: 'output1', port: 0 } },
        { from: { node: 'mixer1', port: 1 }, to: { node: 'output1', port: 1 } },
      ],
    });
    const run = (frames: number) => {
      const L = new Float32Array(frames);
      const R = new Float32Array(frames);
      engine.render(L, R, frames);
      return { L, R };
    };
    run(SR); // playing for a while
    engine.restart(); // Play
    const { L, R } = run(SR / 2);
    const ms = (a: number, b: number, x: Float32Array) => rms(x.subarray((a * SR) / 1000, (b * SR) / 1000));
    // Full level within the first 5 ms, the same as later on, and still panned hard left.
    expect(ms(0, 5, L) / ms(200, 400, L)).toBeGreaterThan(0.95);
    expect(ms(0, 5, R)).toBeLessThan(0.01 * ms(200, 400, L));
    // Already at the tuned pitch (G4, +7 semitones), not gliding up from C4.
    expect(estimateFrequency(L.subarray(0, SR / 10))).toBeCloseTo(261.6256 * 2 ** (7 / 12), 0);
  });
});
