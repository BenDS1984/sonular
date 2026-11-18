/**
 * Takes recorded by Tape Recorder modules, kept on the main thread until they are saved.
 *
 * The engine hands the audio over 20 times per second; it is converted straight away to the
 * bytes of a 24-bit WAV file, so saving only has to put a header in front (no big copy) and a
 * take needs 3 bytes per sample (about 17 MB per stereo minute at 48 kHz).
 */
import type { RecordedAudio } from './core/types';
import { audio } from './engine.svelte';
import { encodePcm24, wavHeader } from './wav';

/** Longest take, to keep the browser's memory in check (about 260 MB at 48 kHz). */
export const MAX_RECORDING_SECONDS = 15 * 60;

export interface RecorderState {
  /** Rec pressed: records while the patch plays. */
  armed: boolean;
  /** Frames in the current take. */
  frames: number;
  sampleRate: number;
  /** The current take has been downloaded since it was recorded. */
  saved: boolean;
  /** The take reached MAX_RECORDING_SECONDS and stopped. */
  full: boolean;
}

/** Per recorder module (by module id). Reactive: the panels read it. */
export const recorders = $state<Record<string, RecorderState>>({});

/** The audio itself, not reactive (it can be hundreds of megabytes). */
const takes: Record<string, { take: number; parts: Uint8Array[] }> = {};

export function recorderState(id: string): RecorderState {
  return (recorders[id] ??= { armed: false, frames: 0, sampleRate: 48000, saved: true, full: false });
}

/** Rec button: arm or disarm a recorder. */
export function setArmed(id: string, armed: boolean): void {
  const st = recorderState(id);
  st.armed = armed;
  if (armed) st.full = false;
  audio.setParam(id, 'armed', armed ? 1 : 0);
}

/** Audio from the engine. A new take number replaces the previous take. */
export function receiveRecording(id: string, sampleRate: number, piece: RecordedAudio): void {
  const st = recorderState(id);
  let t = takes[id];
  if (!t || t.take !== piece.take) {
    t = takes[id] = { take: piece.take, parts: [] };
    st.frames = 0;
    st.saved = false;
    st.full = false;
  }
  st.sampleRate = sampleRate;
  const room = Math.round(MAX_RECORDING_SECONDS * sampleRate) - st.frames;
  if (room <= 0) return;
  const n = Math.min(room, piece.left.length);
  t.parts.push(encodePcm24(piece.left.subarray(0, n), piece.right.subarray(0, n)));
  st.frames += n;
  if (n < piece.left.length || st.frames >= MAX_RECORDING_SECONDS * sampleRate) {
    st.full = true;
    setArmed(id, false);
  }
}

/** Playback stopped: every take ends, and recorders are no longer armed. */
export function transportStopped(): void {
  for (const [id, st] of Object.entries(recorders)) if (st.armed) setArmed(id, false);
}

/** The engine (re)started: tell it which recorders are armed (that is not part of the patch). */
export function resendArmed(): void {
  for (const [id, st] of Object.entries(recorders)) if (st.armed) audio.setParam(id, 'armed', 1);
}

/** The take as a WAV file, or null when there is none. */
export function recordingBlob(id: string): Blob | null {
  const st = recorders[id];
  const t = takes[id];
  if (!st || !t || st.frames === 0) return null;
  return new Blob([wavHeader(st.frames, st.sampleRate), ...t.parts] as BlobPart[], { type: 'audio/wav' });
}

/** Download the take as "<patch name> recording.wav". */
export function saveRecording(id: string, patchName: string): string | null {
  const blob = recordingBlob(id);
  if (!blob) return null;
  const safe = patchName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Sonular';
  const name = `${safe} recording.wav`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  recorders[id]!.saved = true;
  return name;
}

export function clearRecording(id: string): void {
  delete takes[id];
  const st = recorderState(id);
  st.frames = 0;
  st.saved = true;
  st.full = false;
}

/** Forget recorders whose module was removed from the patch. */
export function pruneRecorders(existing: ReadonlySet<string>): void {
  for (const id of Object.keys(recorders)) {
    if (!existing.has(id)) {
      delete recorders[id];
      delete takes[id];
    }
  }
}

export function hasUnsavedRecording(): boolean {
  return Object.values(recorders).some((st) => st.frames > 0 && !st.saved);
}

// Leaving or reloading the page loses unsaved takes: let the browser ask first.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedRecording()) e.preventDefault();
  });
}
