import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { FILE_FORMAT, FILE_VERSION, ProjectFileError, fileNameFor, parseProjectFile, serializeProject } from './fileFormat';
import type { Project } from './types';

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

const sample = (): Project => ({
  name: 'My drone',
  tempo: 96,
  masterLevel: 0.8,
  activePatch: 'p3',
  patches: [
    {
      id: 'p1',
      name: 'Bass',
      color: 2,
      modules: [
        { id: 'src1', type: 'src', x: 10, y: 20, params: { level: 0.25 } },
        { id: 'sink1', type: 'sink', x: 300, y: 20, params: { level: 1 } },
      ],
      cables: [{ id: 'c1', from: { module: 'src1', port: 'out' }, to: { module: 'sink1', port: 'L' } }],
      view: { x: 5, y: 6, zoom: 0.8 },
    },
    { id: 'p3', name: 'Pad', color: 5, modules: [], cables: [], view: { x: 0, y: 0, zoom: 1 } },
  ],
});

/** A version 1 file: one patch, with the name and tempo on the patch. */
const v1 = (patch: unknown) => JSON.stringify({ format: 'sonular-patch', version: 1, patch });

describe('project files', () => {
  it('round-trips a project with several patches', () => {
    const text = serializeProject(sample(), new Date('2026-01-01T00:00:00Z'));
    const parsed = JSON.parse(text);
    expect(parsed.format).toBe(FILE_FORMAT);
    expect(parsed.version).toBe(FILE_VERSION);
    const { project, warnings } = parseProjectFile(text, getDef);
    expect(warnings).toEqual([]);
    expect(project).toEqual(sample());
  });

  it('opens a version 1 file as a project with one patch', () => {
    const text = v1({
      name: 'Old drone',
      tempo: 90,
      modules: [{ id: 'src1', type: 'src', x: 1, y: 2, params: { level: 0.3 } }],
      cables: [],
      view: { x: 7, y: 8, zoom: 2 },
    });
    const { project, warnings } = parseProjectFile(text, getDef);
    expect(warnings).toEqual([]);
    expect(project).toEqual({
      name: 'Old drone',
      tempo: 90,
      masterLevel: 1,
      activePatch: 'p1',
      patches: [
        {
          id: 'p1',
          name: 'Patch 1',
          color: 0,
          modules: [{ id: 'src1', type: 'src', x: 1, y: 2, params: { level: 0.3 } }],
          cables: [],
          view: { x: 7, y: 8, zoom: 2 },
        },
      ],
    });
  });

  it('turns the old default name into the new one', () => {
    expect(parseProjectFile(v1({ name: 'Untitled patch' }), getDef).project.name).toBe('Untitled project');
  });

  it('rejects files that are not Sonular projects', () => {
    expect(() => parseProjectFile('not json', getDef)).toThrow(ProjectFileError);
    expect(() => parseProjectFile('{"hello": 1}', getDef)).toThrow(/not a Sonular project/);
  });

  it('refuses files from a newer version', () => {
    const text = JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION + 1, project: {} });
    expect(() => parseProjectFile(text, getDef)).toThrow(/newer version/);
  });

  it('repairs bad content instead of failing', () => {
    const text = v1({
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
    });
    const { project, warnings } = parseProjectFile(text, getDef, 'fallback');
    const patch = project.patches[0]!;
    expect(project.name).toBe('fallback');
    expect(project.tempo).toBe(120); // files from before the tempo existed
    expect(patch.modules.map((m) => m.id)).toEqual(['src1', 'sink1']);
    expect(patch.modules[0]!.params).toEqual({ level: 1 }); // clamped, unknown dropped
    expect(patch.modules[0]!.x).toBe(0);
    expect(patch.modules[1]!.params).toEqual({ level: 0.5 }); // default filled in
    expect(patch.cables).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/duplicate/);
    expect(warnings.join(' ')).toMatch(/unknown type "mystery"/);
    expect(warnings.join(' ')).toMatch(/2 cables/);
  });

  it('repairs the list of patches', () => {
    const file = (project: unknown) => JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, project });
    // No patches at all: one empty patch.
    const empty = parseProjectFile(file({ name: 'x' }), getDef).project;
    expect(empty.patches.map((p) => p.id)).toEqual(['p1']);
    expect(empty.activePatch).toBe('p1');
    // Duplicate or missing ids get fresh ones; a missing active patch falls back to the first.
    const fixed = parseProjectFile(
      file({ activePatch: 'p9', patches: [{ id: 'p2' }, { id: 'p2' }, { name: 'Lead', color: -3 }] }),
      getDef,
    ).project;
    expect(fixed.patches.map((p) => [p.id, p.name, p.color])).toEqual([
      ['p2', 'Patch 1', 0],
      ['p1', 'Patch 2', 0],
      ['p3', 'Lead', 0],
    ]);
    expect(fixed.activePatch).toBe('p2');
  });

  it('keeps the tempo within range', () => {
    const text = (tempo: unknown) => v1({ tempo });
    expect(parseProjectFile(text(999), getDef).project.tempo).toBe(300);
    expect(parseProjectFile(text(5), getDef).project.tempo).toBe(20);
    expect(parseProjectFile(text('fast'), getDef).project.tempo).toBe(120);
  });

  it('makes safe file names', () => {
    expect(fileNameFor('Bass: take 2/3')).toBe('Bass- take 2-3.sonular');
    expect(fileNameFor('   ')).toBe('Untitled project.sonular');
  });

  describe('the Channel (mixer strip)', () => {
    const CH_DEFS = [...DEFS, { ...def('channel', ['L', 'R'], []), params: [{ id: 'level', label: 'Level', min: 0, max: 2, default: 0.5 }] }];
    const getChDef = (t: string) => CH_DEFS.find((d) => d.type === t);
    // In version 1 and 2 files the strip was the Output module ("volume" 0..1).
    const withOutput = (volume: number, extra: unknown[] = []) =>
      v1({
        modules: [
          { id: 'src1', type: 'src', x: 0, y: 0, params: {} },
          { id: 'output1', type: 'output', x: 400, y: 50, params: { volume } },
          ...extra,
        ],
        cables: [{ from: { module: 'src1', port: 'out' }, to: { module: 'output1', port: 'L' } }],
      });

    it('turns an old Output into the Channel with the same id, place, cables and level', () => {
      const { project, warnings } = parseProjectFile(withOutput(0.3), getChDef);
      const patch = project.patches[0]!;
      expect(warnings).toEqual([]);
      expect(patch.modules[1]).toEqual({ id: 'output1', type: 'channel', x: 400, y: 50, params: { level: 0.3 } });
      expect(patch.cables).toEqual([{ id: 'c1', from: { module: 'src1', port: 'out' }, to: { module: 'output1', port: 'L' } }]);
    });

    it('keeps only the first of several Outputs', () => {
      const { project, warnings } = parseProjectFile(
        withOutput(0.3, [{ id: 'output2', type: 'output', x: 0, y: 300, params: { volume: 1 } }]),
        getChDef,
      );
      expect(project.patches[0]!.modules.map((m) => m.id)).toEqual(['src1', 'output1']);
      expect(warnings.join(' ')).toMatch(/removed 1 extra output module/);
    });

    it('adds a Channel right of the other modules when a patch has none', () => {
      const text = v1({ modules: [{ id: 'src1', type: 'src', x: 10, y: 40, params: {} }] });
      const patch = parseProjectFile(text, getChDef).project.patches[0]!;
      expect(patch.modules[1]).toMatchObject({ type: 'channel', x: 10 + 100 + 60, y: 40, params: { level: 0.5 } });
    });
  });
});
