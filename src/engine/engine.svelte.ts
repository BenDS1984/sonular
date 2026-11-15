/**
 * App-wide audio engine instance, reactive state for the UI, and live sync of the patch.
 */
import { untrack } from 'svelte';
import { AudioEngine, DEFAULT_BUFFER, type BufferSize, type EngineStatus } from './AudioEngine';
import type { MeterLayoutEntry } from './core/types';
import { getDefinition } from '../modules/registry';
import { patch } from '../patch/patch.svelte';
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

let meterLayout: MeterLayoutEntry[] = [];

export const audio = new AudioEngine(
  {
    onStatus(status, error) {
      engineState.status = status;
      engineState.error = error ?? '';
      if (status === 'error') engineState.playing = false;
    },
    onStats(s) {
      engineState.cpu = s.cpu;
      engineState.peakL = s.peakL;
      engineState.peakR = s.peakR;
      engineState.clipped = s.clipped;
      engineState.processed = s.processed;
      engineState.sleeping = s.sleeping;
      engineState.statsTick++;
      let i = 0;
      for (const entry of meterLayout) {
        const target = (engineState.meters[entry.node] ??= {});
        for (const name of entry.names) target[name] = s.meters[i++] ?? 0;
      }
    },
    onMeterLayout(layout) {
      meterLayout = layout;
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

// Development aid: inspect the engine from the browser console as `__modulab`.
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__modulab = { audio, engineState, patch };
}

// ---------- Live patch sync ----------

/** Parameter values last sent to the engine, per module. */
let sentParams: Record<string, Record<string, number>> = {};

/**
 * Keep the engine in step with the patch while it runs:
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
      });
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

export async function togglePlay(): Promise<void> {
  if (engineState.playing) {
    audio.setRunning(false);
    engineState.playing = false;
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
