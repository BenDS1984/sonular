/**
 * The .sonular file format: plain, readable JSON with a format name and version number.
 *
 * Reading is forgiving: unknown modules, missing or out-of-range parameters and dangling cables
 * are repaired or dropped with a warning, so a file never fails to open because of one bad
 * entry. Older versions are upgraded step by step through MIGRATIONS.
 */
import { clampTempo, DEFAULT_TEMPO } from '../engine/core/Transport';
import type { ModuleDefinition } from '../modules/types';
import { ensureChannel } from './operations';
import type { Cable, ModuleInstance, Patch, Project } from './types';

export const FILE_FORMAT = 'sonular-project';
/** Format name of version 1 files, which held a single patch. */
const LEGACY_FORMAT = 'sonular-patch';
export const FILE_VERSION = 3;
export const FILE_EXTENSION = '.sonular';

export interface ProjectFile {
  format: typeof FILE_FORMAT;
  version: number;
  savedAt: string;
  project: Project;
}

export type DefinitionLookup = (type: string) => ModuleDefinition | undefined;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const asString = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);

/**
 * Upgrades from version N to N+1, keyed by N. When the format changes, bump FILE_VERSION and add
 * a function here that rewrites the old data into the new shape.
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: a file held one patch; now it holds a project with a list of patches. The old patch
  // becomes the project's only patch, and its name and tempo become the project's.
  1: (data) => {
    const old = isObject(data['patch']) ? data['patch'] : {};
    return {
      ...data,
      format: FILE_FORMAT,
      project: {
        // The old default name becomes the new default, so saving still asks for a real name.
        name: old['name'] === 'Untitled patch' ? undefined : old['name'],
        tempo: old['tempo'],
        activePatch: 'p1',
        patches: [{ id: 'p1', name: 'Patch 1', color: 0, modules: old['modules'], cables: old['cables'], view: old['view'] }],
      },
    };
  },
  // 2 → 3: the Output module became the Channel (the patch's mixer strip). Same id, cables and
  // volume: "volume" is now "level", with the same gain for the same value.
  2: (data) => {
    const project = isObject(data['project']) ? data['project'] : {};
    const patches = Array.isArray(project['patches']) ? project['patches'] : [];
    return {
      ...data,
      project: {
        ...project,
        patches: patches.map((p) => {
          if (!isObject(p) || !Array.isArray(p['modules'])) return p;
          return {
            ...p,
            modules: p['modules'].map((m) => {
              if (!isObject(m) || m['type'] !== 'output') return m;
              const params = isObject(m['params']) ? m['params'] : {};
              return { ...m, type: 'channel', params: { level: params['volume'] ?? 0.5 } };
            }),
          };
        }),
      },
    };
  },
};

export function serializeProject(project: Project, now = new Date()): string {
  const file: ProjectFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    savedAt: now.toISOString(),
    project: {
      name: project.name,
      tempo: project.tempo,
      masterLevel: project.masterLevel,
      activePatch: project.activePatch,
      patches: project.patches.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        modules: p.modules.map((m) => ({ id: m.id, type: m.type, x: m.x, y: m.y, params: { ...m.params } })),
        cables: p.cables.map((c) => ({ id: c.id, from: { ...c.from }, to: { ...c.to } })),
        view: { ...p.view },
      })),
    },
  };
  return JSON.stringify(file, null, 2);
}

export interface ParseResult {
  project: Project;
  /** Human-readable notes about anything that had to be repaired or dropped. */
  warnings: string[];
}

export class ProjectFileError extends Error {}

/** Parse and validate a .sonular file. Throws ProjectFileError if it isn't a Sonular file at all. */
export function parseProjectFile(text: string, getDef: DefinitionLookup, fallbackName = 'Untitled project'): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ProjectFileError('This file is not a Sonular project (it is not valid JSON).');
  }
  if (!isObject(data) || (data['format'] !== FILE_FORMAT && data['format'] !== LEGACY_FORMAT)) {
    throw new ProjectFileError('This file is not a Sonular project.');
  }
  let version = data['version'];
  if (!isFiniteNumber(version) || version < 1) throw new ProjectFileError('This file has no valid version.');
  if (version > FILE_VERSION) {
    throw new ProjectFileError('This project was saved by a newer version of Sonular. Update Sonular to open it.');
  }
  let current: Record<string, unknown> = data;
  while (version < FILE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new ProjectFileError(`Cannot upgrade files of version ${version}.`);
    current = migrate(current);
    version++;
  }
  return validateProject(current['project'], getDef, fallbackName);
}

/** Repair a project-shaped value into a valid Project (at least one patch, unique ids). */
export function validateProject(raw: unknown, getDef: DefinitionLookup, fallbackName = 'Untitled project'): ParseResult {
  const src = isObject(raw) ? raw : {};
  const warnings: string[] = [];
  const rawPatches = (Array.isArray(src['patches']) ? src['patches'] : []).filter(isObject);
  const valid = (id: unknown): id is string => typeof id === 'string' && /^p\d+$/.test(id);
  const patches: Patch[] = [];
  const ids = new Set<string>();
  for (const [i, rp] of rawPatches.entries()) {
    let id = valid(rp['id']) ? rp['id'] : '';
    if (!id || ids.has(id)) {
      let n = 1;
      while (ids.has(`p${n}`) || rawPatches.some((o) => o['id'] === `p${n}`)) n++;
      id = `p${n}`;
    }
    ids.add(id);
    const name = asString(rp['name'], `Patch ${i + 1}`);
    const color = isFiniteNumber(rp['color']) && rp['color'] >= 0 ? Math.floor(rp['color']) : 0;
    const { modules, cables, view, warnings: w } = validatePatchContent(rp, getDef);
    const patch: Patch = { id, name, color, modules, cables, view };
    w.push(...ensureChannel(patch, getDef));
    const prefix = rawPatches.length > 1 ? `${name}: ` : '';
    for (const msg of w) warnings.push(prefix + msg);
    patches.push(patch);
  }
  if (patches.length === 0) {
    const patch: Patch = { id: 'p1', name: 'Patch 1', color: 0, modules: [], cables: [], view: { x: 0, y: 0, zoom: 1 } };
    ensureChannel(patch, getDef);
    patches.push(patch);
  }
  const activePatch = valid(src['activePatch']) && ids.has(src['activePatch']) ? src['activePatch'] : patches[0]!.id;

  // Files from before the tempo existed play at the default tempo.
  const tempo = isFiniteNumber(src['tempo']) ? clampTempo(src['tempo']) : DEFAULT_TEMPO;

  // Files from before the master channel existed play at 0 dB, as they did then.
  const ml = src['masterLevel'];
  const masterLevel = isFiniteNumber(ml) ? Math.min(2, Math.max(0, ml)) : 1;

  return { project: { name: asString(src['name'], fallbackName), tempo, masterLevel, patches, activePatch }, warnings };
}

/** Repair the modules, cables and view of one patch. */
function validatePatchContent(
  src: Record<string, unknown>,
  getDef: DefinitionLookup,
): Pick<Patch, 'modules' | 'cables' | 'view'> & { warnings: string[] } {
  const warnings: string[] = [];

  const modules: ModuleInstance[] = [];
  const seen = new Set<string>();
  const unknownTypes = new Set<string>();
  for (const m of Array.isArray(src['modules']) ? src['modules'] : []) {
    if (!isObject(m) || typeof m['id'] !== 'string' || typeof m['type'] !== 'string') continue;
    const id = m['id'];
    const def = getDef(m['type']);
    if (!def) {
      unknownTypes.add(m['type']);
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`Skipped a duplicate module "${id}".`);
      continue;
    }
    seen.add(id);
    const rawParams = isObject(m['params']) ? m['params'] : {};
    const params: Record<string, number> = {};
    for (const spec of def.params) {
      const v = rawParams[spec.id];
      params[spec.id] = isFiniteNumber(v) ? Math.min(spec.max, Math.max(spec.min, v)) : spec.default;
    }
    modules.push({
      id,
      type: def.type,
      x: isFiniteNumber(m['x']) ? m['x'] : 0,
      y: isFiniteNumber(m['y']) ? m['y'] : 0,
      params,
    });
  }
  for (const t of unknownTypes) warnings.push(`Skipped modules of unknown type "${t}".`);

  const byId = new Map(modules.map((m) => [m.id, m]));
  const portExists = (moduleId: unknown, port: unknown, kind: 'in' | 'out') => {
    if (typeof moduleId !== 'string' || typeof port !== 'string') return false;
    const m = byId.get(moduleId);
    const def = m && getDef(m.type);
    return !!def && (kind === 'in' ? def.inputs : def.outputs).some((p) => p.id === port);
  };
  const cables: Cable[] = [];
  const takenInputs = new Set<string>();
  let dropped = 0;
  for (const c of Array.isArray(src['cables']) ? src['cables'] : []) {
    const from = isObject(c) && isObject(c['from']) ? c['from'] : null;
    const to = isObject(c) && isObject(c['to']) ? c['to'] : null;
    if (!from || !to || !portExists(from['module'], from['port'], 'out') || !portExists(to['module'], to['port'], 'in')) {
      dropped++;
      continue;
    }
    const inputKey = `${to['module']}:${to['port']}`;
    if (takenInputs.has(inputKey)) {
      dropped++;
      continue;
    }
    takenInputs.add(inputKey);
    cables.push({
      id: `c${cables.length + 1}`,
      from: { module: from['module'] as string, port: from['port'] as string },
      to: { module: to['module'] as string, port: to['port'] as string },
    });
  }
  if (dropped) warnings.push(`Removed ${dropped} cable${dropped > 1 ? 's' : ''} that pointed nowhere.`);

  const v = isObject(src['view']) ? src['view'] : {};
  const view = {
    x: isFiniteNumber(v['x']) ? v['x'] : 0,
    y: isFiniteNumber(v['y']) ? v['y'] : 0,
    zoom: isFiniteNumber(v['zoom']) && v['zoom'] > 0 ? v['zoom'] : 1,
  };

  return { modules, cables, view, warnings };
}

/** File name for downloads: the project name made safe for file systems. */
export function fileNameFor(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Untitled project';
  return `${safe}${FILE_EXTENSION}`;
}
