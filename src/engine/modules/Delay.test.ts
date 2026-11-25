import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../core/types';
import { Transport } from '../core/Transport';
import { Delay, DELAY_DIVISIONS } from './Delay';

const SR = 48000;
const BPM = 120; // a beat is 0.5 s = 24000 samples

const division = (label: string) => DELAY_DIVISIONS.findIndex((d) => d.label === label);

/** Run the delay for `seconds` with L and R given per sample; returns the outputs. */
function run(
  d: Delay,
  t: Transport,
  seconds: number,
  input: (ch: 0 | 1, i: number) => number,
  onBlock?: (block: number) => void,
): Float32Array[] {
  const total = Math.round(seconds * SR);
  const outs = [new Float32Array(total), new Float32Array(total)];
  const ins = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  const blockOuts = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  for (let start = 0, b = 0; start < total; start += BLOCK_SIZE, b++) {
    onBlock?.(b);
    const n = Math.min(BLOCK_SIZE, total - start);
    let silentL = true;
    let silentR = true;
    for (let i = 0; i < n; i++) {
      const l = input(0, start + i);
      const r = input(1, start + i);
      ins[0]![i] = l;
      ins[1]![i] = r;
      if (l !== 0) silentL = false;
      if (r !== 0) silentR = false;
    }
    t.beginBlock();
    d.process(ins, [silentL, silentR], blockOuts, n);
    t.endBlock(n);
    outs[0]!.set(blockOuts[0]!.subarray(0, n), start);
    outs[1]!.set(blockOuts[1]!.subarray(0, n), start);
  }
  return outs;
}

const impulse = (ch: 0 | 1, i: number) => (ch === 0 && i === 0 ? 1 : 0);
const impulseBoth = (_ch: 0 | 1, i: number) => (i === 0 ? 1 : 0);

/** A delay heard alone: everything wet, clean (no filters or tape), no feedback unless given. */
function setup(params: Record<string, number>, patchedR = false) {
  const t = new Transport(SR);
  t.setTempo(BPM);
  const d = new Delay(SR, t);
  const base: Record<string, number> = { mix: 1, tape: 0, feedback: 0, hp: 20, lp: 20000, sync: 1 };
  for (const [k, v] of Object.entries({ ...base, ...params })) d.setParam(k, v);
  d.onConnectionsChanged([true, patchedR]);
  d.reset();
  return { d, t };
}

const peaks = (x: Float32Array, min = 0.05) => {
  const at: number[] = [];
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) >= min) at.push(i);
  return at;
};

describe('Dual Delay', () => {
  it('lasts a note of the tempo: straight, triplet and dotted', () => {
    // At 120 BPM an eighth is 12000 samples; as a triplet 8000, dotted 18000.
    for (const [mode, samples] of [
      [0, 12000],
      [1, 8000],
      [2, 18000],
    ] as const) {
      const { d, t } = setup({ divL: division('1/8'), modeL: mode });
      const [l] = run(d, t, 0.6, impulse);
      expect(peaks(l!)).toEqual([samples]);
    }
  });

  it('keeps the two sides independent in stereo, each with its own time', () => {
    const { d, t } = setup({ divL: division('1/16'), modeL: 0, divR: division('1/4'), modeR: 0 }, true);
    const [l, r] = run(d, t, 1, impulseBoth);
    expect(peaks(l!)).toEqual([6000]); // a sixteenth
    expect(peaks(r!)).toEqual([24000]); // a quarter
  });

  it('follows a tempo change', () => {
    const { d, t } = setup({ divL: division('1/4'), modeL: 0 });
    // Start at 120 BPM (24000 samples), change to 60 BPM (48000) and give it time to settle.
    run(d, t, 0.2, () => 0, (b) => b === 0 && t.setTempo(60));
    const [l] = run(d, t, 2, impulse);
    expect(peaks(l!)[0]).toBe(48000);
  });

  it('uses free milliseconds with sync off', () => {
    const { d, t } = setup({ sync: 0, timeL: 100, timeR: 200 });
    const [l] = run(d, t, 0.3, impulse);
    expect(peaks(l!)).toEqual([4800]);
  });

  it('repeats by the one shared feedback, each repeat fainter', () => {
    const { d, t } = setup({ sync: 0, timeL: 100, feedback: 0.5 });
    const [l] = run(d, t, 1, impulse);
    expect(l![4800]).toBeCloseTo(1, 4);
    expect(l![9600]).toBeCloseTo(0.5, 4);
    expect(l![14400]).toBeCloseTo(0.25, 4);
  });

  it('ping-pong bounces the echoes between the sides', () => {
    const { d, t } = setup({ sync: 0, timeL: 100, timeR: 50, feedback: 0.5, routing: 1 });
    const [l, r] = run(d, t, 0.6, impulse);
    expect(l![4800]).toBeCloseTo(1, 4); // left first
    expect(r![4800]).toBe(0);
    expect(r![7200]).toBeCloseTo(0.5, 3); // then right, 50 ms later
    expect(l![7200]).toBe(0);
    expect(l![12000]).toBeCloseTo(0.25, 3); // and left again, 100 ms after that
  });

  it('puts a mono input on both sides when R is not patched', () => {
    const { d, t } = setup({ sync: 0, timeL: 10, timeR: 10, mix: 0 });
    const [l, r] = run(d, t, 0.05, (ch, i) => (ch === 0 ? Math.sin(i / 20) : 0));
    for (let i = 0; i < l!.length; i++) expect(r![i]).toBe(l![i]);
  });

  it('mixes dry and wet with equal power: a 50/50 mix is as loud as either side', () => {
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const x = new Float32Array(SR);
    for (let i = 0; i < x.length; i++) x[i] = 0.3 * noise();
    const level = (mix: number) => {
      const { d, t } = setup({ sync: 0, timeL: 100, timeR: 100, mix }, true);
      const [l] = run(d, t, 1, (_ch, i) => x[i]!);
      let e = 0;
      for (let i = 24000; i < l!.length; i++) e += l![i]! * l![i]!;
      return Math.sqrt(e / (l!.length - 24000));
    };
    const dry = level(0);
    expect(level(0.5)).toBeCloseTo(dry, 1);
    expect(level(1)).toBeCloseTo(dry, 1);
  });

  it('the low-pass darkens and the high-pass thins the repeats', () => {
    const energy = (params: Record<string, number>, bright: boolean) => {
      const { d, t } = setup({ sync: 0, timeL: 50, feedback: 0.8, ...params });
      const [l] = run(d, t, 1, (ch, i) => {
        if (ch !== 0 || i >= 4000) return 0;
        return bright ? (i % 2 ? 0.5 : -0.5) : 0.5; // a bright buzz, or a steady low level
      });
      let e = 0;
      for (let i = 30000; i < l!.length; i++) e += l![i]! * l![i]!;
      return e;
    };
    expect(energy({ lp: 600 }, true)).toBeLessThan(energy({}, true) * 0.1);
    expect(energy({ hp: 1500 }, false)).toBeLessThan(energy({}, false) * 0.1);
  });

  it('tape softly limits loud repeats and leaves quiet ones alone', () => {
    const loud = setup({ sync: 0, timeL: 10, tape: 1 });
    const [l] = run(loud.d, loud.t, 0.1, (ch) => (ch === 0 ? 3 : 0));
    expect(Math.max(...l!.map(Math.abs))).toBeLessThan(1.1);
    const quiet = setup({ sync: 0, timeL: 10, tape: 1 });
    const [q] = run(quiet.d, quiet.t, 0.1, (ch) => (ch === 0 ? 0.01 : 0));
    expect(q![2000]).toBeCloseTo(0.01, 3);
  });

  it('tape wobbles the delay time: the echo of a steady tone is no longer steady', () => {
    const wobble = (tape: number) => {
      const { d, t } = setup({ sync: 0, timeL: 300, tape });
      const [l] = run(d, t, 3, (ch, i) => (ch === 0 ? 0.3 * Math.sin((2 * Math.PI * 1000 * i) / SR) : 0));
      let off = 0;
      for (let i = SR * 2; i < SR * 3; i++) {
        off = Math.max(off, Math.abs(l![i]! - 0.3 * Math.sin((2 * Math.PI * 1000 * (i - 0.3 * SR)) / SR)));
      }
      return off;
    };
    expect(wobble(0)).toBeLessThan(1e-3);
    expect(wobble(1)).toBeGreaterThan(0.05);
  });

  it('glides when the time changes: no jumps, no NaN', () => {
    const { d, t } = setup({ sync: 0, timeL: 100 });
    const [l] = run(
      d,
      t,
      0.6,
      (ch, i) => (ch === 0 ? 0.5 * Math.sin((2 * Math.PI * 440 * i) / SR) : 0),
      (b) => b === 200 && d.setParam('timeL', 400),
    );
    let worst = 0;
    for (let i = 1; i < l!.length; i++) {
      expect(Number.isFinite(l![i]!)).toBe(true);
      worst = Math.max(worst, Math.abs(l![i]! - l![i - 1]!));
    }
    expect(worst).toBeLessThan(0.1);
  });

  it('falls silent when the echoes have died out', () => {
    const { d, t } = setup({ sync: 0, timeL: 100, timeR: 200, feedback: 0.3 }, true);
    // Idle comes one trip through the lines after the last echo (the lines hold 10 s).
    const [l, r] = run(d, t, 14, impulseBoth);
    expect(Math.max(...l!.subarray(l!.length - 20000).map(Math.abs))).toBe(0);
    expect(Math.max(...r!.subarray(r!.length - 20000).map(Math.abs))).toBe(0);
  });
});
