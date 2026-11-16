/**
 * Sound-quality and behaviour tests for the Reverb module, run on the compiled Faust WebAssembly.
 * Everything renders offline; nothing is played.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/core/Engine';
import { BLOCK_SIZE } from '../engine/core/types';
import { FaustDsp, type FaustMeta } from '../engine/faust/FaustDsp';
import { FaustSink } from '../engine/faust/FaustSink';
import { powerSpectrum, rms } from './testUtils';

const SR = 48000;

function program(name: string) {
  const path = (ext: string) => fileURLToPath(new URL(`./generated/${name}.${ext}`, import.meta.url));
  return {
    module: new WebAssembly.Module(readFileSync(path('wasm'))),
    meta: JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta,
  };
}
const REVERB = program('reverb');

function reverb(params: Record<string, number> = {}, connected: [boolean, boolean] = [true, true]) {
  const dsp = new FaustDsp(REVERB.module, REVERB.meta, SR);
  dsp.onConnectionsChanged(connected);
  for (const [k, v] of Object.entries(params)) dsp.setParam(k, v);
  return dsp;
}

type Signal = (i: number) => number;
const silence: Signal = () => 0;
const impulse: Signal = (i) => (i === 0 ? 1 : 0);
const sine = (hz: number, amp = 0.5): Signal => (i) => amp * Math.sin((2 * Math.PI * hz * i) / SR);
/** Deterministic white noise in −amp..amp. */
function noise(amp = 0.5, seed = 1): Signal {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return amp * (s / 2 ** 31 - 1);
  };
}

/**
 * Render `seconds` of stereo output. `right` = null leaves the right input unpatched.
 * `atSample` is called before each block (to move knobs while rendering).
 */
function render(
  dsp: FaustDsp,
  seconds: number,
  left: Signal,
  right: Signal | null = left,
  atSample?: (pos: number) => void,
) {
  const total = Math.round(SR * seconds);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const inL = new Float32Array(BLOCK_SIZE);
  const inR = new Float32Array(BLOCK_SIZE);
  const outL = new Float32Array(BLOCK_SIZE);
  const outR = new Float32Array(BLOCK_SIZE);
  for (let pos = 0; pos < total; pos += BLOCK_SIZE) {
    atSample?.(pos);
    const n = Math.min(BLOCK_SIZE, total - pos);
    let silentL = true;
    let silentR = true;
    for (let k = 0; k < n; k++) {
      inL[k] = left(pos + k);
      inR[k] = right ? right(pos + k) : 0;
      if (inL[k] !== 0) silentL = false;
      if (inR[k] !== 0) silentR = false;
    }
    dsp.process([inL, inR], [silentL, silentR], [outL, outR], n);
    L.set(outL.subarray(0, n), pos);
    R.set(outR.subarray(0, n), pos);
  }
  return { L, R };
}

const db = (x: number) => 20 * Math.log10(x);

/** Second-order bandpass (RBJ cookbook, constant 0 dB peak gain). */
function bandpass(x: Float32Array, hz: number, q = 1.4): Float32Array {
  const w = (2 * Math.PI * hz) / SR;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]!; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * Decay time (T60) from an impulse response: Schroeder backward integration, slope fitted
 * between −5 and −25 dB and extrapolated to −60 dB.
 */
function t60(ir: Float32Array): number {
  const edc = new Float64Array(ir.length);
  let acc = 0;
  for (let i = ir.length - 1; i >= 0; i--) {
    acc += ir[i]! * ir[i]!;
    edc[i] = acc;
  }
  const level = (i: number) => 10 * Math.log10(edc[i]! / edc[0]!);
  let i5 = 0;
  while (level(i5) > -5) i5++;
  let i25 = i5;
  while (level(i25) > -25) i25++;
  return ((i25 - i5) / SR) * (60 / 20);
}

/** Energy-weighted mean frequency of a stretch of signal. */
function centroid(x: Float32Array): number {
  const p = powerSpectrum(x);
  let num = 0;
  let den = 0;
  for (let k = 1; k < p.length; k++) {
    num += k * p[k]!;
    den += p[k]!;
  }
  return ((num / den) * SR) / (2 * p.length);
}

/** 2nd-order highpass (RBJ cookbook, Q 0.707). */
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
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]!; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * A click is a short broadband burst. Returns the loudest 2 ms of content above 5 kHz in the
 * quarter second after `at`, in dB relative to the signal's overall level before `at`.
 */
function clickDb(x: Float32Array, at: number, span = SR / 4): number {
  // Four stages (48 dB/octave), so the 220 Hz test tone itself is filtered out completely.
  const h = highpass(highpass(highpass(highpass(x, 5000), 5000), 5000), 5000);
  const level = rms(x.subarray(at - SR / 2, at));
  const n = Math.round(SR * 0.002);
  let worst = -Infinity;
  for (let i = at; i + n <= at + span; i += n) worst = Math.max(worst, db(rms(h.subarray(i, i + n)) / level));
  return worst;
}

describe('Reverb', () => {
  it('decays in about the time set with Size', () => {
    for (const size of [0.8, 2.5, 6]) {
      // Measured around 1 kHz: Size sets the midrange decay (bass decays longer, highs faster).
      const { L } = render(reverb({ size, mix: 1, damping: 0, predelay: 0 }), size * 1.5 + 0.5, impulse);
      const measured = t60(bandpass(L, 1000));
      expect(measured, `size ${size} s`).toBeGreaterThan(size * 0.8);
      expect(measured, `size ${size} s`).toBeLessThan(size * 1.25);
    }
  });

  it('starts the reverb after the pre-delay', () => {
    const onset = (predelay: number) => {
      const { L } = render(reverb({ predelay, mix: 1 }), 0.4, impulse);
      return L.findIndex((v) => Math.abs(v) > 1e-4) / SR;
    };
    const base = onset(0);
    expect(base).toBeGreaterThan(0.005); // the diffusers themselves take ~13 ms
    expect(onset(100) - base).toBeCloseTo(0.1, 2);
  });

  it('makes the tail darker with more damping', () => {
    const tail = (damping: number) => {
      const { L } = render(reverb({ size: 3, damping, mix: 1 }), 1.5, impulse);
      return centroid(L.subarray(SR / 2, SR / 2 + 32768));
    };
    const bright = tail(0);
    const dark = tail(1);
    expect(dark).toBeLessThan(bright * 0.5);
  });

  it('passes the dry signal unchanged at mix 0 and only reverb at mix 1', () => {
    const dry = render(reverb({ mix: 0 }), 0.5, sine(440), sine(330));
    const settle = SR / 4;
    for (let i = settle; i < dry.L.length; i++) {
      expect(dry.L[i]).toBeCloseTo(sine(440)(i), 4);
      expect(dry.R[i]).toBeCloseTo(sine(330)(i), 4);
    }
    // At mix 1 an impulse doesn't come straight through: nothing before the reverb starts.
    const wet = render(reverb({ mix: 1, predelay: 0 }), 0.1, impulse);
    expect(Math.max(...wet.L.subarray(0, 200).map(Math.abs))).toBeLessThan(1e-6);
  });

  it('feeds a mono source on L to both sides when R is unpatched', () => {
    const mono = render(reverb({ mix: 1 }, [true, false]), 1, impulse, null);
    const both = render(reverb({ mix: 1 }), 1, impulse, impulse);
    expect(rms(mono.R)).toBeGreaterThan(0.5 * rms(mono.L));
    for (let i = 0; i < mono.L.length; i += 97) {
      expect(mono.L[i]).toBeCloseTo(both.L[i]!, 6);
      expect(mono.R[i]).toBeCloseTo(both.R[i]!, 6);
    }
    // Left and right tails are different (that is what makes it sound wide).
    let corr = 0;
    for (let i = 0; i < mono.L.length; i++) corr += mono.L[i]! * mono.R[i]!;
    corr /= mono.L.length * rms(mono.L) * rms(mono.R);
    expect(Math.abs(corr)).toBeLessThan(0.3);
  });

  it('keeps a similar loudness across sizes', () => {
    const level = (size: number) => rms(render(reverb({ size, mix: 1 }), 4, noise(0.3)).L.subarray(SR * 3));
    const levels = [0.3, 1, 2.5, 6, 12].map((size) => db(level(size)));
    const spread = Math.max(...levels) - Math.min(...levels);
    // Measured: 0.3 s −17.5, 1 s −20.1, 2.5 s −21.2, 6 s −20.9, 12 s −20.0 dB (white noise in).
    expect(spread).toBeLessThan(4.5);
  });

  it('stays stable and finite at extreme settings', () => {
    const dsp = reverb({ size: 12, damping: 0, predelay: 150, mix: 1 });
    const loud = render(dsp, 8, noise(1));
    let peak = 0;
    for (const x of [loud.L, loud.R]) for (const v of x) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeLessThan(4);
    // ...and dies away once the input stops.
    const after = render(dsp, 40, silence);
    expect(rms(after.L.subarray(after.L.length - SR))).toBeLessThan(1e-6);
  });

  // Click measurements: a steady 220 Hz tone through the reverb, then one knob jumps from one
  // end to the other in a single block. A click would show up as a burst of high frequencies.
  const KNOB_JUMPS: [string, number, number][] = [
    ['size', 0.5, 10],
    ['size', 10, 0.5],
    ['damping', 0, 1],
    ['damping', 1, 0],
    ['predelay', 0, 150],
    ['predelay', 150, 0],
    ['mix', 0, 1],
    ['mix', 1, 0],
  ];
  for (const [param, from, to] of KNOB_JUMPS) {
    it(`does not click when ${param} jumps from ${from} to ${to}`, () => {
      const jumpAt = SR * 3;
      const dsp = reverb({ size: 2, mix: 0.5, [param]: from });
      const { L } = render(dsp, 3.5, sine(220), sine(220), (pos) => {
        if (pos === jumpAt) dsp.setParam(param, to);
      });
      expect(clickDb(L, jumpAt), `${param}: high-frequency burst (dB)`).toBeLessThan(-70);
    });
  }

  it('would detect a real click', () => {
    const { L } = render(reverb({ mix: 0.5 }), 3.5, sine(220));
    L[SR * 3 + 100] = L[SR * 3 + 100]! + 0.05; // a small step-like spike
    expect(clickDb(L, SR * 3)).toBeGreaterThan(-50);
  });
});

describe('Reverb in a patch', () => {
  it('keeps rendering through the pre-delay and the tail, then goes to sleep', () => {
    const out = program('output');
    const engine = new Engine(SR, {
      'faust:reverb': (sr) => new FaustDsp(REVERB.module, REVERB.meta, sr),
      'faust:output': (sr) => new FaustSink(new FaustDsp(out.module, out.meta, sr)),
      // A source that plays one click and then stays silent.
      'test:click': () => {
        let done = false;
        return {
          numInputs: 0,
          numOutputs: 1,
          tailSeconds: Infinity,
          setParam() {},
          process(_i, _s, outputs, frames) {
            outputs[0]!.fill(0, 0, frames);
            if (!done) outputs[0]![0] = 1;
            done = true;
          },
          reset() {},
        };
      },
    });
    engine.setPatch({
      nodes: [
        { id: 'click', kind: 'test:click' },
        { id: 'rev', kind: 'faust:reverb', params: { size: 1, predelay: 150, mix: 1 } },
        { id: 'out', kind: 'faust:output', params: { volume: 1 } },
      ],
      connections: [
        { from: { node: 'click', port: 0 }, to: { node: 'rev', port: 0 } },
        { from: { node: 'rev', port: 0 }, to: { node: 'out', port: 0 } },
        { from: { node: 'rev', port: 1 }, to: { node: 'out', port: 1 } },
      ],
    });
    const L = new Float32Array(SR);
    const R = new Float32Array(SR);
    engine.render(L, R, SR);
    // The reverb arrives after the 150 ms pre-delay (+ the diffusers' own ~13 ms).
    const onset = L.findIndex((v) => Math.abs(v) > 1e-4) / SR;
    expect(onset).toBeGreaterThan(0.15);
    expect(onset).toBeLessThan(0.2);

    // A 1 s reverb has fallen below the silence threshold well within 10 s; then it sleeps.
    const rest = new Float32Array(SR * 10);
    engine.render(rest, new Float32Array(SR * 10), SR * 10);
    expect(engine.stats.sleeping).toBe(1);
  });
});
