import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { FILE_FORMAT, FILE_VERSION, PatchFileError, fileNameFor, parsePatchFile, serializePatch } from './fileFormat';
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
const DEFS = [def('src', [], ['out']), def('sink', ['L', 'R'], [])];
const getDef = (t: string) => DEFS.find((d) => d.type === t);

const sample = (): Patch => ({
  name: 'My drone',
  modules: [
    { id: 'src1', type: 'src', x: 10, y: 20, params: { level: 0.25 } },
    { id: 'sink1', type: 'sink', x: 300, y: 20, params: { level: 1 } },
  ],
  cables: [{ id: 'c1', from: { module: 'src1', port: 'out' }, to: { module: 'sink1', port: 'L' } }],
  view: { x: 5, y: 6, zoom: 0.8 },
});

describe('patch files', () => {
  it('round-trips a patch', () => {
    const text = serializePatch(sample(), new Date('2026-01-01T00:00:00Z'));
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(FILE_FORMAT);
    expect(parsed.version).toBe(FILE_VERSION);
    const { patch, warnings } = parsePatchFile(text, getDef);
    expect(warnings).toEqual([]);
    expect(patch).toEqual(sample());
  });

  it('rejects files that are not Modulab patches', () => {
    expect(() => parsePatchFile('not json', getDef)).toThrow(PatchFileError);
    expect(() => parsePatchFile('{"hello": 1}', getDef)).toThrow(/not a Modulab patch/);
  });

  it('refuses files from a newer version', () => {
    const text = JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION + 1, patch: {} });
    expect(() => parsePatchFile(text, getDef)).toThrow(/newer version/);
  });

  it('repairs bad content instead of failing', () => {
    const text = JSON.stringify({
      format: FILE_FORMAT,
      version: 1,
      patch: {
        modules: [
          { id: 'src1', type: 'src', x: 'nope', params: { level: 7, junk: 3 } },
          { id: 'src1', type: 'src', x: 0, y: 0, params: {} },
          { id: 'x1', type: 'mystery', x: 0, y: 0, params: {} },
          { id: 'sink1', type: 'sink', x: 0, y: 0 },
        ],
        cables: [
          { from: { module: 'src1', port: 'out' }, to: { module: 'sink1', port: 'L' } },
          { from: { module: 'src1', port: 'out' }, to: { module: 'sink1', port: 'L' } },
          { from: { module: 'x1', port: 'out' }, to: { module: 'sink1', port: 'R' } },
        ],
      },
    });
    const { patch, warnings } = parsePatchFile(text, getDef, 'fallback');
    expect(patch.name).toBe('fallback');
    expect(patch.modules.map((m) => m.id)).toEqual(['src1', 'sink1']);
    expect(patch.modules[0]!.params).toEqual({ level: 1 }); // clamped, unknown dropped
    expect(patch.modules[0]!.x).toBe(0);
    expect(patch.modules[1]!.params).toEqual({ level: 0.5 }); // default filled in
    expect(patch.cables).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/duplicate/);
    expect(warnings.join(' ')).toMatch(/unknown type "mystery"/);
    expect(warnings.join(' ')).toMatch(/2 cables/);
  });

  it('makes safe file names', () => {
    expect(fileNameFor('Bass: take 2/3')).toBe('Bass- take 2-3.modulab');
    expect(fileNameFor('   ')).toBe('Untitled patch.modulab');
  });
});
