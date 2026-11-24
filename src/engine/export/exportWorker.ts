/**
 * Web worker that renders the song to a 24-bit WAV file, off the main thread and faster than real
 * time. Gets everything the engine needs in one message; sends progress, then the file's bytes.
 */
import { SampleBank } from '../core/SampleBank';
import { createEngine } from '../createEngine';
import type { FaustProgram } from '../protocol';
import { encodePcm24, wavHeader } from '../wav';
import { renderSong, type ExportJob } from './renderSong';

export type ToExportWorker = { type: 'render'; job: ExportJob; faust: FaustProgram[] };

export type FromExportWorker =
  | { type: 'progress'; done: number }
  | { type: 'done'; parts: Uint8Array[]; frames: number; clipped: boolean }
  | { type: 'error'; message: string };

/** Render this long between two progress reports. (Cancelling ends the whole worker.) */
const SLICE_MS = 40;

const post = (msg: FromExportWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

self.onmessage = (e: MessageEvent<ToExportWorker>) => {
  const msg = e.data;
  try {
    run(msg.job, msg.faust);
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};

function run(job: ExportJob, faust: FaustProgram[]) {
  const samples = new SampleBank();
  for (const s of job.samples) samples.set(s.id, s.rate, s.channels);
  const engine = createEngine(job.sampleRate, faust, samples);
  const parts: Uint8Array[] = [];
  const steps = renderSong(engine, job, (left, right) => parts.push(encodePcm24(left, right)));

  const slice = () => {
    try {
      const until = performance.now() + SLICE_MS;
      let progress = 0;
      for (;;) {
        const r = steps.next();
        if (r.done) {
          const all = [wavHeader(r.value.frames, job.sampleRate), ...parts];
          post({ type: 'done', parts: all, frames: r.value.frames, clipped: r.value.clipped }, all.map((p) => p.buffer as ArrayBuffer));
          return;
        }
        progress = r.value;
        if (performance.now() >= until) break;
      }
      post({ type: 'progress', done: progress });
      setTimeout(slice, 0);
    } catch (err) {
      post({ type: 'error', message: (err as Error).message });
    }
  };
  slice();
}
