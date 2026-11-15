/**
 * Translate the user's patch (modules, named ports) into the engine's graph (kinds, port indexes).
 */
import type { ModuleDefinition } from '../modules/types';
import type { Patch } from '../patch/types';
import type { EnginePatch } from './core/types';

export function toEnginePatch(patch: Patch, getDef: (type: string) => ModuleDefinition | undefined): EnginePatch {
  const defs = new Map<string, ModuleDefinition>();
  const nodes: EnginePatch['nodes'] = [];
  for (const m of patch.modules) {
    const def = getDef(m.type);
    if (!def) continue;
    defs.set(m.id, def);
    nodes.push({ id: m.id, kind: def.engine, params: { ...m.params } });
  }
  const connections: EnginePatch['connections'] = [];
  for (const c of patch.cables) {
    const from = defs.get(c.from.module);
    const to = defs.get(c.to.module);
    if (!from || !to) continue;
    const fromPort = from.outputs.findIndex((p) => p.id === c.from.port);
    const toPort = to.inputs.findIndex((p) => p.id === c.to.port);
    if (fromPort < 0 || toPort < 0) continue;
    connections.push({ from: { node: c.from.module, port: fromPort }, to: { node: c.to.module, port: toPort } });
  }
  return { nodes, connections };
}

/** A string that changes only when modules or cables change (not when parameters move). */
export function structureKey(patch: Patch): string {
  const mods = patch.modules.map((m) => `${m.id}/${m.type}`).join(',');
  const cables = patch.cables.map((c) => `${c.from.module}.${c.from.port}>${c.to.module}.${c.to.port}`).join(',');
  return `${mods}|${cables}`;
}
