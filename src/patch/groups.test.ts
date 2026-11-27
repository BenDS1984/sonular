import { describe, expect, it } from 'vitest';
import { BAR_WIDTH, barAnchor, barRect, dropHint, frameRect, groupOf, GROUP_HEADER, GROUP_PAD } from './groups';
import { parsePatchFile, serializePatch } from './fileFormat';
import type { ModuleDefinition } from '../modules/types';
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
  params: [],
  panel: null as unknown as ModuleDefinition['panel'],
  engine: `test:${type}`,
});
const DEFS = [def('src', [], ['out']), def('fx', ['in'], ['out']), def('sink', ['L', 'R'], [])];
const getDef = (t: string) => DEFS.find((d) => d.type === t);

const patch = (): Patch => ({
  name: 'p',
  tempo: 120,
  modules: [
    { id: 'a', type: 'src', x: 100, y: 100, params: {} },
    { id: 'b', type: 'fx', x: 400, y: 150, params: {} },
    { id: 'c', type: 'sink', x: 800, y: 100, params: {} },
  ],
  cables: [
    { id: 'c1', from: { module: 'a', port: 'out' }, to: { module: 'b', port: 'in' } },
    { id: 'c2', from: { module: 'b', port: 'out' }, to: { module: 'c', port: 'L' } },
  ],
  groups: [{ id: 'g1', name: 'Voice', moduleIds: ['a', 'b'], collapsed: true }],
  view: { x: 0, y: 0, zoom: 1 },
});
const sizes = { a: { w: 200, h: 100 }, b: { w: 100, h: 100 }, c: { w: 100, h: 100 } };

describe('group geometry', () => {
  it('finds the group of a module', () => {
    expect(groupOf(patch(), 'a')?.id).toBe('g1');
    expect(groupOf(patch(), 'c')).toBeUndefined();
  });

  it('frames the members with padding and a title strip', () => {
    const p = patch();
    const f = frameRect(p, p.groups![0]!, sizes)!;
    expect(f.x).toBe(100 - GROUP_PAD);
    expect(f.y).toBe(100 - GROUP_PAD - GROUP_HEADER);
    expect(f.w).toBe(400 + 100 - 100 + 2 * GROUP_PAD);
  });

  it('puts the collapsed bar at the frame corner and attaches outgoing cables on its right', () => {
    const p = patch();
    const g = p.groups![0]!;
    const bar = barRect(p, g, sizes)!;
    expect(bar.w).toBe(BAR_WIDTH);
    const out = barAnchor(p, g, sizes, 'c2', 'from')!;
    expect(out.x).toBe(bar.x + BAR_WIDTH);
    const into = barAnchor(p, g, sizes, 'c1', 'to');
    expect(into?.x).toBe(bar.x);
  });
});

describe('groups in the file', () => {
  it('survive saving and opening', () => {
    const { patch: loaded } = parsePatchFile(serializePatch(patch()), getDef);
    expect(loaded.groups).toEqual([{ id: 'g1', name: 'Voice', moduleIds: ['a', 'b'], collapsed: true }]);
  });

  it('drop groups whose modules are gone, and files without groups still open', () => {
    const p = patch();
    p.groups = [{ id: 'g1', name: 'x', moduleIds: ['a', 'zzz'], collapsed: false }];
    expect(parsePatchFile(serializePatch(p), getDef).patch.groups).toBeUndefined();
    delete p.groups;
    expect(parsePatchFile(serializePatch(p), getDef).patch.groups).toBeUndefined();
  });
});

describe('dropHint', () => {
  const p = (): Patch => {
    const x = patch();
    x.groups![0]!.collapsed = false;
    return x;
  };

  it('says a loose module over the group joins it', () => {
    const x = p();
    x.modules[2]!.x = 300; // module c, centre now inside the frame of a and b
    x.modules[2]!.y = 120;
    expect(dropHint(x, sizes, 'c')).toEqual({ groupId: 'g1', kind: 'in' });
  });

  it('says a member dragged far from the others leaves', () => {
    const x = p();
    const start = frameRect(x, x.groups![0]!, sizes);
    x.modules[1]!.x = 1500;
    expect(dropHint(x, sizes, 'b', start)).toEqual({ groupId: 'g1', kind: 'out' });
  });

  it('keeps a member that is only moved around inside its group', () => {
    const x = p();
    const start = frameRect(x, x.groups![0]!, sizes);
    x.modules[1]!.x = 330; // b moves around next to a, inside the frame
    expect(dropHint(x, sizes, 'b', start)).toBeNull();
    x.modules[1]!.x = 380;
    expect(dropHint(x, sizes, 'b', start)).toBeNull();
  });

  it('does nothing for a member that stays near, a loose module far away, or a collapsed group', () => {
    const x = p();
    expect(dropHint(x, sizes, 'b', frameRect(x, x.groups![0]!, sizes))).toBeNull();
    expect(dropHint(x, sizes, 'c')).toBeNull();
    x.groups![0]!.collapsed = true;
    x.modules[2]!.x = 300;
    expect(dropHint(x, sizes, 'c')).toBeNull();
  });
});
