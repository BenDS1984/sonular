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

/** A project with one empty patch. */
export function emptyProject(name: string, tempo: number): Project {
  return { name, tempo, patches: [emptyPatch('p1', 'Patch 1')], activePatch: 'p1' };
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
