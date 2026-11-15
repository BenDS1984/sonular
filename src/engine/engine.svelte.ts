/**
 * App-wide audio engine instance plus reactive state for the UI.
 */
import { AudioEngine, DEFAULT_BUFFER, type BufferSize, type EngineStatus } from './AudioEngine';
import type { EnginePatch } from './core/types';

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
});

// Temporary: `?buffer=<milliseconds>` or `?buffer=interactive|balanced|playback` in the address
// overrides the audio buffer, to compare dropout behaviour. Becomes a proper audio setting later.
function bufferFromUrl(): BufferSize {
  const raw = new URLSearchParams(window.location.search).get('buffer');
  if (raw === 'interactive' || raw === 'balanced' || raw === 'playback') return raw;
  const ms = Number(raw);
  return raw && ms >= 5 && ms <= 200 ? ms : DEFAULT_BUFFER;
}

export const audio = new AudioEngine({
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
  },
}, bufferFromUrl());

// Development aid: inspect the engine from the browser console as `__modulab`.
if (import.meta.env.DEV) {
  (globalThis as Record<string, unknown>).__modulab = { audio, engineState };
}

/**
 * Temporary patch for step 3: a quiet 440 Hz test tone (−18 dBFS) into the master output.
 * Replaced by the user's own patch once modules and cables exist (step 4/5).
 */
const TEST_PATCH: EnginePatch = {
  nodes: [
    { id: 'tone', kind: 'faust:testtone', params: { freq: 440, gain: 0.125 } },
    { id: 'master', kind: 'master' },
  ],
  connections: [{ from: { node: 'tone', port: 0 }, to: { node: 'master', port: 0 } }],
};

let patchSent = false;

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
  if (!patchSent) {
    audio.setPatch(TEST_PATCH);
    patchSent = true;
  }
  audio.setRunning(true);
  engineState.playing = true;
}
