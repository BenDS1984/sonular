/**
 * App-wide audio engine instance, reactive state for the UI, and live sync of the patch.
 */
import { untrack } from 'svelte';
import { CpuHistory } from './cpuHistory';
import { pruneRecorders, receiveRecording, resendArmed, transportStopped } from './recordings.svelte';
import { AudioEngine, DEFAULT_BUFFER, type BufferSize, type EngineStatus } from './AudioEngine';
import type { DisplayLayoutEntry, MeterLayoutEntry } from './core/types';
import { getDefinition } from '../modules/registry';
import { CHANNEL_TYPE } from '../patch/operations';
import { patch, project } from '../patch/patch.svelte';
import { usedSamples } from '../patch/audioTracks';
import { decodeLibrarySample } from '../samples/sampleBuffers';
import {
  audibleAudioTracks,
  audioNodeId,
  audiblePatches,
  engineAudioClips,
  engineClips,
  engineLanes,
  nodeIdOf,
  structureKey,
  toEnginePatch,
} from './toEnginePatch';
import { clearOverrides, overrides } from './overrides.svelte';

export const engineState = $state({
  status: 'off' as EngineStatus,
  error: '',
  playing: false,
  cpu: 0,
  peakL: 0,
  peakR: 0,
  clipped: false,
  processed: 0,
  sleeping: 0,
  /** Transport position in beats from the start of the song (while playing). */
  beat: 0,
  /** Increments with every stats message, so views can react even when values repeat. */
  statsTick: 0,
  /** Live meter values per module: meters[moduleId][meterName], linear peak amplitude. */
  meters: {} as Record<string, Record<string, number>>,
});

// Temporary: `?buffer=<milliseconds>` or `?buffer=interactive|balanced|playback` in the address
// overrides the audio buffer, to compare dropout behaviour. Becomes a proper audio setting later.
function bufferFromUrl(): BufferSize {
  const raw = new URLSearchParams(window.location.search).get('buffer');
  if (raw === 'interactive' || raw === 'balanced' || raw === 'playback') return raw;
  const ms = Number(raw);
  return raw && ms >= 5 && ms <= 200 ? ms : DEFAULT_BUFFER;
}

/**
 * Where Play starts, in beats: the playhead while stopped. Screen state, not saved and not part
 * of undo. Stopping returns the playhead here.
 */
export const transportState = $state({ start: 0 });

/** When `engineState.beat` was last updated (performance.now()). */
let beatAt = 0;

/**
 * The song position right now, in beats: the last reported position moved on by the time since
 * then (positions arrive every 50 ms), wrapped round the loop. Not reactive.
 */
export function currentBeat(): number {
  if (!engineState.playing) return engineState.beat;
  let b = engineState.beat + (Math.min(200, performance.now() - beatAt) / 60000) * project.tempo;
  const loop = project.timeline.loop;
  if (loop.on && loop.end > loop.start && engineState.beat < loop.end && b >= loop.end) {
    b = loop.start + ((b - loop.end) % (loop.end - loop.start));
  }
  return b;
}

/** Put the playhead somewhere; while playing, playback jumps there. */
export function setPlayhead(beat: number) {
  const b = Number.isFinite(beat) ? Math.max(0, beat) : 0;
  transportState.start = b;
  if (engineState.playing) {
    audio.locate(b);
    engineState.beat = b;
    beatAt = performance.now();
  }
}

/** CPU load over the last minutes, for the graph behind the CPU meter. */
export const cpuHistory = new CpuHistory();
/** Increments whenever `cpuHistory` gains a point, so the graph knows when to redraw. */
export const cpuHistoryState = $state({ version: 0 });

let meterLayout: MeterLayoutEntry[] = [];
let displayLayout: DisplayLayoutEntry[] = [];

/**
 * Latest display values per module (scope traces). Not reactive by itself: `displayValues`
 * reads `engineState.statsTick`, so views redraw with every stats message.
 */
const displays: Record<string, Float32Array> = {};

export const audio = new AudioEngine(
  {
    onStatus(status, error) {
      engineState.status = status;
      engineState.error = error ?? '';
      if (status === 'error') {
        engineState.playing = false;
        transportStopped();
      }
    },
    onStats(s) {
      engineState.cpu = s.cpu;
      engineState.peakL = s.peakL;
      engineState.peakR = s.peakR;
      engineState.clipped = s.clipped;
      engineState.processed = s.processed;
      engineState.sleeping = s.sleeping;
      engineState.beat = s.beat;
      beatAt = performance.now();
      engineState.statsTick++;
      if (cpuHistory.add(performance.now() / 1000, s.cpu, engineState.playing)) cpuHistoryState.version++;
      let i = 0;
      for (const entry of meterLayout) {
        const target = (engineState.meters[entry.node] ??= {});
        for (const name of entry.names) target[name] = s.meters[i++] ?? 0;
      }
      let offset = 0;
      for (const entry of displayLayout) {
        displays[entry.node] = s.displays.subarray(offset, offset + entry.length);
        offset += entry.length;
      }
    },
    onRecorded(node, sampleRate, piece) {
      receiveRecording(node, sampleRate, piece);
    },
    onMeterLayout(layout, displayEntries) {
      meterLayout = layout;
      displayLayout = displayEntries;
      for (const id of Object.keys(displays)) {
        if (!displayEntries.some((e) => e.node === id)) delete displays[id];
      }
      for (const id of Object.keys(engineState.meters)) {
        if (!layout.some((e) => e.node === id)) delete engineState.meters[id];
      }
    },
  },
  bufferFromUrl(),
);

/** Engine node id of a module in the patch shown in the workspace. Reactive. */
export function nodeId(moduleId: string): string {
  return nodeIdOf(project.activePatch, moduleId);
}

/** Meter value of a module in a given patch, or 0 while stopped. Reactive. */
export function meterValueIn(patchId: string, moduleId: string, name: string): number {
  return engineState.playing ? (engineState.meters[nodeIdOf(patchId, moduleId)]?.[name] ?? 0) : 0;
}

/** Meter value of a module in the patch shown in the workspace, or 0 while stopped. Reactive. */
export function meterValue(moduleId: string, name: string): number {
  return meterValueIn(project.activePatch, moduleId, name);
}

/** Display values of a module (e.g. a scope trace), or null while stopped. Reactive. */
export function displayValues(moduleId: string): Float32Array | null {
  void engineState.statsTick;
  return engineState.playing ? (displays[nodeId(moduleId)] ?? null) : null;
}

// Development aid: inspect the engine from the browser console as `__sonular`.
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__sonular = { audio, engineState, project, patch, cpuHistory, cpuHistoryState };
}

// ---------- Live patch sync ----------

/** Parameter values last sent to the engine, per node. */
let sentParams: Record<string, Record<string, number>> = {};
/** Whether each Channel node was last told it is heard. */
let sentActive: Record<string, boolean> = {};
/** Timeline blocks last sent to each sequencer node, as JSON. */
let sentClips: Record<string, string> = {};
/** Sample clips last sent to each audio track node, as JSON. */
let sentAudioClips: Record<string, string> = {};
/** Automation lanes last sent, as JSON. */
let sentLanes = '';

/** Samples in the engine (or being decoded for it). */
const sentSamples = new Set<string>();

function syncSamples(used: ReadonlySet<string>) {
  const gone = [...sentSamples].filter((id) => !used.has(id));
  if (gone.length > 0) {
    for (const id of gone) sentSamples.delete(id);
    audio.dropSamples(gone);
  }
  const rate = audio.sampleRate;
  if (!rate) return;
  for (const id of used) {
    if (sentSamples.has(id)) continue;
    sentSamples.add(id);
    void decodeLibrarySample(id, rate).then((decoded) => {
      // Unused again or the engine restarted while decoding: nothing to send.
      // (A sample that cannot be read stays in the set, so it is not tried again on every change.)
      if (!decoded || !sentSamples.has(id) || engineState.status !== 'ready' || audio.sampleRate !== rate) return;
      audio.sendSample(id, decoded.rate, decoded.channels);
    });
  }
}

function sendLanes() {
  const lanes = engineLanes(project, getDefinition, overrides.keys);
  const key = JSON.stringify(lanes);
  if (key === sentLanes) return;
  audio.setAutomation(lanes);
  sentLanes = key;
}

/**
 * Keep the engine in step with the project while it runs. Every patch plays, each into its
 * Channel on the master bus:
 * - modules or cables change (in any patch) -> send the whole graph (existing modules keep
 *   their state);
 * - a parameter changes -> send just that value;
 * - a sequencer's timeline blocks change -> send that sequencer's blocks;
 * - automation lanes change (or a patch goes Free) -> send all lanes;
 * - mute/solo change which patches are heard -> switch their Channels on or off (they fade, and
 *   a silent patch stops using CPU apart from its clock and sequencer);
 * - the master level changes -> send it.
 */
export function startPatchSync(): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (engineState.status !== 'ready') return;
      void structureKey(project); // dependency on modules and cables only
      untrack(() => {
        const graph = toEnginePatch(project, getDefinition);
        audio.setPatch(graph);
        sentParams = Object.fromEntries(graph.nodes.map((n) => [n.id, { ...n.params }]));
        sentActive = Object.fromEntries(graph.nodes.filter((n) => n.active !== undefined).map((n) => [n.id, n.active!]));
        sentClips = Object.fromEntries(graph.nodes.filter((n) => n.clips).map((n) => [n.id, JSON.stringify(n.clips)]));
        // The engine may be new (started, or restarted after an error): send the lanes again.
        sentAudioClips = Object.fromEntries(graph.nodes.filter((n) => n.audioClips).map((n) => [n.id, JSON.stringify(n.audioClips)]));
        sentLanes = '';
        sendLanes();
        pruneRecorders(new Set(graph.nodes.map((n) => n.id)));
        resendArmed();
      });
    });

    // Tempo and master level are remembered by `audio` even while the engine is off, so start-up
    // uses them too.
    $effect(() => {
      audio.setTempo(project.tempo);
    });
    $effect(() => {
      audio.setMasterLevel(project.masterLevel);
    });
    $effect(() => {
      const { on, start, end } = project.timeline.loop;
      audio.setLoop({ on, start, end });
    });

    $effect(() => {
      if (engineState.status !== 'ready') return;
      for (const p of project.patches) {
        for (const m of p.modules) {
          const id = nodeIdOf(p.id, m.id);
          const sent = sentParams[id];
          if (!sent) continue;
          for (const [name, value] of Object.entries(m.params)) {
            if (sent[name] !== value) {
              audio.setParam(id, name, value);
              sent[name] = value;
            }
          }
        }
      }
    });

    $effect(() => {
      if (engineState.status !== 'ready') return;
      for (const p of project.patches) {
        for (const m of p.modules) {
          const id = nodeIdOf(p.id, m.id);
          if (!(id in sentClips)) continue;
          const clips = engineClips(p, m.id);
          const key = JSON.stringify(clips);
          if (sentClips[id] !== key) {
            audio.setClips(id, clips);
            sentClips[id] = key;
          }
        }
      }
    });

    $effect(() => {
      if (engineState.status !== 'ready') return;
      sendLanes();
    });

    // Audio tracks: level, sample clips, and heard or not (mute/solo, together with the patches).
    $effect(() => {
      if (engineState.status !== 'ready') return;
      const heard = audibleAudioTracks(project);
      for (const t of project.audioTracks) {
        const id = audioNodeId(t.id);
        if (!(id in sentParams)) continue; // the graph with this track is not sent yet
        for (const [name, value] of [['level', t.level], ['pan', t.pan]] as const) {
          if (sentParams[id]![name] !== value) {
            audio.setParam(id, name, value);
            sentParams[id]![name] = value;
          }
        }
        const clips = engineAudioClips(t);
        const key = JSON.stringify(clips);
        if (sentAudioClips[id] !== key) {
          audio.setAudioClips(id, clips);
          sentAudioClips[id] = key;
        }
        const active = heard.has(t.id);
        if (id in sentActive && sentActive[id] !== active) {
          audio.setSinkActive(id, active);
          sentActive[id] = active;
        }
      }
    });

    // Samples the audio tracks use: decoded once and handed to the engine; dropped when unused.
    $effect(() => {
      if (engineState.status !== 'ready') {
        sentSamples.clear();
        return;
      }
      const used = usedSamples(project);
      untrack(() => syncSamples(used));
    });

    $effect(() => {
      if (engineState.status !== 'ready') return;
      const heard = audiblePatches(project);
      for (const p of project.patches) {
        const ch = p.modules.find((m) => m.type === CHANNEL_TYPE);
        if (!ch) continue;
        const id = nodeIdOf(p.id, ch.id);
        const active = heard.has(p.id);
        if (id in sentActive && sentActive[id] !== active) {
          audio.setSinkActive(id, active);
          sentActive[id] = active;
        }
      }
    });
  });
}

/** Forget meter readings, so nothing from a previous run (or before the first) is shown. */
function clearMeters() {
  for (const values of Object.values(engineState.meters)) {
    for (const name of Object.keys(values)) values[name] = 0;
  }
  engineState.peakL = 0;
  engineState.peakR = 0;
  engineState.beat = transportState.start;
}

export async function togglePlay(): Promise<void> {
  clearMeters();
  if (engineState.playing) {
    audio.setRunning(false);
    engineState.playing = false;
    transportStopped();
    return;
  }
  // Every control taken over follows its automation again.
  clearOverrides();
  try {
    await audio.start();
  } catch {
    return; // error is reported through engineState
  }
  audio.setRunning(true, transportState.start);
  engineState.beat = transportState.start;
  beatAt = performance.now();
  engineState.playing = true;
}
