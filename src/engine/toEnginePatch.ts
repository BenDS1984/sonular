/**
 * Translate the user's project (patches of modules with named ports) into the engine's single
 * graph (kinds, port indexes). All patches play together: each module becomes a node with the id
 * "<patch id>/<module id>", and each patch's Channel is a sink on the master bus.
 */
import type { ModuleDefinition } from '../modules/types';
import { CHANNEL_TYPE } from '../patch/operations';
import type { Patch, Project } from '../patch/types';
import type { EngineClip, EnginePatch } from './core/types';

type DefinitionLookup = (type: string) => ModuleDefinition | undefined;

/** Engine node id of a module in a patch. */
export const nodeIdOf = (patchId: string, moduleId: string) => `${patchId}/${moduleId}`;

const isOn = (v: number | undefined) => (v ?? 0) >= 0.5;

function channelOf(patch: Patch) {
  return patch.modules.find((m) => m.type === CHANNEL_TYPE);
}

/**
 * Which patches are heard: not muted, and, when any channel is soloed, soloed themselves.
 * Several solos can be on at once; mute wins over solo.
 */
export function audiblePatches(project: Project): Set<string> {
  const anySolo = project.patches.some((p) => isOn(channelOf(p)?.params['solo']));
  const heard = new Set<string>();
  for (const p of project.patches) {
    const ch = channelOf(p);
    if (!ch || isOn(ch.params['mute'])) continue;
    if (anySolo && !isOn(ch.params['solo'])) continue;
    heard.add(p.id);
  }
  return heard;
}

export function toEnginePatch(project: Project, getDef: DefinitionLookup): EnginePatch {
  const heard = audiblePatches(project);
  const nodes: EnginePatch['nodes'] = [];
  const connections: EnginePatch['connections'] = [];
  for (const patch of project.patches) {
    const defs = new Map<string, ModuleDefinition>();
    for (const m of patch.modules) {
      const def = getDef(m.type);
      if (!def) continue;
      defs.set(m.id, def);
      const node: EnginePatch['nodes'][number] = { id: nodeIdOf(patch.id, m.id), kind: def.engine, params: { ...m.params } };
      if (m.type === CHANNEL_TYPE) node.active = heard.has(patch.id);
      if (def.banks) node.clips = engineClips(patch, m.id);
      nodes.push(node);
    }
    for (const c of patch.cables) {
      const from = defs.get(c.from.module);
      const to = defs.get(c.to.module);
      if (!from || !to) continue;
      const fromPort = from.outputs.findIndex((p) => p.id === c.from.port);
      const toPort = to.inputs.findIndex((p) => p.id === c.to.port);
      if (fromPort < 0 || toPort < 0) continue;
      connections.push({
        from: { node: nodeIdOf(patch.id, c.from.module), port: fromPort },
        to: { node: nodeIdOf(patch.id, c.to.module), port: toPort },
      });
    }
  }
  return { nodes, connections };
}

/** A module's timeline blocks as the engine takes them, sorted by start. */
export function engineClips(patch: Patch, moduleId: string): EngineClip[] {
  return patch.clips
    .filter((c) => c.module === moduleId)
    .map((c) => ({ start: c.start, end: c.start + c.length, bank: c.bank }))
    .sort((a, b) => a.start - b.start);
}

/** A string that changes only when modules or cables change (not when parameters move). */
export function structureKey(project: Project): string {
  return project.patches
    .map((patch) => {
      const mods = patch.modules.map((m) => `${m.id}/${m.type}`).join(',');
      const cables = patch.cables.map((c) => `${c.from.module}.${c.from.port}>${c.to.module}.${c.to.port}`).join(',');
      return `${patch.id}:${mods}|${cables}`;
    })
    .join(';');
}
