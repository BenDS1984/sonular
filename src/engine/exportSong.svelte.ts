/**
 * Exporting the song (or the loop) to a WAV file: gathers what the engine needs from the project,
 * lets the export worker render it faster than real time, and saves the file to the downloads.
 */
import { getDefinition } from '../modules/registry';
import { usedSamples } from '../patch/audioTracks';
import { project } from '../patch/patch.svelte';
import { songEnd } from '../patch/timeline';
import { decodeLibrarySample } from '../samples/sampleBuffers';
import { engineState, togglePlay } from './engine.svelte';
import type { FromExportWorker, ToExportWorker } from './export/exportWorker';
import type { ExportJob } from './export/renderSong';
import { compileFaustPrograms } from './faustPrograms';
import { engineLanes, toExportPatch } from './toEnginePatch';

export interface ExportOptions {
  /** The whole song (start to End) or just the loop. */
  what: 'song' | 'loop';
  /** Go on after End while reverb and delay still sound (song only). */
  tail: boolean;
  sampleRate: 44100 | 48000;
}

/** Longest tail after End, in seconds. */
export const MAX_TAIL_SECONDS = 10;

export const exportState = $state({
  phase: 'idle' as 'idle' | 'preparing' | 'rendering' | 'done' | 'error',
  /** 0 to 1 while rendering. */
  progress: 0,
  fileName: '',
  /** Length of the exported audio in seconds. */
  seconds: 0,
  /** The master went over 0 dB somewhere (limiter off). */
  clipped: false,
  error: '',
});

let worker: Worker | null = null;
/** Counts exports; Cancel moves it on, so an export still getting ready knows it was cancelled. */
let exportRun = 0;

/** The names of the Free patches: they ignore the timeline, so they are not exported. */
export const freePatchNames = () => project.patches.filter((p) => p.free).map((p) => p.name);

/** Whether the loop has a stretch to export. */
export const loopExportable = () => project.timeline.loop.end > project.timeline.loop.start;

/** A name for the file: the project's name, safe for every file system. */
export function exportFileName(name: string, what: ExportOptions['what']): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'Sonular';
  return what === 'loop' ? `${safe} (loop).wav` : `${safe}.wav`;
}

export async function startExport(opts: ExportOptions): Promise<void> {
  if (exportState.phase === 'preparing' || exportState.phase === 'rendering') return;
  const run = ++exportRun;
  Object.assign(exportState, { phase: 'preparing', progress: 0, fileName: '', seconds: 0, clipped: false, error: '' });
  // Playing stops while exporting (both would want the computer's full attention).
  if (engineState.playing) await togglePlay();
  try {
    const loop = project.timeline.loop;
    const song = opts.what === 'song';
    const from = song ? 0 : loop.start;
    const to = song ? songEnd(project) : loop.end;
    const ids = [...usedSamples(project)];
    const [faust, decoded] = await Promise.all([
      compileFaustPrograms(),
      Promise.all(ids.map(async (id) => ({ id, sample: await decodeLibrarySample(id, opts.sampleRate) }))),
    ]);
    const samples = decoded.flatMap(({ id, sample }) => (sample ? [{ id, rate: sample.rate, channels: sample.channels }] : []));
    const job: ExportJob = {
      sampleRate: opts.sampleRate,
      graph: toExportPatch(project, getDefinition),
      lanes: engineLanes(project, getDefinition),
      tempo: project.tempo,
      masterLevel: project.masterLevel,
      limiter: project.masterLimiter,
      samples,
      from,
      to,
      tailSeconds: song && opts.tail ? MAX_TAIL_SECONDS : 0,
    };
    const fileName = exportFileName(project.name, opts.what);
    if (run !== exportRun) return; // cancelled while getting ready

    worker = new Worker(new URL('./export/exportWorker.ts', import.meta.url), { type: 'module' });
    exportState.phase = 'rendering';
    worker.onmessage = (e: MessageEvent<FromExportWorker>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        exportState.progress = msg.done;
      } else if (msg.type === 'done') {
        stopWorker();
        download(new Blob(msg.parts as BlobPart[], { type: 'audio/wav' }), fileName);
        Object.assign(exportState, { phase: 'done', progress: 1, fileName, seconds: msg.frames / opts.sampleRate, clipped: msg.clipped });
      } else {
        stopWorker();
        Object.assign(exportState, { phase: 'error', error: msg.message });
      }
    };
    worker.onerror = (e) => {
      stopWorker();
      Object.assign(exportState, { phase: 'error', error: e.message || 'The export stopped unexpectedly.' });
    };
    const transfer = samples.flatMap((s) => s.channels.map((c) => c.buffer as ArrayBuffer));
    worker.postMessage({ type: 'render', job, faust } satisfies ToExportWorker, transfer);
  } catch (err) {
    stopWorker();
    Object.assign(exportState, { phase: 'error', error: (err as Error).message });
  }
}

/** Stop an export that is running; nothing is saved. */
export function cancelExport(): void {
  exportRun++;
  stopWorker();
  exportState.phase = 'idle';
  exportState.progress = 0;
}

function stopWorker() {
  worker?.terminate();
  worker = null;
}

/** Save a file to the downloads. */
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
