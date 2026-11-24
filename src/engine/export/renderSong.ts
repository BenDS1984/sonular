/**
 * Rendering a stretch of the song to audio, faster than real time (no sound card involved): the
 * same Engine as playback, fed the same graph, lanes and samples, so the result sounds exactly like
 * what is heard. Plain TypeScript (no browser APIs), so it runs in a worker and in Node tests.
 */
import type { Engine } from '../core/Engine';
import type { EngineLane } from '../core/automation';
import { BLOCK_SIZE, type EnginePatch } from '../core/types';

export interface ExportJob {
  sampleRate: number;
  graph: EnginePatch;
  lanes: EngineLane[];
  tempo: number;
  masterLevel: number;
  limiter: boolean;
  samples: { id: string; rate: number; channels: Float32Array[] }[];
  /** The stretch to render, in beats. */
  from: number;
  to: number;
  /** How long it may go on after `to` while it still sounds (reverb, delay), in seconds; 0: not at all. */
  tailSeconds: number;
}

export interface RenderResult {
  frames: number;
  /** Whether the master went over 0 dB somewhere (only possible with the limiter off). */
  clipped: boolean;
}

/** Frames rendered between two progress reports. */
const CHUNK = BLOCK_SIZE * 64;
/** Below this level the tail counts as silent (about -80 dB). */
const SILENT = 1e-4;
/** The tail ends after this much silence (the silence itself is left off). */
const SILENCE_SECONDS = 0.25;

/**
 * Render `job` with `engine` (made with createEngine, its samples already loaded). Every piece of
 * audio goes to `emit` in order; the generator yields the progress (0 to 1) between pieces, so the
 * caller can stay responsive and stop early, and returns the length and whether it clipped.
 */
export function* renderSong(
  engine: Engine,
  job: ExportJob,
  emit: (left: Float32Array, right: Float32Array) => void,
): Generator<number, RenderResult> {
  const sr = job.sampleRate;
  engine.setTempo(job.tempo);
  engine.setMasterLevel(job.masterLevel);
  engine.setLimiter(job.limiter, true);
  engine.setLoop(false, 0, 0);
  engine.setPatch(job.graph);
  engine.setAutomation(job.lanes);
  engine.restart(job.from);
  engine.takeMeters(); // start with clean readings

  const main = Math.max(0, Math.round(((job.to - job.from) * 60 * sr) / job.tempo));
  const tailMax = Math.max(0, Math.round(job.tailSeconds * sr));
  const total = Math.max(1, main + tailMax);
  let frames = 0;
  let clipped = false;

  const renderPiece = (n: number) => {
    const left = new Float32Array(n);
    const right = new Float32Array(n);
    engine.render(left, right, n);
    if (engine.takeMeters().clipped) clipped = true;
    return { left, right };
  };

  for (let done = 0; done < main; ) {
    const n = Math.min(CHUNK, main - done);
    const { left, right } = renderPiece(n);
    emit(left, right);
    done += n;
    frames += n;
    yield done / total;
  }

  // The tail: on while it sounds; once it has been silent for a moment it ends where the silence began.
  const pending: { left: Float32Array; right: Float32Array }[] = [];
  let silentFor = 0;
  for (let t = 0; t < tailMax; ) {
    const n = Math.min(BLOCK_SIZE * 16, tailMax - t);
    const piece = renderPiece(n);
    t += n;
    if (peakOf(piece.left, piece.right) < SILENT) {
      pending.push(piece);
      silentFor += n;
      if (silentFor >= SILENCE_SECONDS * sr) break;
    } else {
      for (const p of pending) {
        emit(p.left, p.right);
        frames += p.left.length;
      }
      pending.length = 0;
      silentFor = 0;
      emit(piece.left, piece.right);
      frames += n;
    }
    yield (main + t) / total;
  }
  return { frames, clipped };
}

function peakOf(left: Float32Array, right: Float32Array): number {
  let p = 0;
  for (let i = 0; i < left.length; i++) {
    const a = Math.abs(left[i]!);
    const b = Math.abs(right[i]!);
    if (a > p) p = a;
    if (b > p) p = b;
  }
  return p;
}
