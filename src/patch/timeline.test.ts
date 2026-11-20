import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { duplicatePatch, emptyPatch, emptyProject, removeModule } from './operations';
import {
  addClip,
  clipsOf,
  duplicateClip,
  ensureLane,
  freeRange,
  laneOf,
  nextClipId,
  moduleLabel,
  moduleTooltip,
  numberedTitle,
  renameModule,
  removeClip,
  removeLane,
  valueAt,
} from './timeline';
import type { Patch } from './types';

const seq: ModuleDefinition = {
  type: 'seq',
  version: 1,
  title: 'seq',
  category: 'Sequencing',
  description: '',
  signal: 'pitch',
  width: 100,
  inputs: [],
  outputs: [{ id: 'pitch', label: 'pitch', signal: 'pitch' }],
  params: [
    { id: 'p1', label: '1', min: -24, max: 24, default: 0 },
    { id: 'rate', label: 'Rate', min: 0, max: 1, default: 0.5 },
  ],
  banks: 8,
  panel: null as unknown as ModuleDefinition['panel'],
  engine: 'test:seq',
};
const plain: ModuleDefinition = { ...seq, type: 'plain', banks: undefined };

function patchWithSeq(): Patch {
  const p = emptyPatch('p1', 'Patch 1');
  p.modules.push({ id: 'seq1', type: 'seq', x: 0, y: 0, params: { p1: 3, rate: 0.5 } });
  p.modules.push({ id: 'plain1', type: 'plain', x: 0, y: 0, params: { p1: 0, rate: 0.5 } });
  return p;
}

describe('timeline blocks', () => {
  it('adds blocks playing a bank, never overlapping on one row', () => {
    const p = patchWithSeq();
    const a = addClip(p, seq, 'seq1', 0, 8, 3);
    expect(a).toEqual({ id: 'b1', module: 'seq1', start: 0, length: 8, bank: 3 });
    expect(addClip(p, seq, 'seq1', 30, 2, 12)!.bank).toBe(7); // only 8 banks
    removeClip(p, 'b2');
    expect(addClip(p, seq, 'seq1', 4, 8, 0)).toBeNull(); // overlaps
    expect(addClip(p, seq, 'seq1', 8, 4, 0)).not.toBeNull(); // touching is fine
    expect(addClip(p, seq, 'seq1', -1, 4, 0)).toBeNull(); // before the start
    expect(addClip(p, seq, 'seq1', 20, 0.1, 0)).toBeNull(); // too short
    expect(addClip(p, plain, 'plain1', 0, 4, 0)).toBeNull(); // module without a pattern
    expect(clipsOf(p, 'seq1').map((c) => c.start)).toEqual([0, 8]);
  });

  it('never reuses the id of a deleted block', () => {
    const p = patchWithSeq();
    addClip(p, seq, 'seq1', 0, 4, 0);
    addClip(p, seq, 'seq1', 4, 4, 0);
    removeClip(p, 'b2');
    expect(nextClipId(p)).toBe('b2');
    removeClip(p, 'b1');
    addClip(p, seq, 'seq1', 0, 4, 0);
    addClip(p, seq, 'seq1', 8, 4, 0);
    expect(p.clips.map((c) => c.id)).toEqual(['b1', 'b2']);
  });
});

describe('sequencer names', () => {
  it('numbers a sequencer by its id, so the number never moves to another one', () => {
    expect(numberedTitle(seq, { id: 'seq3', type: 'seq' })).toBe('seq 3');
    expect(numberedTitle(undefined, { id: 'x', type: 'gone' })).toBe('gone');
  });

  it('shows the user\'s own name, and goes back to the number when it is cleared', () => {
    const m: { id: string; type: string; name?: string } = { id: 'seq3', type: 'seq' };
    renameModule(m, '  Kick ');
    expect(moduleLabel(seq, m)).toBe('Kick');
    expect(moduleTooltip(seq, m)).toBe('Kick (seq 3)');
    renameModule(m, '   ');
    expect(m).toEqual({ id: 'seq3', type: 'seq' });
    expect(moduleLabel(seq, m)).toBe('seq 3');
  });
});

describe('moving and copying blocks', () => {
  it('finds the free space around a block or a position', () => {
    const p = patchWithSeq();
    addClip(p, seq, 'seq1', 4, 4, 0);
    addClip(p, seq, 'seq1', 12, 4, 0);
    addClip(p, seq, 'seq1', 20, 4, 0);
    expect(freeRange(p, 'seq1', 10)).toEqual({ lo: 8, hi: 12 });
    expect(freeRange(p, 'seq1', 12, 'b2')).toEqual({ lo: 8, hi: 20 });
    expect(freeRange(p, 'seq1', 1)).toEqual({ lo: 0, hi: 4 });
  });

  it('copies a block to the first free place after it', () => {
    const p = patchWithSeq();
    addClip(p, seq, 'seq1', 0, 4, 5);
    addClip(p, seq, 'seq1', 4, 2, 0);
    addClip(p, seq, 'seq1', 8, 4, 0);
    const copy = duplicateClip(p, 'b1')!;
    expect(copy).toEqual({ id: 'b4', module: 'seq1', start: 12, length: 4, bank: 5 });
  });
});

describe('automation lanes', () => {
  it('has one lane per control', () => {
    const p = patchWithSeq();
    const lane = ensureLane(p, 'seq1', 'rate');
    expect(ensureLane(p, 'seq1', 'rate')).toBe(lane);
    expect(laneOf(p, 'seq1', 'rate')).toBe(lane);
    removeLane(p, 'seq1', 'rate');
    expect(p.lanes).toEqual([]);
  });

  it('follows straight lines between points and holds before and after them', () => {
    const points = [
      { time: 4, value: 0 },
      { time: 8, value: 1 },
      { time: 8, value: 0.2 }, // a jump
      { time: 12, value: 0.6 },
    ];
    expect(valueAt([], 3)).toBeUndefined();
    expect(valueAt(points, 0)).toBe(0);
    expect(valueAt(points, 6)).toBe(0.5);
    expect(valueAt(points, 10)).toBeCloseTo(0.4);
    expect(valueAt(points, 20)).toBe(0.6);
  });
});

describe('timeline and patch editing', () => {
  it('removes the blocks and lanes of a removed module', () => {
    const p = patchWithSeq();
    addClip(p, seq, 'seq1', 0, 4, 0);
    ensureLane(p, 'seq1', 'rate');
    ensureLane(p, 'plain1', 'rate');
    removeModule(p, 'seq1');
    expect(p.clips).toEqual([]);
    expect(p.lanes.map((l) => l.module)).toEqual(['plain1']);
  });

  it('copies blocks and lanes with a duplicated patch, apart from the original', () => {
    const project = emptyProject('x', 120);
    project.patches = [patchWithSeq()];
    addClip(project.patches[0]!, seq, 'seq1', 0, 4, 3);
    ensureLane(project.patches[0]!, 'seq1', 'rate').points.push({ time: 0, value: 1 });
    const copy = duplicatePatch(project, 'p1')!;
    expect(copy.clips).toEqual(project.patches[0]!.clips);
    expect(copy.lanes).toEqual(project.patches[0]!.lanes);
    copy.clips[0]!.bank = 6;
    expect(project.patches[0]!.clips[0]!.bank).toBe(3);
  });
});
