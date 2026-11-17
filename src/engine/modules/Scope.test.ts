/**
 * Tests for the oscilloscope: pass-through, trigger, the picture it records, and that the
 * engine runs it even when it only has inputs. Everything renders offline; nothing is played.
 */
import { describe, expect, it } from 'vitest';
import { Engine } from '../core/Engine';
import { BLOCK_SIZE, type DspModule } from '../core/types';
import { Scope, SCOPE_COLUMNS } from './Scope';

const SR = 48000;
const C = SCOPE_COLUMNS;

/** Feed `seconds` of input to a scope, block by block; returns the outputs as long buffers. */
function feed(scope: Scope, seconds: number, input: (c: number, i: number) => number, from = 0): Float32Array[] {
  const total = Math.round(seconds * SR);
  const outs = [new Float32Array(total), new Float32Array(total)];
  const ins = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  const blockOuts = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  for (let start = 0; start < total; start += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - start);
    for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) ins[c]![i] = input(c, from + start + i);
    scope.process(ins, [false, false], blockOuts, n);
    for (let c = 0; c < 2; c++) outs[c]!.set(blockOuts[c]!.subarray(0, n), start);
  }
  return outs;
}

function picture(scope: Scope): Float32Array {
  const out = new Float32Array(scope.displayLength);
  scope.readDisplay(out, 0);
  return out;
}

/** Column midpoints of a channel (0 = A, 1 = B). */
function trace(p: Float32Array, channel: number): number[] {
  const base = channel * 2 * C;
  return Array.from({ length: C }, (_, c) => (p[base + c]! + p[base + C + c]!) / 2);
}

const maxDiff = (x: ArrayLike<number>, y: ArrayLike<number>) => {
  let d = 0;
  for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i]! - y[i]!));
  return d;
};

const sine = (hz: number, amp = 1, offset = 0) => (i: number) => offset + amp * Math.sin((2 * Math.PI * hz * i) / SR);

function makeScope(params: Record<string, number> = {}): Scope {
  const s = new Scope(SR);
  s.onConnectionsChanged([true, true]);
  for (const [k, v] of Object.entries(params)) s.setParam(k, v);
  return s;
}

describe('Scope', () => {
  it('passes both signals through unchanged', () => {
    const scope = makeScope();
    const a = sine(440);
    const b = sine(97, 0.3, 0.2);
    const [outA, outB] = feed(scope, 0.1, (c, i) => (c === 0 ? a(i) : b(i)));
    for (let i = 0; i < outA!.length; i += 37) {
      expect(outA![i]).toBeCloseTo(a(i), 6);
      expect(outB![i]).toBeCloseTo(b(i), 6);
    }
  });

  it('auto trigger: a repeating wave stands still, starting where it rises through the middle', () => {
    const scope = makeScope({ time: 0.005 });
    const wave = sine(330, 0.8);
    feed(scope, 0.3, (_c, i) => wave(i));
    const first = picture(scope);
    // Later, from a point in the cycle that has nothing to do with the first picture.
    feed(scope, 0.1234, (_c, i) => wave(i), Math.round(0.3 * SR));
    const second = picture(scope);
    expect(maxDiff(first, second)).toBeLessThan(0.02);
    const t = trace(second, 0);
    expect(Math.abs(t[0]!)).toBeLessThan(0.1); // starts at the middle...
    expect(t[5]!).toBeGreaterThan(t[0]!); // ...going up
  });

  it('auto trigger keeps even very short windows steady (starts between samples)', () => {
    const scope = makeScope({ time: 0.001 });
    const wave = sine(1234.5, 1); // period of 38.9 samples: every cycle starts at another point
    const snapshots: Float32Array[] = [];
    for (let k = 0; k < 5; k++) {
      feed(scope, 0.0173, (_c, i) => wave(i), Math.round(k * 0.0173 * SR));
      if (k > 0) snapshots.push(picture(scope));
    }
    for (const p of snapshots.slice(1)) expect(maxDiff(snapshots[0]!, p)).toBeLessThan(0.02);
  });

  it('auto trigger works for signals that are not around zero (envelopes, gates)', () => {
    const scope = makeScope({ time: 0.01 });
    const gate = (i: number) => (i % 1200 < 300 ? 1 : 0); // 40 Hz, high a quarter of the time
    feed(scope, 0.4, (_c, i) => gate(i));
    const first = trace(picture(scope), 0);
    feed(scope, 0.0777, (_c, i) => gate(i), Math.round(0.4 * SR));
    const second = trace(picture(scope), 0);
    expect(maxDiff(first, second)).toBeLessThan(0.01);
    expect(second[1]!).toBeGreaterThan(0.9); // the picture starts on the rising edge
  });

  it('free mode lets the picture run', () => {
    const scope = makeScope({ time: 0.005, trigger: 1 });
    const wave = sine(331.7, 0.8);
    feed(scope, 0.2, (_c, i) => wave(i));
    const first = picture(scope);
    feed(scope, 0.0731, (_c, i) => wave(i), Math.round(0.2 * SR));
    expect(maxDiff(first, picture(scope))).toBeGreaterThan(0.3);
  });

  it('long windows keep the lowest and highest value of each column', () => {
    const scope = makeScope({ time: 1 });
    const wave = sine(1000, 0.5);
    feed(scope, 2.5, (_c, i) => wave(i));
    const p = picture(scope);
    for (let c = 0; c < C; c++) {
      expect(p[c]!).toBeLessThan(-0.49);
      expect(p[C + c]!).toBeGreaterThan(0.49);
    }
  });

  it('short windows draw a smooth line between samples', () => {
    const scope = makeScope({ time: 0.001 }); // 48 samples across 160 columns
    const wave = sine(1000, 1);
    feed(scope, 0.1, (_c, i) => wave(i));
    const t = trace(picture(scope), 0);
    // One full cycle across the screen; neighbouring columns are close (no stairs).
    for (let c = 1; c < C; c++) expect(Math.abs(t[c]! - t[c - 1]!)).toBeLessThan(0.06);
    expect(Math.max(...t)).toBeGreaterThan(0.95);
    expect(Math.min(...t)).toBeLessThan(-0.95);
  });

  it('turning Time carries on drawing instead of starting the picture again', () => {
    const scope = makeScope({ time: 1 }); // sweep: drawn while recording
    const wave = sine(50, 0.5);
    feed(scope, 1.5, (_c, i) => wave(i)); // one full picture, and half of the next
    const before = picture(scope);
    // Many small knob steps, each followed by a little audio.
    let from = Math.round(1.5 * SR);
    for (let k = 1; k <= 20; k++) {
      scope.setParam('time', 1 + k * 0.01);
      feed(scope, 0.003, (_c, i) => wave(i), from);
      from += Math.round(0.003 * SR);
    }
    const after = picture(scope);
    // The columns drawn before turning the knob are all still there.
    let kept = 0;
    for (let c = 0; c < C; c++) if (after[c] === before[c] && after[C + c] === before[C + c]) kept++;
    expect(kept).toBeGreaterThan(C * 0.4);
    // A slow sweep in the middle of the screen, not back at the left edge.
    expect((scope as unknown as { col: number }).col).toBeGreaterThan(C * 0.4);
  });

  it('switching from a long to a short window keeps a picture on screen', () => {
    const scope = makeScope({ time: 1 });
    feed(scope, 1.5, () => 0.4);
    scope.setParam('time', 0.01);
    for (const v of trace(picture(scope), 0)) expect(v).toBeCloseTo(0.4, 5);
  });

  it('shows a flat signal as a flat line instead of waiting forever', () => {
    const scope = makeScope({ time: 0.01 });
    feed(scope, 0.3, () => 0.3);
    for (const v of trace(picture(scope), 0)) expect(v).toBeCloseTo(0.3, 5);
  });

  it('records both channels at once', () => {
    const scope = makeScope({ time: 0.01 });
    feed(scope, 0.3, (c, i) => (c === 0 ? sine(200, 0.5)(i) : 0.7));
    const p = picture(scope);
    expect(Math.max(...trace(p, 0))).toBeGreaterThan(0.45);
    for (const v of trace(p, 1)) expect(v).toBeCloseTo(0.7, 5);
  });

  it('is processed by the engine even when its outputs lead nowhere', () => {
    class Dc implements DspModule {
      readonly numInputs = 0;
      readonly numOutputs = 1;
      readonly tailSeconds = Infinity;
      setParam() {}
      process(_i: readonly Float32Array[], _s: readonly boolean[], outs: readonly Float32Array[], n: number) {
        outs[0]!.fill(0.25, 0, n);
      }
      reset() {}
    }
    const engine = new Engine(SR, { dc: () => new Dc(), scope: (sr) => new Scope(sr) });
    engine.setPatch({
      nodes: [
        { id: 'src', kind: 'dc' },
        { id: 'sc', kind: 'scope', params: { time: 0.01 } },
      ],
      connections: [{ from: { node: 'src', port: 0 }, to: { node: 'sc', port: 0 } }],
    });
    expect(engine.displayLayout).toEqual([{ node: 'sc', length: 4 * C }]);
    const frames = Math.round(0.3 * SR);
    engine.render(new Float32Array(frames), new Float32Array(frames), frames);
    const out = new Float32Array(engine.displayValueCount);
    engine.readDisplays(out);
    expect(out[0]).toBeCloseTo(0.25, 5);
    expect(out[C - 1]).toBeCloseTo(0.25, 5);
  });
});
