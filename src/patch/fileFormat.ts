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
import { BEATS_PER_BAR, clampBank, clampLaneHeight, emptyTimeline, hasBanks, LANE_HEIGHT, MAX_BEATS, MIN_CLIP_LENGTH } from './timeline';
import type { AutomationLane, Cable, Clip, ModuleInstance, Patch, Project, Timeline } from './types';

export const FILE_FORMAT = 'sonular-project';
/** Format name of version 1 files, which held a single patch. */
const LEGACY_FORMAT = 'sonular-patch';
export const FILE_VERSION = 4;
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
  // 3 → 4: the timeline (blocks, automation, loop, song end) was added. Nothing to rewrite: older
  // files get an empty timeline when read. The version went up so an older Sonular refuses these
  // files instead of opening them and silently dropping the timeline.
  3: (data) => data,
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
      timeline: { end: project.timeline.end, loop: { ...project.timeline.loop } },
      patches: project.patches.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        modules: p.modules.map((m) => ({
          id: m.id,
          type: m.type,
          ...(m.name ? { name: m.name } : {}),
          x: m.x,
          y: m.y,
          params: { ...m.params },
        })),
        cables: p.cables.map((c) => ({ id: c.id, from: { ...c.from }, to: { ...c.to } })),
        view: { ...p.view, ...(p.view.laneHeights ? { laneHeights: { ...p.view.laneHeights } } : {}) },
        clips: p.clips.map((c) => ({ id: c.id, module: c.module, start: c.start, length: c.length, bank: c.bank })),
        lanes: p.lanes.map((l) => ({ module: l.module, param: l.param, points: l.points.map((pt) => ({ ...pt })) })),
        ...(p.free ? { free: true } : {}),
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
    const patch: Patch = { id, name, color, modules, cables, view, clips: [], lanes: [] };
    patch.clips = validateClips(rp['clips'], modules, getDef, w);
    patch.lanes = validateLanes(rp['lanes'], modules, getDef, w);
    if (rp['free'] === true) patch.free = true;
    w.push(...ensureChannel(patch, getDef));
    const prefix = rawPatches.length > 1 ? `${name}: ` : '';
    for (const msg of w) warnings.push(prefix + msg);
    patches.push(patch);
  }
  if (patches.length === 0) {
    const patch: Patch = {
      id: 'p1',
      name: 'Patch 1',
      color: 0,
      modules: [],
      cables: [],
      view: { x: 0, y: 0, zoom: 1 },
      clips: [],
      lanes: [],
    };
    ensureChannel(patch, getDef);
    patches.push(patch);
  }
  const activePatch = valid(src['activePatch']) && ids.has(src['activePatch']) ? src['activePatch'] : patches[0]!.id;

  // Files from before the tempo existed play at the default tempo.
  const tempo = isFiniteNumber(src['tempo']) ? clampTempo(src['tempo']) : DEFAULT_TEMPO;

  // Files from before the master channel existed play at 0 dB, as they did then.
  const ml = src['masterLevel'];
  const masterLevel = isFiniteNumber(ml) ? Math.min(2, Math.max(0, ml)) : 1;

  const timeline = validateTimeline(src['timeline']);

  return {
    project: { name: asString(src['name'], fallbackName), tempo, masterLevel, patches, activePatch, timeline },
    warnings,
  };
}

const clampBeats = (v: number) => Math.min(MAX_BEATS, Math.max(0, v));

/** Longest name a module can have. */
const MAX_NAME_LENGTH = 40;

/** Song end and loop; files from before the timeline get the defaults. */
function validateTimeline(raw: unknown): Timeline {
  const t = emptyTimeline();
  if (!isObject(raw)) return t;
  if (isFiniteNumber(raw['end'])) t.end = Math.max(1, clampBeats(raw['end']));
  const loop = isObject(raw['loop']) ? raw['loop'] : {};
  let start = isFiniteNumber(loop['start']) ? clampBeats(loop['start']) : t.loop.start;
  let end = isFiniteNumber(loop['end']) ? clampBeats(loop['end']) : t.loop.end;
  // A loop needs some length: an empty or reversed one becomes one bar from its start.
  if (end <= start) {
    start = Math.min(start, MAX_BEATS - BEATS_PER_BAR);
    end = start + BEATS_PER_BAR;
  }
  t.loop = { on: loop['on'] === true, start, end };
  return t;
}

/**
 * Blocks of one patch: only on modules that have banks, inside the song range, with a bank that
 * exists, and never overlapping another block on the same row.
 */
function validateClips(raw: unknown, modules: ModuleInstance[], getDef: DefinitionLookup, warnings: string[]): Clip[] {
  const candidates: Clip[] = [];
  let dropped = 0;
  for (const c of Array.isArray(raw) ? raw : []) {
    const module = isObject(c) ? modules.find((m) => m.id === c['module']) : undefined;
    const def = module && getDef(module.type);
    if (!isObject(c) || !module || !hasBanks(def) || !isFiniteNumber(c['start']) || !isFiniteNumber(c['length'])) {
      dropped++;
      continue;
    }
    const start = clampBeats(c['start']);
    const length = Math.min(MAX_BEATS - start, c['length']);
    if (length < MIN_CLIP_LENGTH) {
      dropped++;
      continue;
    }
    const bank = clampBank(def, isFiniteNumber(c['bank']) ? c['bank'] : 0);
    const id = typeof c['id'] === 'string' ? c['id'] : '';
    candidates.push({ id, module: module.id, start, length, bank });
  }
  // In order of start; a block that begins inside the previous block on its row is dropped.
  candidates.sort((a, b) => a.start - b.start);
  const rowEnd = new Map<string, number>();
  const clips: Clip[] = [];
  for (const c of candidates) {
    if (c.start < (rowEnd.get(c.module) ?? 0)) {
      dropped++;
      continue;
    }
    rowEnd.set(c.module, c.start + c.length);
    clips.push(c);
  }
  // Ids must look like b1, b2, ... and be unique; others get fresh ones past every id in use.
  const ids = new Set<string>();
  for (const c of clips) {
    if (/^b\d+$/.test(c.id) && !ids.has(c.id)) ids.add(c.id);
    else c.id = '';
  }
  let next = Math.max(0, ...[...ids].map((id) => Number(id.slice(1))));
  for (const c of clips) if (!c.id) c.id = `b${++next}`;
  if (dropped) warnings.push(`Removed ${dropped} timeline block${dropped > 1 ? 's' : ''} that could not be placed.`);
  return clips;
}

/** Automation lanes of one patch: one per existing control, points in range and sorted by time. */
function validateLanes(
  raw: unknown,
  modules: ModuleInstance[],
  getDef: DefinitionLookup,
  warnings: string[],
): AutomationLane[] {
  const lanes: AutomationLane[] = [];
  let dropped = 0;
  for (const l of Array.isArray(raw) ? raw : []) {
    const module = isObject(l) ? modules.find((m) => m.id === l['module']) : undefined;
    const spec = isObject(l) && module ? getDef(module.type)?.params.find((p) => p.id === l['param']) : undefined;
    if (!isObject(l) || !module || !spec || lanes.some((o) => o.module === module.id && o.param === spec.id)) {
      dropped++;
      continue;
    }
    const points: AutomationLane['points'] = [];
    for (const pt of Array.isArray(l['points']) ? l['points'] : []) {
      if (!isObject(pt) || !isFiniteNumber(pt['time']) || !isFiniteNumber(pt['value'])) continue;
      points.push({ time: clampBeats(pt['time']), value: Math.min(spec.max, Math.max(spec.min, pt['value'])) });
    }
    points.sort((a, b) => a.time - b.time);
    lanes.push({ module: module.id, param: spec.id, points });
  }
  if (dropped) warnings.push(`Removed ${dropped} automation line${dropped > 1 ? 's' : ''} for controls that do not exist.`);
  return lanes;
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
    const name = typeof m['name'] === 'string' ? m['name'].trim().slice(0, MAX_NAME_LENGTH) : '';
    modules.push({
      id,
      type: def.type,
      ...(name ? { name } : {}),
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
  } as Patch['view'];
  if (isObject(v['laneHeights'])) {
    const heights: Record<string, number> = {};
    for (const [key, h] of Object.entries(v['laneHeights'])) {
      if (isFiniteNumber(h) && clampLaneHeight(h) !== LANE_HEIGHT) heights[key] = clampLaneHeight(h);
    }
    if (Object.keys(heights).length > 0) view.laneHeights = heights;
  }

  return { modules, cables, view, warnings };
}

/** File name for downloads: the project name made safe for file systems. */
export function fileNameFor(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Untitled project';
  return `${safe}${FILE_EXTENSION}`;
}
