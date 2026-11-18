import type { DspModule, RecordedAudio } from '../core/types';

/** Room for the audio between two hand-overs (every 50 ms) at up to 192 kHz, with margin. */
const CHUNK_FRAMES = 32768;

/**
 * Recorder: records its stereo input while armed and the patch is playing, and hands the
 * audio over in chunks (the main thread stores it and writes the WAV file). The signal also
 * leaves unchanged through the outputs.
 *
 * Inputs:  0 L, 1 R (R follows L while R is unpatched: mono on both sides).
 * Outputs: 0 L, 1 R (copies of the inputs).
 *
 * Control (not stored in the patch): parameter "armed" 0/1, set by the panel.
 * - Armed when Play is pressed: Play restarts every module, so the take starts on the very first
 *   sample of the first beat.
 * - Armed while already playing: the take starts with the next block.
 * Every take gets a new number, so the main thread knows when a new take replaces the old one.
 *
 * Observer that never sleeps: it records even when its outputs lead nowhere, and silence is
 * recorded as silence (time never skips).
 *
 * Meters "peakL"/"peakR": highest level since the previous reading.
 */
export class Recorder implements DspModule {
  readonly numInputs = 2;
  readonly numOutputs = 2;
  readonly tailSeconds = Infinity;
  readonly isObserver = true;
  readonly meterNames = ['peakL', 'peakR'] as const;

  private armed = false;
  private recording = false;
  private take = 0;
  private rightConnected = false;

  private readonly left = new Float32Array(CHUNK_FRAMES);
  private readonly right = new Float32Array(CHUNK_FRAMES);
  private frames = 0;
  /** Takes that already handed audio over; the chunk always belongs to `take`. */
  private chunkTake = 0;

  private peakL = 0;
  private peakR = 0;

  setParam(name: string, value: number): void {
    if (name !== 'armed') return;
    this.armed = value >= 0.5;
    if (!this.armed) this.recording = false;
  }

  onConnectionsChanged(connected: readonly boolean[]): void {
    this.rightConnected = connected[1] ?? false;
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const inL = inputs[0]!;
    const inR = this.rightConnected ? inputs[1]! : inL;
    const outL = outputs[0]!;
    const outR = outputs[1]!;
    let pl = this.peakL;
    let pr = this.peakR;
    for (let i = 0; i < frames; i++) {
      const l = inL[i]!;
      const r = inR[i]!;
      outL[i] = l;
      outR[i] = r;
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > pl) pl = al;
      if (ar > pr) pr = ar;
    }
    this.peakL = pl;
    this.peakR = pr;

    if (!this.armed) return;
    if (!this.recording) {
      this.recording = true;
      this.take++;
    }
    // A chunk never mixes two takes: a new take waits until the old audio has been handed over.
    if (this.frames > 0 && this.chunkTake !== this.take) return;
    this.chunkTake = this.take;
    const n = Math.min(frames, CHUNK_FRAMES - this.frames);
    this.left.set(inL.subarray(0, n), this.frames);
    this.right.set(inR.subarray(0, n), this.frames);
    this.frames += n;
  }

  takeRecorded(): RecordedAudio | null {
    if (this.frames === 0) return null;
    // Copies (allocation only while recording, 20 times per second): they are transferred to
    // the main thread, which detaches them.
    const out = {
      take: this.chunkTake,
      left: this.left.slice(0, this.frames),
      right: this.right.slice(0, this.frames),
    };
    this.frames = 0;
    return out;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.peakL;
    out[offset + 1] = this.peakR;
    this.peakL = 0;
    this.peakR = 0;
  }

  /** Play restarts every module: a take that is armed starts again from the top. */
  reset(): void {
    this.recording = false;
    this.peakL = 0;
    this.peakR = 0;
  }
}
