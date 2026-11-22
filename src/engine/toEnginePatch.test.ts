import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { emptyTimeline } from '../patch/timeline';
import type { Patch, Project } from '../patch/types';
import { audiblePatches, engineClips, engineLanes, toEnginePatch } from './toEnginePatch';

const def = (type: string, inputs: string[], outputs: string[]): ModuleDefinition => ({
  type,
  version: 1,
  title: type,
  category: 'Utilities',
  description: '',
  signal: 'audio',
  width: 100,
  inputs: inputs.map((id) => ({ id, label: id, signal: 'audio' })),
  outputs: outputs.map((id) => ({ id, label: id, signal: 'audio' })),
  params: [],
  panel: null as unknown as ModuleDefinition['panel'],
  engine: `test:${type}`,
});
const DEFS = [def('osc', [], ['out']), def('channel', ['L', 'R'], [])];
const getDef = (t: string) => DEFS.find((d) => d.type === t);

const patch = (id: string, mute = 0, solo = 0): Patch => ({
  id,
  name: id,
  color: 0,
  modules: [
    { id: 'osc1', type: 'osc', x: 0, y: 0, params: {} },
    { id: 'channel1', type: 'channel', x: 0, y: 0, params: { mute, solo } },
  ],
  cables: [{ id: 'c1', from: { module: 'osc1', port: 'out' }, to: { module: 'channel1', port: 'L' } }],
  view: { x: 0, y: 0, zoom: 1 },
  clips: [],
  lanes: [],
});
const project = (...patches: Patch[]): Project => ({
  name: 'x',
  tempo: 120,
  masterLevel: 1,
  patches,
  activePatch: patches[0]!.id,
  timeline: emptyTimeline(),
  audioTracks: [],
});

describe('automation lanes for the engine', () => {
  const lvl = { ...def('osc', [], ['out']), params: [{ id: 'level', label: 'Level', min: 0, max: 2, default: 1 }] };
  const getLvl = (t: string) => (t === 'osc' ? lvl : getDef(t));
  const withLane = (id: string) => {
    const p = patch(id);
    p.lanes = [
      { module: 'osc1', param: 'level', points: [{ time: 4, value: 2 }, { time: 0, value: 1 }] },
      { module: 'osc1', param: 'gone', points: [{ time: 0, value: 1 }] },
    ];
    return p;
  };

  it('sends points sorted, as knob positions, and skips controls that do not exist', () => {
    const lanes = engineLanes(project(withLane('p1')), getLvl);
    expect(lanes).toEqual([
      { node: 'p1/osc1', param: 'level', times: [0, 4], positions: [0.5, 1], curves: [0, 0], min: 0, max: 2, scale: 'linear', step: 0 },
    ]);
  });

  it('leaves out Free patches and controls the user took over', () => {
    const free = withLane('p2');
    free.free = true;
    expect(engineLanes(project(withLane('p1'), free), getLvl).map((l) => l.node)).toEqual(['p1/osc1']);
    expect(engineLanes(project(withLane('p1')), getLvl, { 'p1/osc1:level': true })).toEqual([]);
  });
});

describe('project to engine graph', () => {
  it('sends no blocks for a Free patch, so its sequencers play the chosen pattern', () => {
    const patch = {
      clips: [
        { id: 'b2', module: 'seq1', start: 8, length: 4, bank: 1 },
        { id: 'b1', module: 'seq1', start: 0, length: 4, bank: 0 },
      ],
    } as unknown as Patch;
    expect(engineClips(patch, 'seq1')).toEqual([
      { start: 0, end: 4, bank: 0 },
      { start: 8, end: 12, bank: 1 },
    ]);
    patch.free = true;
    expect(engineClips(patch, 'seq1')).toEqual([]);
  });

  it('puts every patch in one graph, with ids per patch', () => {
    const g = toEnginePatch(project(patch('p1'), patch('p2')), getDef);
    expect(g.nodes.map((n) => n.id)).toEqual(['p1/osc1', 'p1/channel1', 'p2/osc1', 'p2/channel1']);
    expect(g.connections).toEqual([
      { from: { node: 'p1/osc1', port: 0 }, to: { node: 'p1/channel1', port: 0 } },
      { from: { node: 'p2/osc1', port: 0 }, to: { node: 'p2/channel1', port: 0 } },
    ]);
    expect(g.nodes.filter((n) => n.active !== undefined).map((n) => n.active)).toEqual([true, true]);
  });

  it('hears patches by mute and solo: several solos at once, mute wins', () => {
    const heard = (...p: Patch[]) => [...audiblePatches(project(...p))];
    expect(heard(patch('p1'), patch('p2', 1))).toEqual(['p1']);
    expect(heard(patch('p1', 0, 1), patch('p2'), patch('p3', 0, 1))).toEqual(['p1', 'p3']);
    expect(heard(patch('p1', 1, 1), patch('p2'))).toEqual([]);
    expect(toEnginePatch(project(patch('p1'), patch('p2', 1)), getDef).nodes.find((n) => n.id === 'p2/channel1')!.active).toBe(false);
  });
});
