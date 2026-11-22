/**
 * Translate the user's project (patches of modules with named ports) into the engine's single
 * graph (kinds, port indexes). All patches play together: each module becomes a node with the id
 * "<patch id>/<module id>", and each patch's Channel is a sink on the master bus.
 */
import type { ModuleDefinition } from '../modules/types';
import { CHANNEL_TYPE } from '../patch/operations';
import { holdsSteps } from '../patch/timeline';
import type { AudioTrack, Patch, Project } from '../patch/types';
import type { EngineAudioClip, EngineClip, EnginePatch } from './core/types';
import type { EngineLane } from './core/automation';
import { toNormalized } from '../ui/scale';

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
  const anySolo = anySoloed(project);
  const heard = new Set<string>();
  for (const p of project.patches) {
    const ch = channelOf(p);
    if (!ch || isOn(ch.params['mute'])) continue;
    if (anySolo && !isOn(ch.params['solo'])) continue;
    heard.add(p.id);
  }
  return heard;
}

/** Whether any channel, of a patch or an audio track, is soloed. */
function anySoloed(project: Project): boolean {
  return project.patches.some((p) => isOn(channelOf(p)?.params['solo'])) || project.audioTracks.some((t) => t.solo);
}

/** Which audio tracks are heard: the same rules as for the patches' channels. */
export function audibleAudioTracks(project: Project): Set<string> {
  const anySolo = anySoloed(project);
  const heard = new Set<string>();
  for (const t of project.audioTracks) {
    if (t.mute || (anySolo && !t.solo)) continue;
    heard.add(t.id);
  }
  return heard;
}

/** Engine node id of an audio track (its channel on the master bus). */
export const audioNodeId = (trackId: string) => nodeIdOf('audio', trackId);

/** An audio track's sample clips as the engine takes them, sorted by start. */
export function engineAudioClips(track: AudioTrack): EngineAudioClip[] {
  return track.clips
    .map((c) => ({ sample: c.sample, start: c.start, end: c.start + c.length, offset: c.offset }))
    .sort((a, b) => a.start - b.start);
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
  const audioHeard = audibleAudioTracks(project);
  for (const track of project.audioTracks) {
    nodes.push({
      id: audioNodeId(track.id),
      kind: 'native:audiotrack',
      params: { level: track.level },
      audioClips: engineAudioClips(track),
      active: audioHeard.has(track.id),
    });
  }
  return { nodes, connections };
}

/**
 * A module's timeline blocks as the engine takes them, sorted by start. None for a Free patch: its
 * sequencers then play the pattern chosen on the module.
 */
export function engineClips(patch: Patch, moduleId: string): EngineClip[] {
  if (patch.free) return [];
  return patch.clips
    .filter((c) => c.module === moduleId)
    .map((c) => ({ start: c.start, end: c.start + c.length, bank: c.bank }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Every automation lane of the project as the engine takes it: points as knob positions, sorted
 * by time. None for Free patches, lanes without points, controls that no longer exist, or controls
 * the user took over (`paused`: keys "<patch id>/<module id>:<param>").
 */
export function engineLanes(project: Project, getDef: DefinitionLookup, paused: Record<string, true> = {}): EngineLane[] {
  const lanes: EngineLane[] = [];
  for (const patch of project.patches) {
    if (patch.free) continue;
    for (const l of patch.lanes) {
      const m = patch.modules.find((x) => x.id === l.module);
      const spec = m && getDef(m.type)?.params.find((s) => s.id === l.param);
      if (!spec || l.points.length === 0 || paused[`${patch.id}/${l.module}:${l.param}`]) continue;
      const scale = spec.scale ?? 'linear';
      const points = [...l.points].sort((a, b) => a.time - b.time);
      lanes.push({
        node: nodeIdOf(patch.id, l.module),
        param: l.param,
        times: points.map((pt) => pt.time),
        positions: points.map((pt) => toNormalized(pt.value, spec.min, spec.max, scale)),
        curves: points.map((pt) => pt.curve ?? 0),
        min: spec.min,
        max: spec.max,
        scale,
        // 0 = glide; choices and switches hold each point at their step.
        step: holdsSteps(spec) ? spec.step! : 0,
      });
    }
  }
  return lanes;
}

/** A string that changes only when modules or cables change (not when parameters move). */
export function structureKey(project: Project): string {
  return project.patches
    .map((patch) => {
      const mods = patch.modules.map((m) => `${m.id}/${m.type}`).join(',');
      const cables = patch.cables.map((c) => `${c.from.module}.${c.from.port}>${c.to.module}.${c.to.port}`).join(',');
      return `${patch.id}:${mods}|${cables}`;
    })
    .concat(project.audioTracks.map((t) => `audio:${t.id}`))
    .join(';');
}
