/**
 * The Channel (mixer strip at the end of every patch), run on the compiled Faust WebAssembly.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../engine/core/types';
import { FaustDsp, declaredSink, type FaustMeta } from '../engine/faust/FaustDsp';
import { FaustSink } from '../engine/faust/FaustSink';
import { rms } from './testUtils';

const SR = 48000;
const db = (x: number) => 20 * Math.log10(x);

function channel(params: Record<string, number> = {}, connected: [boolean, boolean] = [true, true]) {
  const path = (ext: string) => fileURLToPath(new URL(`./generated/channel.${ext}`, import.meta.url));
  const meta = JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta;
  const dsp = new FaustDsp(new WebAssembly.Module(readFileSync(path('wasm'))), meta, SR);
  const sink = new FaustSink(dsp);
  sink.onConnectionsChanged(connected);
  for (const [k, v] of Object.entries(params)) sink.setParam(k, v);
  return { sink, meta };
}

const sine = (hz: number, amp = 0.5) => (i: number) => amp * Math.sin((2 * Math.PI * hz * i) / SR);

/**
 * Render `seconds` of a 220 Hz tone (left input; right input gets a 330 Hz tone when connected),
 * calling `at(time)` before every block so tests can move controls while it plays.
 */
function render(sink: FaustSink, seconds: number, at: (t: number) => void = () => {}) {
  const total = Math.round(SR * seconds);
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const inL = new Float32Array(BLOCK_SIZE);
  const inR = new Float32Array(BLOCK_SIZE);
  const left = sine(220);
  const right = sine(330);
  for (let pos = 0; pos < total; pos += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - pos);
    at(pos / SR);
    for (let i = 0; i < n; i++) {
      inL[i] = left(pos + i);
      inR[i] = right(pos + i);
    }
    sink.process([inL, inR], [false, false], [], n);
    L.set(sink.outL.subarray(0, n), pos);
    R.set(sink.outR.subarray(0, n), pos);
  }
  return { L, R };
}

/** Second-order highpass (RBJ cookbook). */
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
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * Loudest 2 ms above 5 kHz in the quarter second after `at`, relative to the louder of the level
 * before and after (as in reverb.test; a side that goes silent or wakes up is measured against
 * the level it has when sounding). −Infinity when the side is silent throughout.
 */
function clickDb(x: Float32Array, at: number, span = SR / 4): number {
  const h = highpass(highpass(highpass(highpass(x, 5000), 5000), 5000), 5000);
  const level = Math.max(rms(x.subarray(at - SR / 2, at)), rms(x.subarray(at + span, at + 2 * span)));
  if (level === 0) return -Infinity;
  const n = Math.round(SR * 0.002);
  let worst = -Infinity;
  for (let i = at; i + n <= at + span; i += n) worst = Math.max(worst, db(rms(h.subarray(i, i + n)) / level));
  return worst;
}

const tail = (x: Float32Array) => x.subarray(SR / 2);
const IN_RMS = 0.5 * Math.SQRT1_2;

describe('Channel', () => {
  it('is declared as a sink', () => {
    expect(declaredSink(channel().meta)).toBe(true);
  });

  it('starts at −6 dB and passes both sides at the level gain, like the old Output volume', () => {
    const { L, R } = render(channel().sink, 1);
    expect(rms(tail(L))).toBeCloseTo(IN_RMS * 0.5, 4);
    expect(rms(tail(R))).toBeCloseTo(IN_RMS * 0.5, 4);
    for (const level of [0.25, 1, 2]) {
      const out = render(channel({ level }).sink, 1);
      expect(rms(tail(out.L))).toBeCloseTo(IN_RMS * level, 4);
    }
  });

  it('feeds a mono source (only L patched) to both sides', () => {
    const { L, R } = render(channel({ level: 1 }, [true, false]).sink, 0.6);
    expect(Array.from(tail(R)).every((v, i) => v === tail(L)[i])).toBe(true);
    expect(rms(tail(R))).toBeCloseTo(IN_RMS, 4);
  });

  it('balances: centred passes both sides, turning right fades the left side out', () => {
    const at = (pan: number) => {
      const { L, R } = render(channel({ level: 1, pan }).sink, 1);
      return [rms(tail(L)) / IN_RMS, rms(tail(R)) / IN_RMS];
    };
    const [l0, r0] = at(0);
    expect(l0).toBeCloseTo(1, 3);
    expect(r0).toBeCloseTo(1, 3);
    const [lHalf, rHalf] = at(0.5);
    expect(lHalf).toBeCloseTo(Math.SQRT1_2, 3);
    expect(rHalf).toBeCloseTo(1, 3);
    const [lRight, rRight] = at(1);
    expect(lRight).toBeLessThan(1e-4);
    expect(rRight).toBeCloseTo(1, 3);
    const [lLeft, rLeft] = at(-1);
    expect(lLeft).toBeCloseTo(1, 3);
    expect(rLeft).toBeLessThan(1e-4);
  });

  it('mutes to silence and reports post-fader meters', () => {
    const muted = render(channel({ level: 1, mute: 1 }).sink, 1);
    expect(rms(tail(muted.L))).toBe(0);
    const { sink } = channel({ level: 0.5 });
    render(sink, 0.5);
    const meters = new Float32Array(2);
    sink.readMeters(meters, 0);
    expect(meters[0]).toBeCloseTo(0.25, 2);
    expect(meters[1]).toBeCloseTo(0.25, 2);
  });

  it('never clicks when level, pan or mute jump while it plays', () => {
    const cases: [string, Record<string, number>, Record<string, number>][] = [
      ['level 1 → 0.1', { level: 1 }, { level: 0.1 }],
      ['level 0.1 → 2', { level: 0.1 }, { level: 2 }],
      ['pan L → R', { level: 1, pan: -1 }, { pan: 1 }],
      ['mute on', { level: 1 }, { mute: 1 }],
      ['mute off', { level: 1, mute: 1 }, { mute: 0 }],
    ];
    for (const [name, start, jump] of cases) {
      const { sink } = channel(start);
      const { L, R } = render(sink, 1.5, (t) => {
        if (t === 1) for (const [k, v] of Object.entries(jump)) sink.setParam(k, v);
      });
      expect(clickDb(L, SR), `${name} (left)`).toBeLessThan(-70);
      expect(clickDb(R, SR), `${name} (right)`).toBeLessThan(-70);
    }
  });

  it('is at full level from the first sample after Play, not fading in', () => {
    const { sink } = channel({ level: 1 });
    render(sink, 0.3);
    sink.reset();
    const { L } = render(sink, 0.1);
    expect(rms(L.subarray(0, SR * 0.005)) / IN_RMS).toBeGreaterThan(0.95);
  });

  it('stays finite at extreme settings', () => {
    const { L, R } = render(channel({ level: 2, pan: -1 }).sink, 0.2);
    expect([...L, ...R].every(Number.isFinite)).toBe(true);
  });
});
