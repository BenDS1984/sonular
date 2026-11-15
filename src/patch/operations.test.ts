import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { addModule, connect, isPortConnected, nextModuleId, removeModule } from './operations';
import { cablePath, fitView, toCanvas, zoomAt } from './geometry';
import type { Patch } from './types';

const def = (type: string, inputs: string[], outputs: string[]): ModuleDefinition => ({
  type,
  title: type,
  category: 'Utilities',
  description: '',
  signal: 'audio',
  width: 100,
  inputs: inputs.map((id) => ({ id, label: id, signal: 'audio' })),
  outputs: outputs.map((id) => ({ id, label: id, signal: 'audio' })),
  params: [{ id: 'level', label: 'Level', min: 0, max: 1, default: 0.5 }],
  panel: null as unknown as ModuleDefinition['panel'],
});

const DEFS = [def('src', [], ['out']), def('fx', ['in'], ['out']), def('sink', ['L', 'R'], [])];
const getDef = (t: string) => DEFS.find((d) => d.type === t);
const empty = (): Patch => ({ modules: [], cables: [], view: { x: 0, y: 0, zoom: 1 } });

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
});
