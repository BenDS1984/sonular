import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { emptyTimeline } from '../patch/timeline';
import type { Patch, Project } from '../patch/types';
import { audiblePatches, toEnginePatch } from './toEnginePatch';

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
});

describe('project to engine graph', () => {
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
