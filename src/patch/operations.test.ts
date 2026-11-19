import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import {
  addModule,
  addPatch,
  connect,
  duplicatePatch,
  emptyPatch,
  emptyProject,
  isPortConnected,
  movePatch,
  nextModuleId,
  nextPatchId,
  removeModule,
  removePatch,
} from './operations';
import { cablePath, fitView, toCanvas, zoomAt } from './geometry';
import type { Patch } from './types';

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
  params: [{ id: 'level', label: 'Level', min: 0, max: 1, default: 0.5 }],
  panel: null as unknown as ModuleDefinition['panel'],
  engine: `test:${type}`,
});

const DEFS = [def('src', [], ['out']), def('fx', ['in'], ['out']), def('sink', ['L', 'R'], [])];
const getDef = (t: string) => DEFS.find((d) => d.type === t);
const empty = (): Patch => emptyPatch('p1', 'test');

describe('patch operations', () => {
  it('creates modules with readable unique ids and default parameters', () => {
    const p = empty();
    const a = addModule(p, getDef('src')!, 0, 0);
    const b = addModule(p, getDef('src')!, 0, 0);
    expect([a.id, b.id]).toEqual(['src1', 'src2']);
    expect(a.params).toEqual({ level: 0.5 });
    removeModule(p, 'src1');
    expect(nextModuleId(p, 'src')).toBe('src1');
  });

  it('only connects outputs to inputs of another module', () => {
    const p = empty();
    addModule(p, getDef('src')!, 0, 0);
    addModule(p, getDef('fx')!, 0, 0);
    expect(connect(p, { module: 'fx1', port: 'in' }, { module: 'src1', port: 'out' }, getDef)).toBeNull();
    expect(connect(p, { module: 'fx1', port: 'out' }, { module: 'fx1', port: 'in' }, getDef)).toBeNull();
    expect(connect(p, { module: 'src1', port: 'out' }, { module: 'fx1', port: 'in' }, getDef)).not.toBeNull();
    expect(isPortConnected(p, { module: 'fx1', port: 'in' }, 'in')).toBe(true);
  });

  it('replaces the cable when an occupied input gets a new one; outputs fan out', () => {
    const p = empty();
    addModule(p, getDef('src')!, 0, 0);
    addModule(p, getDef('src')!, 0, 0);
    addModule(p, getDef('sink')!, 0, 0);
    connect(p, { module: 'src1', port: 'out' }, { module: 'sink1', port: 'L' }, getDef);
    connect(p, { module: 'src1', port: 'out' }, { module: 'sink1', port: 'R' }, getDef);
    connect(p, { module: 'src2', port: 'out' }, { module: 'sink1', port: 'L' }, getDef);
    expect(p.cables).toHaveLength(2);
    expect(p.cables.find((c) => c.to.port === 'L')!.from.module).toBe('src2');
  });

  it('removes attached cables together with a module', () => {
    const p = empty();
    addModule(p, getDef('src')!, 0, 0);
    addModule(p, getDef('fx')!, 0, 0);
    connect(p, { module: 'src1', port: 'out' }, { module: 'fx1', port: 'in' }, getDef);
    removeModule(p, 'fx1');
    expect(p.cables).toHaveLength(0);
  });
});

describe('canvas geometry', () => {
  it('keeps the point under the cursor fixed while zooming', () => {
    const view = { x: 40, y: -20, zoom: 1 };
    const before = toCanvas(view, 300, 200);
    const after = toCanvas(zoomAt(view, 300, 200, 1.7), 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('fits all modules inside the viewport', () => {
    const v = fitView([{ x: 0, y: 0, w: 1000, h: 400 }, { x: 1200, y: 600, w: 200, h: 200 }], 800, 600);
    expect(v.zoom).toBeLessThan(1);
    expect(v.x).toBeGreaterThanOrEqual(0);
    const right = 1400 * v.zoom + v.x;
    expect(right).toBeLessThanOrEqual(800);
  });

  it('draws cables that hang below their end points', () => {
    const d = cablePath({ x: 0, y: 100 }, { x: 300, y: 100 });
    const ys = d.match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(100);
  });

  it('gives new patches an id past the highest in use', () => {
    const p = (id: string) => emptyPatch(id, id);
    expect(nextPatchId({ patches: [] })).toBe('p1');
    expect(nextPatchId({ patches: [p('p1'), p('p3')] })).toBe('p4');
  });
});

describe('the list of patches', () => {
  const CH_DEFS = [...DEFS, def('channel', ['L', 'R'], [])];
  const getChDef = (t: string) => CH_DEFS.find((d) => d.type === t);
  const ids = (project: { patches: Patch[] }) => project.patches.map((p) => p.id);

  it('adds patches named "Patch N" with the next colour and only a Channel', () => {
    const project = emptyProject('x', 120);
    const p2 = addPatch(project, getChDef);
    const p3 = addPatch(project, getChDef);
    expect([p2.id, p2.name, p2.color]).toEqual(['p2', 'Patch 2', 1]);
    expect([p3.id, p3.name, p3.color]).toEqual(['p3', 'Patch 3', 2]);
    expect(p2.modules.map((m) => m.type)).toEqual(['channel']);
    // A name already in use is skipped.
    project.patches[0]!.name = 'Patch 4';
    expect(addPatch(project, getChDef).name).toBe('Patch 5');
  });

  it('duplicates a patch right after the original, as an independent copy', () => {
    const project = emptyProject('x', 120);
    addPatch(project, getChDef);
    const src = project.patches[0]!;
    src.name = 'Bass';
    addModule(src, getDef('src')!, 0, 0);
    const copy = duplicatePatch(project, 'p1')!;
    expect(ids(project)).toEqual(['p1', 'p3', 'p2']);
    expect([copy.name, copy.color]).toEqual(['Bass copy', 1]);
    expect(copy.modules).toEqual(src.modules);
    copy.modules[0]!.params['level'] = 0.9;
    expect(src.modules[0]!.params['level']).toBe(0.5);
  });

  it('removes a patch but never the last one, and shows a neighbour instead', () => {
    const project = emptyProject('x', 120);
    addPatch(project, getChDef);
    addPatch(project, getChDef);
    project.activePatch = 'p2';
    expect(removePatch(project, 'p2')).toBe(true);
    expect(ids(project)).toEqual(['p1', 'p3']);
    expect(project.activePatch).toBe('p3');
    removePatch(project, 'p3');
    expect(project.activePatch).toBe('p1');
    expect(removePatch(project, 'p1')).toBe(false);
    expect(ids(project)).toEqual(['p1']);
  });

  it('moves a patch to another place', () => {
    const project = emptyProject('x', 120);
    addPatch(project, getChDef);
    addPatch(project, getChDef);
    movePatch(project, 0, 2);
    expect(ids(project)).toEqual(['p2', 'p3', 'p1']);
    movePatch(project, 2, 0);
    expect(ids(project)).toEqual(['p1', 'p2', 'p3']);
    movePatch(project, 0, 9); // out of range: nothing happens
    expect(ids(project)).toEqual(['p1', 'p2', 'p3']);
  });
});
