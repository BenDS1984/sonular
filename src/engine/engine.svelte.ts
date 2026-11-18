/**
 * App-wide audio engine instance, reactive state for the UI, and live sync of the patch.
 */
import { untrack } from 'svelte';
import { CpuHistory } from './cpuHistory';
import { pruneRecorders, receiveRecording, resendArmed, transportStopped } from './recordings.svelte';
import { AudioEngine, DEFAULT_BUFFER, type BufferSize, type EngineStatus } from './AudioEngine';
import type { DisplayLayoutEntry, MeterLayoutEntry } from './core/types';
import { getDefinition } from '../modules/registry';
import { patch, project } from '../patch/patch.svelte';
import { structureKey, toEnginePatch } from './toEnginePatch';

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
  /** Transport position in beats since Play was pressed. */
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

/** Meter value of a module, or 0 while stopped. Reactive. */
export function meterValue(moduleId: string, name: string): number {
  return engineState.playing ? (engineState.meters[moduleId]?.[name] ?? 0) : 0;
}

/** Display values of a module (e.g. a scope trace), or null while stopped. Reactive. */
export function displayValues(moduleId: string): Float32Array | null {
  void engineState.statsTick;
  return engineState.playing ? (displays[moduleId] ?? null) : null;
}

// Development aid: inspect the engine from the browser console as `__sonular`.
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__sonular = { audio, engineState, project, patch, cpuHistory, cpuHistoryState };
}

// ---------- Live patch sync ----------

/** Parameter values last sent to the engine, per module. */
let sentParams: Record<string, Record<string, number>> = {};

/**
 * Keep the engine in step with the patch while it runs (for now the patch shown in the workspace;
 * playing all patches of the project together comes with the mixer):
 * - modules or cables change -> send the whole graph (existing modules keep their state);
 * - a parameter changes -> send just that value.
 */
export function startPatchSync(): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (engineState.status !== 'ready') return;
      void structureKey(patch); // dependency on modules and cables only
      untrack(() => {
        audio.setPatch(toEnginePatch(patch, getDefinition));
        sentParams = Object.fromEntries(patch.modules.map((m) => [m.id, { ...m.params }]));
        pruneRecorders(new Set(patch.modules.map((m) => m.id)));
        resendArmed();
      });
    });

    // The tempo is remembered by `audio` even while the engine is off, so start-up uses it too.
    $effect(() => {
      audio.setTempo(project.tempo);
    });

    $effect(() => {
      if (engineState.status !== 'ready') return;
      for (const m of patch.modules) {
        for (const [name, value] of Object.entries(m.params)) {
          const sent = sentParams[m.id];
          if (sent && sent[name] !== value) {
            audio.setParam(m.id, name, value);
            sent[name] = value;
          }
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
  engineState.beat = 0;
}

export async function togglePlay(): Promise<void> {
  clearMeters();
  if (engineState.playing) {
    audio.setRunning(false);
    engineState.playing = false;
    transportStopped();
    return;
  }
  try {
    await audio.start();
  } catch {
    return; // error is reported through engineState
  }
  audio.setRunning(true);
  engineState.playing = true;
}
