import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { addModule, canRemove, connect, duplicateModules, isPortConnected, nextModuleId, removeModule } from './operations';
import { cablePath, fitView, toCanvas, zoomAt } from './geometry';
import type { Patch } from './types';

const def = (type: string, inputs: string[], outputs: string[]): ModuleDefinition => ({
  type,
  version: 1,
  title: type,
  category: 'Utilities',
  description: '',
  summary: '',
  signal: 'audio',
  width: 100,
  inputs: inputs.map((id) => ({ id, label: id, signal: 'audio' })),
  outputs: outputs.map((id) => ({ id, label: id, signal: 'audio' })),
  params: [{ id: 'level', label: 'Level', min: 0, max: 1, default: 0.5 }],
  panel: null as unknown as ModuleDefinition['panel'],
  engine: `test:${type}`,
});

const DEFS = [def('src', [], ['out']), def('fx', ['in'], ['out']), def('sink', ['L', 'R'], []), def('output', ['L', 'R'], [])];
const getDef = (t: string) => DEFS.find((d) => d.type === t);
const empty = (): Patch => ({ name: 'test', tempo: 120, modules: [], cables: [], view: { x: 0, y: 0, zoom: 1 } });

describe('patch operations', () => {
  it('creates modules with readable unique ids and default parameters', () => {
    const p = empty();
    const a = addModule(p, getDef('src')!, 0, 0);
    const b = addModule(p, getDef('src')!, 0, 0);
    expect([a.id, b.id]).toEqual(['src1', 'src2']);
    expect(a.params).toEqual({ level: 0.5 });
    // A removed module's number is not handed out while a higher one exists.
    removeModule(p, 'src1');
    expect(nextModuleId(p, 'src')).toBe('src3');
    expect(nextModuleId(p, 'srcx')).toBe('srcx1');
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
});

describe('duplicateModules', () => {
  it('copies settings and the cables between the copied modules, with fresh ids, and leaves other cables alone', () => {
    const p = empty();
    const a = addModule(p, getDef('fx')!, 100, 100);
    const b = addModule(p, getDef('fx')!, 400, 100);
    const c = addModule(p, getDef('fx')!, 700, 100);
    a.params.level = 0.3;
    a.sample = 'abc';
    a.name = 'Mine';
    connect(p, { module: a.id, port: 'out' }, { module: b.id, port: 'in' }, getDef);
    connect(p, { module: b.id, port: 'out' }, { module: c.id, port: 'in' }, getDef);

    const copies = duplicateModules(p, [a.id, b.id], 40, 40);

    expect(copies).toHaveLength(2);
    expect(copies.map((m) => m.id)).not.toContain(a.id);
    expect(copies[0]).toMatchObject({ x: 140, y: 140, sample: 'abc' });
    expect(copies[0]!.params.level).toBe(0.3);
    expect(copies[0]!.name).toBeUndefined();
    // The copy's settings are its own.
    copies[0]!.params.level = 0.9;
    expect(a.params.level).toBe(0.3);
    // One new cable (between the two copies); the cable to the module left out is not copied.
    expect(p.cables).toHaveLength(3);
    const fresh = p.cables[2]!;
    expect(fresh.from.module).toBe(copies[0]!.id);
    expect(fresh.to.module).toBe(copies[1]!.id);
  });

  it('copying one module copies no cables', () => {
    const p = empty();
    const a = addModule(p, getDef('fx')!, 0, 0);
    const b = addModule(p, getDef('fx')!, 300, 0);
    connect(p, { module: a.id, port: 'out' }, { module: b.id, port: 'in' }, getDef);
    duplicateModules(p, [a.id], 40, 40);
    expect(p.cables).toHaveLength(1);
    expect(p.modules).toHaveLength(3);
  });
});

describe('the Output', () => {
  it('the only Output cannot be removed, a second one can, and an Output is never copied', () => {
    const p = empty();
    const out = addModule(p, getDef('output')!, 0, 0);
    const fx = addModule(p, getDef('fx')!, 300, 0);
    expect(canRemove(p, out.id)).toBe(false);
    expect(canRemove(p, fx.id)).toBe(true);
    expect(duplicateModules(p, [out.id, fx.id], 40, 40).map((m) => m.type)).toEqual(['fx']);
    const second = addModule(p, getDef('output')!, 600, 0);
    expect(canRemove(p, out.id)).toBe(true);
    expect(canRemove(p, second.id)).toBe(true);
  });
});
