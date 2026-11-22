/**
 * The Sequencer with timeline blocks: driven by a Clock on the transport, rendered offline.
 */
import { describe, expect, it } from 'vitest';
import { Transport } from '../core/Transport';
import { BLOCK_SIZE, type EngineClip } from '../core/types';
import { stepParam } from '../../modules/sequencer/banks';
import { Clock } from './Clock';
import { Sequencer } from './Sequencer';

const SR = 48000;
/** 120 BPM: 2 beats per second. */
const BEAT = SR / 2;

/** Parameters for one bank: step 1 at `first` semitones, step n at n, all on except `off`. */
function pattern(bank: number, first: number, off: number[] = []): Record<string, number> {
  const p: Record<string, number> = {};
  for (let s = 1; s <= 8; s++) {
    p[stepParam(bank, 'pitch', s)] = s === 1 ? first : s;
    p[stepParam(bank, 'on', s)] = off.includes(s) ? 0 : 1;
  }
  return p;
}

/** Bank 0 starts at +12, bank 1 at −12, bank 2 at 7, bank 3 at 5 (step 1). */
const BANKS = { ...pattern(0, 12), ...pattern(1, -12), ...pattern(2, 7), ...pattern(3, 5) };

/**
 * Play `beats` beats from `from` with a Clock output at `ratio` (index in CLOCK_RATIOS, 2 = ×1)
 * into the sequencer. Returns pitch and gate for every sample.
 */
function play(
  clips: EngineClip[],
  beats: number,
  opts: { from?: number; ratio?: number; loop?: [number, number]; params?: Record<string, number> } = {},
) {
  const t = new Transport(SR);
  if (opts.loop) t.setLoop(true, opts.loop[0], opts.loop[1]);
  t.rewind(opts.from ?? 0);
  const clock = new Clock(t);
  clock.setParam('ratio1', opts.ratio ?? 2);
  const seq = new Sequencer(t);
  for (const [k, v] of Object.entries(opts.params ?? BANKS)) seq.setParam(k, v);
  seq.setClips(clips);
  const clockOuts = Array.from({ length: 4 }, () => new Float32Array(BLOCK_SIZE));
  const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  const total = Math.round(beats * BEAT);
  const pitch = new Float32Array(total);
  const gate = new Float32Array(total);
  for (let start = 0; start < total; start += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - start);
    t.beginBlock();
    clock.process([], [], clockOuts, n);
    seq.process([clockOuts[0]!], [false], outs, n);
    t.endBlock(n);
    pitch.set(outs[0]!.subarray(0, n), start);
    gate.set(outs[1]!.subarray(0, n), start);
  }
  return { pitch, gate };
}

function rises(x: Float32Array): number[] {
  const r: number[] = [];
  for (let i = 0; i < x.length; i++) if (x[i]! >= 0.5 && (i === 0 || x[i - 1]! < 0.5)) r.push(i);
  return r;
}

describe('Sequencer with timeline blocks', () => {
  it('plays only inside blocks, each with its own bank, from step 1', () => {
    const { pitch, gate } = play(
      [
        { start: 4, end: 8, bank: 0 },
        { start: 8, end: 12, bank: 1 },
      ],
      16,
    );
    // Silent before the first block and after the last.
    expect(rises(gate)).toEqual([4, 5, 6, 7, 8, 9, 10, 11].map((b) => b * BEAT));
    // Each block starts at its own step 1, exactly on the beat it starts.
    expect(pitch[4 * BEAT]).toBe(1);
    expect(pitch[5 * BEAT]).toBeCloseTo(2 / 12);
    expect(pitch[8 * BEAT]).toBe(-1);
    expect(pitch[9 * BEAT]).toBeCloseTo(2 / 12);
    // The pitch holds after the last block, so a release tail keeps its note.
    expect(pitch[14 * BEAT]).toBeCloseTo(4 / 12);
  });

  it('respects steps that are off in a block', () => {
    const { gate } = play([{ start: 0, end: 4, bank: 4 }], 4, { params: pattern(4, 0, [2, 3]) });
    expect(rises(gate)).toEqual([0, 3 * BEAT]);
  });

  it('closes the gate exactly where a block ends', () => {
    // ÷2: a pulse every 2 beats, high for 1 beat. The block ends halfway through a pulse.
    const { gate } = play([{ start: 0, end: 2.5, bank: 0 }], 4, { ratio: 3 });
    expect(gate[2.5 * BEAT - 1]).toBe(1);
    expect(gate[2.5 * BEAT]).toBe(0);
  });

  it('starts at step 1 again every time the loop jumps back into a block', () => {
    const { pitch, gate } = play([{ start: 0, end: 16, bank: 2 }], 12, { loop: [0, 3] });
    // Steps 1, 2, 3, then the loop: 1, 2, 3, ...
    const firstSteps = rises(gate).map((i) => Math.round(pitch[i]! * 12));
    expect(firstSteps).toEqual([7, 2, 3, 7, 2, 3, 7, 2, 3, 7, 2, 3]);
  });

  it('starts at step 1 when playback starts inside a block', () => {
    const { pitch, gate } = play([{ start: 0, end: 16, bank: 3 }], 2, { from: 6 });
    expect(rises(gate)[0]).toBe(0);
    expect(pitch[0]).toBeCloseTo(5 / 12);
  });

  it('plays the bank chosen on the module all the time when it has no blocks', () => {
    const t = new Transport(SR);
    const seq = new Sequencer(t);
    for (const [k, v] of Object.entries(BANKS)) seq.setParam(k, v);
    seq.setParam('bank', 2);
    seq.setClips([]);
    const clock = new Float32Array(BLOCK_SIZE).fill(1);
    const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
    const meters = new Float32Array(2);
    t.beginBlock();
    seq.process([clock], [false], outs, BLOCK_SIZE);
    expect(outs[0]![0]).toBeCloseTo(7 / 12);
    expect(outs[1]![0]).toBe(1);
    seq.readMeters(meters, 0);
    expect([...meters]).toEqual([1, 3]); // step 1 of bank 3
    // Switching banks keeps the step: the next pulse is step 2 of the new bank.
    seq.setParam('bank', 1);
    clock.fill(0);
    seq.process([clock], [false], outs, BLOCK_SIZE);
    clock.fill(1);
    seq.process([clock], [false], outs, BLOCK_SIZE);
    expect(outs[0]![0]).toBeCloseTo(2 / 12);
    seq.readMeters(meters, 0);
    expect([...meters]).toEqual([2, 2]);
  });

  it('keeps the gate low until steps are switched on', () => {
    const seq = new Sequencer(new Transport(SR));
    const clock = new Float32Array(BLOCK_SIZE).fill(1);
    const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
    seq.process([clock], [false], outs, BLOCK_SIZE);
    expect(Math.max(...outs[1]!)).toBe(0);
  });

  it('shows the bank of the block playing, and none between blocks', () => {
    const t = new Transport(SR);
    const seq = new Sequencer(t);
    seq.setClips([{ start: 1, end: 2, bank: 5 }]);
    const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
    const clock = new Float32Array(BLOCK_SIZE);
    const meters = new Float32Array(2);
    const blocks = Math.ceil((1.5 * BEAT) / BLOCK_SIZE);
    for (let k = 0; k < blocks; k++) {
      t.beginBlock();
      seq.process([clock], [false], outs, BLOCK_SIZE);
      t.endBlock(BLOCK_SIZE);
      if (k === 0) {
        seq.readMeters(meters, 0);
        expect(meters[1]).toBe(0);
      }
    }
    seq.readMeters(meters, 0);
    expect(meters[1]).toBe(6);
  });
});

describe('Sequencer gate meter', () => {
  /** One block with a clock pulse of 10 samples at the start. */
  function pulse(seq: Sequencer) {
    const clock = new Float32Array(BLOCK_SIZE);
    clock.fill(1, 0, 10);
    const outs = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
    seq.process([clock], [false], outs, BLOCK_SIZE);
  }
  const gateMeter = (seq: Sequencer) => {
    const out = new Float32Array(3);
    seq.readMeters(out, 0);
    return out[2];
  };

  it('reports an open gate even when it has closed again, once per reading', () => {
    const seq = new Sequencer(new Transport(SR));
    seq.setParam(stepParam(0, 'on', 1), 1);
    pulse(seq);
    expect(gateMeter(seq)).toBe(1); // the gate was open for 10 samples only
    expect(gateMeter(seq)).toBe(0); // read once, then cleared
  });

  it('stays off on a step that is switched off', () => {
    const seq = new Sequencer(new Transport(SR));
    seq.setParam(stepParam(0, 'on', 1), 0);
    pulse(seq);
    expect(gateMeter(seq)).toBe(0);
  });
});
