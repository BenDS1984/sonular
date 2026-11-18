/**
 * Tests for the Tape Recorder: what it records must be exactly what went in. Everything renders
 * offline; nothing is played.
 */
import { describe, expect, it } from 'vitest';
import { Engine } from '../core/Engine';
import { BLOCK_SIZE, type DspModule, type RecordedAudio } from '../core/types';
import { Recorder } from './Recorder';

const SR = 48000;

/** Run blocks through a recorder; input(c, i) gives channel c at sample i. */
function feed(rec: Recorder, frames: number, input: (c: number, i: number) => number, from = 0) {
  const ins = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  const out = [new Float32Array(frames), new Float32Array(frames)];
  for (let start = 0; start < frames; start += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, frames - start);
    for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) ins[c]![i] = input(c, from + start + i);
    rec.process(ins, [false, false], outs, n);
    for (let c = 0; c < 2; c++) out[c]!.set(outs[c]!.subarray(0, n), start);
  }
  return out;
}

function join(pieces: RecordedAudio[], key: 'left' | 'right') {
  const total = pieces.reduce((n, p) => n + p[key].length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of pieces) {
    out.set(p[key], o);
    o += p[key].length;
  }
  return out;
}

const signal = (c: number, i: number) => (c === 0 ? Math.sin(i * 0.01) * 0.5 : Math.cos(i * 0.013) * 0.3);

describe('Recorder', () => {
  it('passes the sound through unchanged, and records nothing until armed', () => {
    const rec = new Recorder();
    rec.onConnectionsChanged([true, true]);
    const [l, r] = feed(rec, 4800, signal);
    for (let i = 0; i < 4800; i += 97) {
      expect(l![i]).toBeCloseTo(signal(0, i), 6);
      expect(r![i]).toBeCloseTo(signal(1, i), 6);
    }
    expect(rec.takeRecorded()).toBeNull();
  });

  it('records exactly what came in, across many hand-overs, left and right not swapped', () => {
    const rec = new Recorder();
    rec.onConnectionsChanged([true, true]);
    rec.setParam('armed', 1);
    const pieces: RecordedAudio[] = [];
    const total = SR * 2 + 77;
    for (let from = 0; from < total; from += 2400) {
      feed(rec, Math.min(2400, total - from), signal, from);
      const piece = rec.takeRecorded();
      if (piece) pieces.push(piece);
    }
    const left = join(pieces, 'left');
    const right = join(pieces, 'right');
    expect(left.length).toBe(total);
    for (let i = 0; i < total; i++) {
      expect(left[i]).toBe(Math.fround(signal(0, i)));
      expect(right[i]).toBe(Math.fround(signal(1, i)));
    }
    expect(new Set(pieces.map((p) => p.take)).size).toBe(1);
  });

  it('records mono on both sides when only L is patched', () => {
    const rec = new Recorder();
    rec.onConnectionsChanged([true, false]);
    rec.setParam('armed', 1);
    const [, outR] = feed(rec, 1000, signal);
    const piece = rec.takeRecorded()!;
    expect(Array.from(piece.right)).toEqual(Array.from(piece.left));
    expect(outR![500]).toBeCloseTo(signal(0, 500), 6);
  });

  it('starts a new take after disarming and arming again, or after Play (reset)', () => {
    const rec = new Recorder();
    rec.onConnectionsChanged([true, true]);
    rec.setParam('armed', 1);
    feed(rec, 1000, signal);
    const first = rec.takeRecorded()!.take;
    rec.setParam('armed', 0);
    feed(rec, 1000, signal);
    expect(rec.takeRecorded()).toBeNull(); // nothing while disarmed
    rec.setParam('armed', 1);
    feed(rec, 1000, signal);
    const second = rec.takeRecorded()!.take;
    rec.reset();
    feed(rec, 1000, signal);
    const third = rec.takeRecorded()!.take;
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('when armed before Play, starts on the very first sample, even with nothing after it', () => {
    /** Source that outputs the sample count since its last reset (so 0 marks the first beat). */
    class Counter implements DspModule {
      readonly numInputs = 0;
      readonly numOutputs = 1;
      readonly tailSeconds = Infinity;
      private n = 0;
      setParam() {}
      process(_i: readonly Float32Array[], _s: readonly boolean[], outs: readonly Float32Array[], frames: number) {
        for (let i = 0; i < frames; i++) outs[0]![i] = this.n++;
      }
      reset() {
        this.n = 0;
      }
    }
    const engine = new Engine(SR, { counter: () => new Counter(), recorder: () => new Recorder() });
    engine.setPatch({
      nodes: [
        { id: 'src', kind: 'counter' },
        { id: 'rec', kind: 'recorder' },
      ],
      connections: [{ from: { node: 'src', port: 0 }, to: { node: 'rec', port: 0 } }],
    });
    const frames = 4096;
    const buf = () => new Float32Array(frames);
    engine.render(buf(), buf(), frames); // the patch was already running before Play
    engine.collectRecordings(() => {});
    engine.setParam('rec', 'armed', 1);
    engine.restart(); // Play
    engine.render(buf(), buf(), frames);
    const got: RecordedAudio[] = [];
    engine.collectRecordings((_node, a) => got.push(a));
    expect(got).toHaveLength(1);
    expect(got[0]!.left[0]).toBe(0);
    expect(got[0]!.left[frames - 1]).toBe(frames - 1);
  });

  it('reports the peak level since the previous reading', () => {
    const rec = new Recorder();
    rec.onConnectionsChanged([true, true]);
    feed(rec, 2000, (c, i) => (i === 700 ? (c ? -0.4 : 0.9) : 0));
    const m = new Float32Array(2);
    rec.readMeters(m, 0);
    expect(m[0]).toBeCloseTo(0.9, 6);
    expect(m[1]).toBeCloseTo(0.4, 6);
    rec.readMeters(m, 0);
    expect(m[0]).toBe(0);
  });
});
