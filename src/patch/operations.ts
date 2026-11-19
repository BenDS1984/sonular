/**
 * Editing operations on a project and its patches. Plain functions that mutate in place, so they
 * work on Svelte state proxies and on plain objects in tests alike.
 */
import type { ModuleDefinition } from '../modules/types';
import type { Cable, ModuleInstance, Patch, PortRef, Project } from './types';

export type DefinitionLookup = (type: string) => ModuleDefinition | undefined;

/**
 * Patch ids p1, p2, ...: one past the highest number in use, so deleting a patch in the middle
 * never hands its id to a new patch.
 */
export function nextPatchId(project: Pick<Project, 'patches'>): string {
  let max = 0;
  for (const p of project.patches) {
    const n = /^p(\d+)$/.exec(p.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `p${max + 1}`;
}

export function emptyPatch(id: string, name: string, color = 0): Patch {
  return { id, name, color, modules: [], cables: [], view: { x: 0, y: 0, zoom: 1 } };
}

/** Type of the module every patch has exactly one of: its mixer channel. */
export const CHANNEL_TYPE = 'channel';

/** Where a missing Channel goes: right of everything else, level with the top module. */
function channelPosition(patch: Patch, getDef: DefinitionLookup): { x: number; y: number } {
  // Empty patch: top right of a typical window, clear of the "Your patch is empty" message.
  if (patch.modules.length === 0) return { x: 760, y: 60 };
  let right = -Infinity;
  let top = Infinity;
  for (const m of patch.modules) {
    right = Math.max(right, m.x + (getDef(m.type)?.width ?? 200));
    top = Math.min(top, m.y);
  }
  return { x: right + 60, y: top };
}

/**
 * Give the patch exactly one Channel: add one when it is missing, remove extras (with their
 * cables). Does nothing when the Channel type is unknown (tests with their own module set).
 * Returns human-readable notes about anything removed.
 */
export function ensureChannel(patch: Patch, getDef: DefinitionLookup): string[] {
  const def = getDef(CHANNEL_TYPE);
  if (!def) return [];
  const channels = patch.modules.filter((m) => m.type === CHANNEL_TYPE);
  if (channels.length === 0) {
    const { x, y } = channelPosition(patch, getDef);
    addModule(patch, def, x, y);
    return [];
  }
  for (const extra of channels.slice(1)) removeModule(patch, extra.id);
  const n = channels.length - 1;
  return n ? [`A patch has one Channel: removed ${n} extra output module${n > 1 ? 's' : ''}.`] : [];
}

/** ensureChannel for every patch of a project. */
export function ensureChannels(project: Project, getDef: DefinitionLookup): string[] {
  return project.patches.flatMap((p) => ensureChannel(p, getDef));
}

// ---------- The list of patches ----------

/** Number of colours in the channel palette (src/ui/channelColors.ts). */
export const PATCH_COLOR_COUNT = 12;

/** "Patch N" for the next patch: N one past the number of patches, skipping names in use. */
export function nextPatchName(project: Pick<Project, 'patches'>): string {
  let n = project.patches.length + 1;
  while (project.patches.some((p) => p.name === `Patch ${n}`)) n++;
  return `Patch ${n}`;
}

/** The colour after the last patch's, so neighbouring tabs differ. */
export function nextPatchColor(project: Pick<Project, 'patches'>): number {
  const last = project.patches[project.patches.length - 1];
  return last ? (last.color + 1) % PATCH_COLOR_COUNT : 0;
}

/** Add a new patch holding only its Channel, after the others. Returns it. */
export function addPatch(project: Project, getDef: DefinitionLookup): Patch {
  const patch = emptyPatch(nextPatchId(project), nextPatchName(project), nextPatchColor(project));
  ensureChannel(patch, getDef);
  project.patches.push(patch);
  return patch;
}

/**
 * Copy a patch with all its modules, cables and settings, right after the original. The copy
 * gets its own id, the name "<name> copy" and the next colour. Returns it, or null.
 */
export function duplicatePatch(project: Project, id: string): Patch | null {
  const i = project.patches.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const copy: Patch = JSON.parse(JSON.stringify(project.patches[i]));
  copy.id = nextPatchId(project);
  copy.name = `${copy.name} copy`;
  copy.color = (copy.color + 1) % PATCH_COLOR_COUNT;
  project.patches.splice(i + 1, 0, copy);
  return copy;
}

/**
 * Remove a patch. The last patch cannot be removed. When the removed patch was shown, its right
 * neighbour (or else the left one) is shown instead. Returns whether it was removed.
 */
export function removePatch(project: Project, id: string): boolean {
  const i = project.patches.findIndex((p) => p.id === id);
  if (i < 0 || project.patches.length <= 1) return false;
  project.patches.splice(i, 1);
  if (project.activePatch === id) project.activePatch = project.patches[Math.min(i, project.patches.length - 1)]!.id;
  return true;
}

/** Move a patch to another place in the list (tab order). */
export function movePatch(project: Project, from: number, to: number) {
  const n = project.patches.length;
  if (from === to || from < 0 || from >= n || to < 0 || to >= n) return;
  const [p] = project.patches.splice(from, 1);
  project.patches.splice(to, 0, p!);
}

/** A project with one empty patch. */
export function emptyProject(name: string, tempo: number): Project {
  return { name, tempo, masterLevel: 1, patches: [emptyPatch('p1', 'Patch 1')], activePatch: 'p1' };
}

/** Short readable ids: osc1, osc2, mixer1, ... (never reused within a patch). */
export function nextModuleId(patch: Patch, prefix: string): string {
  let n = 1;
  while (patch.modules.some((m) => m.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function nextCableId(patch: Patch): string {
  let n = 1;
  while (patch.cables.some((c) => c.id === `c${n}`)) n++;
  return `c${n}`;
}

export function defaultParams(def: ModuleDefinition): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.id, p.default]));
}

export function addModule(patch: Patch, def: ModuleDefinition, x: number, y: number): ModuleInstance {
  const module: ModuleInstance = {
    id: nextModuleId(patch, def.type),
    type: def.type,
    x,
    y,
    params: defaultParams(def),
  };
  patch.modules.push(module);
  return module;
}

/** Remove a module and every cable attached to it. */
export function removeModule(patch: Patch, id: string): void {
  const i = patch.modules.findIndex((m) => m.id === id);
  if (i >= 0) patch.modules.splice(i, 1);
  patch.cables = patch.cables.filter((c) => c.from.module !== id && c.to.module !== id);
}

export function hasPort(patch: Patch, ref: PortRef, kind: 'in' | 'out', getDef: DefinitionLookup): boolean {
  const module = patch.modules.find((m) => m.id === ref.module);
  const def = module && getDef(module.type);
  if (!def) return false;
  return (kind === 'in' ? def.inputs : def.outputs).some((p) => p.id === ref.port);
}

/**
 * Connect an output to an input. An input takes one cable: connecting to an occupied input
 * replaces the old cable. Outputs can feed any number of inputs.
 * Returns the new cable, or null if the connection is invalid.
 */
export function connect(patch: Patch, from: PortRef, to: PortRef, getDef: DefinitionLookup): Cable | null {
  if (!hasPort(patch, from, 'out', getDef) || !hasPort(patch, to, 'in', getDef)) return null;
  if (from.module === to.module) return null;
  const existing = patch.cables.find((c) => c.to.module === to.module && c.to.port === to.port);
  if (existing && existing.from.module === from.module && existing.from.port === from.port) return existing;
  if (existing) disconnect(patch, existing.id);
  const cable: Cable = { id: nextCableId(patch), from: { ...from }, to: { ...to } };
  patch.cables.push(cable);
  return cable;
}

export function disconnect(patch: Patch, cableId: string): void {
  const i = patch.cables.findIndex((c) => c.id === cableId);
  if (i >= 0) patch.cables.splice(i, 1);
}

export function cableIntoInput(patch: Patch, to: PortRef): Cable | undefined {
  return patch.cables.find((c) => c.to.module === to.module && c.to.port === to.port);
}

export function isPortConnected(patch: Patch, ref: PortRef, kind: 'in' | 'out'): boolean {
  return patch.cables.some((c) => {
    const end = kind === 'in' ? c.to : c.from;
    return end.module === ref.module && end.port === ref.port;
  });
}
