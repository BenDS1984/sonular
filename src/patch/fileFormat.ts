/**
 * The .sonular file format: plain, readable JSON with a format name and version number.
 *
 * Reading is forgiving: unknown modules, missing or out-of-range parameters and dangling cables
 * are repaired or dropped with a warning, so a file never fails to open because of one bad
 * entry. Older versions are upgraded step by step through MIGRATIONS.
 */
import { clampTempo, DEFAULT_TEMPO } from '../engine/core/Transport';
import type { ModuleDefinition } from '../modules/types';
import type { Cable, ModuleGroup, ModuleInstance, Patch } from './types';

export const FILE_FORMAT = 'sonular-patch';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.sonular';

export interface PatchFile {
  format: typeof FILE_FORMAT;
  version: number;
  savedAt: string;
  patch: Patch;
}

export type DefinitionLookup = (type: string) => ModuleDefinition | undefined;

/**
 * Upgrades from version N to N+1, keyed by N. When the format changes, bump FILE_VERSION and add
 * a function here that rewrites the old data into the new shape.
 */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

export function serializePatch(patch: Patch, now = new Date()): string {
  const file: PatchFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    savedAt: now.toISOString(),
    patch: {
      name: patch.name,
      tempo: patch.tempo,
      ...(patch.limiter === false ? { limiter: false } : {}),
      modules: patch.modules.map((m) => ({ id: m.id, type: m.type, x: m.x, y: m.y, params: { ...m.params }, ...(m.name ? { name: m.name } : {}) })),
      cables: patch.cables.map((c) => ({ id: c.id, from: { ...c.from }, to: { ...c.to } })),
      ...(patch.groups?.length
        ? { groups: patch.groups.map((g) => ({ id: g.id, name: g.name, moduleIds: [...g.moduleIds], collapsed: g.collapsed })) }
        : {}),
      view: { ...patch.view },
    },
  };
  return JSON.stringify(file, null, 2);
}

export interface ParseResult {
  patch: Patch;
  /** Human-readable notes about anything that had to be repaired or dropped. */
  warnings: string[];
}

export class PatchFileError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const asString = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);

/** Parse and validate a .sonular file. Throws PatchFileError if it isn't a Sonular patch at all. */
export function parsePatchFile(text: string, getDef: DefinitionLookup, fallbackName = 'Untitled patch'): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PatchFileError('This file is not a Sonular patch (it is not valid JSON).');
  }
  if (!isObject(data) || data['format'] !== FILE_FORMAT) {
    throw new PatchFileError('This file is not a Sonular patch.');
  }
  let version = data['version'];
  if (!isFiniteNumber(version) || version < 1) throw new PatchFileError('This patch file has no valid version.');
  if (version > FILE_VERSION) {
    throw new PatchFileError('This patch was saved by a newer version of Sonular. Update Sonular to open it.');
  }
  let current: Record<string, unknown> = data;
  while (version < FILE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) throw new PatchFileError(`Cannot upgrade patch files of version ${version}.`);
    current = migrate(current);
    version++;
  }
  return validatePatch(current['patch'], getDef, fallbackName);
}

/** Repair a patch-shaped value into a valid Patch. Also used for the autosaved copy. */
export function validatePatch(raw: unknown, getDef: DefinitionLookup, fallbackName = 'Untitled patch'): ParseResult {
  const warnings: string[] = [];
  const src = isObject(raw) ? raw : {};

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
      ...(typeof m['name'] === 'string' && m['name'].trim() ? { name: m['name'].trim().slice(0, 40) } : {}),
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

  // Groups: keep the modules that exist, each in one group only; a group needs two modules.
  const groups: ModuleGroup[] = [];
  const grouped = new Set<string>();
  for (const g of Array.isArray(src['groups']) ? src['groups'] : []) {
    if (!isObject(g) || !Array.isArray(g['moduleIds'])) continue;
    const ids = g['moduleIds'].filter((id): id is string => typeof id === 'string' && byId.has(id) && !grouped.has(id));
    if (ids.length < 2) continue;
    for (const id of ids) grouped.add(id);
    groups.push({
      id: `g${groups.length + 1}`,
      name: asString(g['name'], `Group ${groups.length + 1}`).slice(0, 40),
      moduleIds: ids,
      collapsed: g['collapsed'] === true,
    });
  }

  const v = isObject(src['view']) ? src['view'] : {};
  const view = {
    x: isFiniteNumber(v['x']) ? v['x'] : 0,
    y: isFiniteNumber(v['y']) ? v['y'] : 0,
    zoom: isFiniteNumber(v['zoom']) && v['zoom'] > 0 ? v['zoom'] : 1,
  };

  // Files from before the tempo existed play at the default tempo.
  const tempo = isFiniteNumber(src['tempo']) ? clampTempo(src['tempo']) : DEFAULT_TEMPO;

  return {
    patch: { name: asString(src['name'], fallbackName), tempo, ...(src['limiter'] === false ? { limiter: false } : {}), modules, cables, ...(groups.length ? { groups } : {}), view },
    warnings,
  };
}

/** File name for downloads: the patch name made safe for file systems. */
export function fileNameFor(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Untitled patch';
  return `${safe}${FILE_EXTENSION}`;
}
