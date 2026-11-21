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
  laneValueAt,
  addAutomation,
  addPoint,
  movePoint,
  removePoint,
  punchIn,
  RECORD_GUARD,
  thinPoints,
  holdsSteps,
  moveGroup,
  removePoints,
  copyPoints,
  pastePoints,
  laneHeight,
  setLaneHeight,
  LANE_HEIGHT,
  MAX_LANE_HEIGHT,
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

describe('module names', () => {
  it('lets any module have its own name, without a number for modules off the timeline', () => {
    const m: { id: string; type: string; name?: string } = { id: 'plain2', type: 'plain' };
    expect(moduleLabel(plain, m)).toBe('seq');
    renameModule(m, 'Bass');
    expect(moduleLabel(plain, m)).toBe('Bass');
    expect(moduleTooltip(plain, m)).toBe('Bass (seq)');
  });


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

  it('plays lanes along the knob travel, holding stepped controls', () => {
    const log = { id: 'f', label: 'F', min: 20, max: 20000, default: 20, scale: 'log' as const };
    const pts = [
      { time: 0, value: 20 },
      { time: 4, value: 20000 },
    ];
    expect(laneValueAt(log, pts, 2)).toBeCloseTo(632.5, 0);
    const sw = { id: 's', label: 'S', min: 0, max: 3, default: 0, step: 1, format: 'choice' as const };
    expect(laneValueAt(sw, [{ time: 0, value: 0 }, { time: 4, value: 3 }], 3.9)).toBe(0);
    expect(laneValueAt(sw, [], 1)).toBeUndefined();
  });

  it('starts a lane with one point at the current value and keeps points in order', () => {
    const p = patchWithSeq();
    const lane = addAutomation(p, 'seq1', 'rate', 0.7);
    expect(lane.points).toEqual([{ time: 0, value: 0.7 }]);
    expect(addAutomation(p, 'seq1', 'rate', 0.1)).toBe(lane);
    expect(addPoint(lane, 8, 1)).toBe(1);
    expect(addPoint(lane, 4, 0.5)).toBe(1);
    movePoint(lane, 1, 20, 0.2); // cannot pass the point at 8
    expect(lane.points[1]).toEqual({ time: 8, value: 0.2 });
    removePoint(lane, 0);
    expect(lane.points.map((pt) => pt.time)).toEqual([8, 8]);
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

describe('recording automation', () => {
  const lin = { id: 'level', label: 'Level', min: 0, max: 1, default: 0 };
  const sw = { id: 'wave', label: 'Wave', min: 0, max: 3, default: 0, step: 1, format: 'choice' as const };

  it('thins a recorded movement to the points it needs', () => {
    // A straight ramp sampled 41 times, held, then a jump: only the corners remain.
    const samples = [];
    for (let i = 0; i <= 40; i++) samples.push({ time: i * 0.1, value: i / 40 });
    for (let i = 1; i <= 10; i++) samples.push({ time: 4 + i * 0.1, value: 1 });
    samples.push({ time: 5.1, value: 0.2 });
    const thin = thinPoints(lin, samples);
    expect(thin.map((p) => p.time)).toEqual([0, 4, 5, 5.1].map((t) => expect.closeTo(t, 6)));
    // Every dropped sample lies within half a percent of the thinned line.
    for (const p of samples) expect(Math.abs(laneValueAt(lin, thin, p.time)! - p.value)).toBeLessThan(0.006);
  });

  it('keeps only the changes of a stepped control', () => {
    const v = [0, 0, 0, 2, 2, 1, 1, 1];
    const thin = thinPoints(sw, v.map((value, i) => ({ time: i, value })));
    expect(thin).toEqual([{ time: 0, value: 0 }, { time: 3, value: 2 }, { time: 5, value: 1 }, { time: 7, value: 1 }]);
  });

  it('replaces only the recorded stretch and keeps the old line around it', () => {
    const base = [{ time: 0, value: 0 }, { time: 8, value: 0.8 }, { time: 16, value: 0 }];
    const rec = [{ time: 4, value: 1 }, { time: 6, value: 0.2 }];
    const pts = punchIn(lin, base, 4, 6, rec, 0.5);
    expect(pts.map((p) => p.time)).toEqual([0, 4 - RECORD_GUARD, 4, 6, 6 + RECORD_GUARD, 8, 16]);
    // Old line just before and just after the recording, recording in between.
    expect(laneValueAt(lin, pts, 2)).toBeCloseTo(0.2, 6);
    expect(laneValueAt(lin, pts, 4 - RECORD_GUARD)).toBeCloseTo(laneValueAt(lin, base, 4 - RECORD_GUARD)!, 6);
    expect(laneValueAt(lin, pts, 5)).toBeCloseTo(0.6, 6);
    expect(laneValueAt(lin, pts, 7)).toBeCloseTo(0.7, 6);
    expect(laneValueAt(lin, pts, 12)).toBeCloseTo(0.4, 6);
  });

  it("starts a new lane from the control's own value and holds the last recorded value", () => {
    const pts = punchIn(lin, [], 4, 6, [{ time: 4, value: 1 }, { time: 6, value: 0.2 }], 0.5);
    expect(pts).toEqual([{ time: 4 - RECORD_GUARD, value: 0.5 }, { time: 4, value: 1 }, { time: 6, value: 0.2 }]);
    expect(laneValueAt(lin, pts, 0)).toBe(0.5);
    expect(laneValueAt(lin, pts, 20)).toBe(0.2);
  });
});

describe('stepped knobs in automation', () => {
  const tune = { id: 'tune', label: 'Tune', min: -24, max: 24, default: 0, step: 1, format: 'semitones' as const };
  const wave = { id: 'wave', label: 'Wave', min: 0, max: 3, default: 0, step: 1, format: 'choice' as const, choices: ['a', 'b', 'c', 'd'] };
  const pts = [{ time: 0, value: 0 }, { time: 4, value: 12 }];

  it('glides a number knob that turns in steps (Tune), and holds choices', () => {
    expect(holdsSteps(tune)).toBe(false);
    expect(holdsSteps(wave)).toBe(true);
    expect(laneValueAt(tune, pts, 1)).toBeCloseTo(3, 6);
    expect(laneValueAt(tune, pts, 1.5)).toBeCloseTo(4.5, 6);
    expect(laneValueAt(wave, [{ time: 0, value: 0 }, { time: 4, value: 3 }], 3.9)).toBe(0);
  });

  it('records a steady turn of a stepped knob as one slope, not a staircase', () => {
    // Turned evenly from 0 to 12 semitones over 4 beats: the knob reports whole semitones.
    const samples = [];
    for (let i = 0; i <= 100; i++) samples.push({ time: i * 0.04, value: Math.round(i * 0.12) });
    const thin = thinPoints(tune, samples);
    expect(thin.length).toBeLessThanOrEqual(4);
    for (const p of samples) expect(Math.abs(laneValueAt(tune, thin, p.time)! - p.value)).toBeLessThanOrEqual(1);
  });
});

describe('several points at once', () => {
  const lin = { id: 'level', label: 'Level', min: 0, max: 1, default: 0 };
  const tune = { id: 'tune', label: 'Tune', min: -24, max: 24, default: 0, step: 1, format: 'semitones' as const };
  const lane = () => ({
    module: 'm',
    param: 'level',
    points: [
      { time: 0, value: 0 },
      { time: 2, value: 0.2 },
      { time: 3, value: 0.4 },
      { time: 6, value: 0.6 },
    ],
  });

  it('moves selected points together, in time and height', () => {
    const l = lane();
    moveGroup(lin, l, lane().points, [1, 2], 1, 0.1);
    expect(l.points.map((p) => p.time)).toEqual([0, 3, 4, 6]);
    expect(l.points.map((p) => +p.value.toFixed(6))).toEqual([0, 0.3, 0.5, 0.6]);
  });

  it('keeps moved points between the ones not selected and inside the range', () => {
    const l = lane();
    moveGroup(lin, l, lane().points, [1, 2], 10, 0.7);
    // Stopped by the point at beat 6; heights clamp at the top one by one.
    expect(l.points.map((p) => p.time)).toEqual([0, 5, 6, 6]);
    expect(l.points.map((p) => +p.value.toFixed(6))).toEqual([0, 0.9, 1, 0.6]);
    moveGroup(lin, l, lane().points, [0, 1], -5, 0);
    expect(l.points.map((p) => p.time)).toEqual([0, 2, 3, 6]); // not before the start
  });

  it('snaps moved points of a stepped knob to its steps', () => {
    const l = { module: 'm', param: 'tune', points: [{ time: 0, value: 0 }, { time: 4, value: 12 }] };
    moveGroup(tune, l, l.points.map((p) => ({ ...p })), [0, 1], 0, 0.051);
    expect(l.points.map((p) => p.value)).toEqual([2, 14]);
  });

  it('removes several points at once', () => {
    const l = lane();
    removePoints(l, [0, 2]);
    expect(l.points.map((p) => p.time)).toEqual([2, 6]);
  });

  it('copies points as a shape and pastes it at another time, replacing what was there', () => {
    const copied = copyPoints(lin, lane().points, [2, 1]);
    expect(copied).toEqual([{ time: 0, position: 0.2 }, { time: 1, position: 0.4 }]);
    const l = lane();
    const pasted = pastePoints(lin, l, copied, 5.5);
    // The point at beat 6 lies inside the pasted stretch (5.5–6.5), so it is replaced.
    expect(l.points.map((p) => p.time)).toEqual([0, 2, 3, 5.5, 6.5]);
    expect(pasted).toEqual([3, 4]);
  });

  it('pastes the same shape in the range of another control', () => {
    const copied = copyPoints(lin, lane().points, [0, 3]); // bottom to 60 %
    const l = { module: 'm', param: 'tune', points: [] as { time: number; value: number }[] };
    pastePoints(tune, l, copied, 8);
    expect(l.points).toEqual([{ time: 8, value: -24 }, { time: 14, value: 5 }]);
  });
});

describe('lane heights', () => {
  it('stores heights per lane in the view, within limits, and forgets the standard height', () => {
    const patch = { view: { x: 0, y: 0, zoom: 1 } as { x: number; y: number; zoom: number; laneHeights?: Record<string, number> } };
    expect(laneHeight(patch, 'osc1', 'tune')).toBe(LANE_HEIGHT);
    setLaneHeight(patch, 'osc1', 'tune', 140.4);
    setLaneHeight(patch, 'osc1', 'level', 5000);
    expect(laneHeight(patch, 'osc1', 'tune')).toBe(140);
    expect(laneHeight(patch, 'osc1', 'level')).toBe(MAX_LANE_HEIGHT);
    setLaneHeight(patch, 'osc1', 'tune', 10);
    expect(patch.view.laneHeights).toEqual({ 'osc1:level': MAX_LANE_HEIGHT });
  });
});
