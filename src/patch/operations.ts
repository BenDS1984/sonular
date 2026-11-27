/**
 * Editing operations on a patch. Plain functions that mutate the given patch in place, so they
 * work on Svelte state proxies and on plain objects in tests alike.
 */
import type { ModuleDefinition } from '../modules/types';
import type { Cable, ModuleInstance, Patch, PortRef } from './types';

export type DefinitionLookup = (type: string) => ModuleDefinition | undefined;

/**
 * Short readable ids: osc1, osc2, mixer1, ... One past the highest number in use for that prefix,
 * so a removed module's number is not handed out again while higher ones exist (the number is
 * shown in the module's name and must not jump to another module).
 */
export function nextModuleId(patch: Patch, prefix: string): string {
  let max = 0;
  for (const m of patch.modules) {
    if (!m.id.startsWith(prefix)) continue;
    const rest = m.id.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${prefix}${max + 1}`;
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

/**
 * Copy modules (same settings and sample, moved by dx/dy) together with the cables that run between
 * them. Cables to modules outside the copy are not copied. The copies get fresh ids and no own name,
 * and are not in any group. Returns the copies in the order of the originals.
 */
export function duplicateModules(patch: Patch, ids: string[], dx: number, dy: number): ModuleInstance[] {
  const wanted = new Set(ids);
  const originals = patch.modules.filter((m) => wanted.has(m.id) && m.type !== OUTPUT_TYPE);
  const newIds = new Map<string, string>();
  const copies: ModuleInstance[] = [];
  for (const m of originals) {
    const copy: ModuleInstance = { id: nextModuleId(patch, m.type), type: m.type, x: m.x + dx, y: m.y + dy, params: { ...m.params } };
    if (m.sample) copy.sample = m.sample;
    patch.modules.push(copy);
    newIds.set(m.id, copy.id);
    copies.push(copy);
  }
  for (const c of [...patch.cables]) {
    const from = newIds.get(c.from.module);
    const to = newIds.get(c.to.module);
    if (from && to) patch.cables.push({ id: nextCableId(patch), from: { module: from, port: c.from.port }, to: { module: to, port: c.to.port } });
  }
  return copies;
}

/** The Output is the one way out to the speakers: a patch has exactly one, so it is never copied and the last one stays. */
export const OUTPUT_TYPE = 'output';

/** Whether a module may be removed: the only Output may not. */
export function canRemove(patch: Patch, id: string): boolean {
  const m = patch.modules.find((x) => x.id === id);
  if (!m) return false;
  return m.type !== OUTPUT_TYPE || patch.modules.some((x) => x.type === OUTPUT_TYPE && x.id !== id);
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
