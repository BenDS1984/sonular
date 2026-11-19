import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { duplicatePatch, emptyPatch, emptyProject, removeModule } from './operations';
import { addClip, clipsOf, ensureLane, laneOf, nextClipId, removeClip, removeLane, valueAt } from './timeline';
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
  patternParams: ['p1'],
  panel: null as unknown as ModuleDefinition['panel'],
  engine: 'test:seq',
};
const plain: ModuleDefinition = { ...seq, type: 'plain', patternParams: undefined };

function patchWithSeq(): Patch {
  const p = emptyPatch('p1', 'Patch 1');
  p.modules.push({ id: 'seq1', type: 'seq', x: 0, y: 0, params: { p1: 3, rate: 0.5 } });
  p.modules.push({ id: 'plain1', type: 'plain', x: 0, y: 0, params: { p1: 0, rate: 0.5 } });
  return p;
}

describe('timeline blocks', () => {
  it('adds blocks with only the pattern values, never overlapping on one row', () => {
    const p = patchWithSeq();
    const a = addClip(p, seq, 'seq1', 0, 8, { p1: 3, rate: 1 });
    expect(a).toEqual({ id: 'b1', module: 'seq1', start: 0, length: 8, params: { p1: 3 } });
    expect(addClip(p, seq, 'seq1', 4, 8, {})).toBeNull(); // overlaps
    expect(addClip(p, seq, 'seq1', 8, 4, {})).not.toBeNull(); // touching is fine
    expect(addClip(p, seq, 'seq1', -1, 4, {})).toBeNull(); // before the start
    expect(addClip(p, seq, 'seq1', 20, 0.1, {})).toBeNull(); // too short
    expect(addClip(p, plain, 'plain1', 0, 4, {})).toBeNull(); // module without a pattern
    expect(clipsOf(p, 'seq1').map((c) => c.start)).toEqual([0, 8]);
  });

  it('never reuses the id of a deleted block', () => {
    const p = patchWithSeq();
    addClip(p, seq, 'seq1', 0, 4, {});
    addClip(p, seq, 'seq1', 4, 4, {});
    removeClip(p, 'b2');
    expect(nextClipId(p)).toBe('b2');
    removeClip(p, 'b1');
    addClip(p, seq, 'seq1', 0, 4, {});
    addClip(p, seq, 'seq1', 8, 4, {});
    expect(p.clips.map((c) => c.id)).toEqual(['b1', 'b2']);
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
    addClip(p, seq, 'seq1', 0, 4, {});
    ensureLane(p, 'seq1', 'rate');
    ensureLane(p, 'plain1', 'rate');
    removeModule(p, 'seq1');
    expect(p.clips).toEqual([]);
    expect(p.lanes.map((l) => l.module)).toEqual(['plain1']);
  });

  it('copies blocks and lanes with a duplicated patch, apart from the original', () => {
    const project = emptyProject('x', 120);
    project.patches = [patchWithSeq()];
    addClip(project.patches[0]!, seq, 'seq1', 0, 4, { p1: 3 });
    ensureLane(project.patches[0]!, 'seq1', 'rate').points.push({ time: 0, value: 1 });
    const copy = duplicatePatch(project, 'p1')!;
    expect(copy.clips).toEqual(project.patches[0]!.clips);
    expect(copy.lanes).toEqual(project.patches[0]!.lanes);
    copy.clips[0]!.params['p1'] = 9;
    expect(project.patches[0]!.clips[0]!.params['p1']).toBe(3);
  });
});
