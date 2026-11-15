/**
 * Main-thread handle to the audio engine: creates the AudioContext, loads the worklet and the
 * Faust programs, and forwards patch/parameter changes. All DSP happens in the worklet.
 */
import workletUrl from './worklet/processor.ts?worker&url';
import type { EnginePatch } from './core/types';
import { compileFaustPrograms } from './faustPrograms';
import { PROCESSOR_NAME, type EngineStats, type FromEngine, type ToEngine } from './protocol';

export type EngineStatus = 'off' | 'starting' | 'ready' | 'error';

/**
 * Size of the browser's audio buffer: a named browser preset or a number of milliseconds.
 * Smaller = less delay between a change and hearing it, but more risk of dropouts (clicks).
 * Default 'playback': the browser's own safe choice, which played cleanly where explicit
 * millisecond values did not. (Chromium on Windows treats 'interactive' and 'balanced' alike.)
 */
export type BufferSize = 'interactive' | 'balanced' | 'playback' | number;
export const DEFAULT_BUFFER: BufferSize = 'playback';

export interface AudioEngineEvents {
  onStatus?(status: EngineStatus, error?: string): void;
  onStats?(stats: EngineStats): void;
  onStopped?(): void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private starting: Promise<void> | null = null;
  /** Whether CPU readings come from a high-resolution timer. */
  hiResTimer = false;
  private events: AudioEngineEvents;

  /** Requested buffer size (preset name or milliseconds). */
  readonly buffer: BufferSize;

  constructor(events: AudioEngineEvents = {}, buffer: BufferSize = DEFAULT_BUFFER) {
    this.events = events;
    this.buffer = buffer;
  }

  /** The underlying context, for diagnostics only. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get sampleRate(): number | null {
    return this.ctx?.sampleRate ?? null;
  }

  /**
   * Create the audio context and engine. Must be called from a user gesture (e.g. a click):
   * browsers only allow sound to start after one.
   */
  start(): Promise<void> {
    if (this.node && this.ctx) return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
    this.starting ??= this.boot().catch((err: Error) => {
      this.starting = null;
      this.teardown();
      this.events.onStatus?.('error', err.message);
      throw err;
    });
    return this.starting;
  }

  private async boot(): Promise<void> {
    this.events.onStatus?.('starting');
    const latencyHint = typeof this.buffer === 'number' ? this.buffer / 1000 : this.buffer;
    const ctx = new AudioContext({ latencyHint });
    this.ctx = ctx;
    const [programs] = await Promise.all([compileFaustPrograms(), ctx.audioWorklet.addModule(workletUrl)]);

    const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node = node;

    const ready = new Promise<void>((resolve, reject) => {
      node.port.onmessage = (e: MessageEvent<FromEngine>) => {
        const msg = e.data;
        switch (msg.type) {
          case 'ready':
            this.hiResTimer = msg.hiResTimer;
            resolve();
            break;
          case 'stats':
            this.events.onStats?.(msg.stats);
            break;
          case 'stopped':
            this.events.onStopped?.();
            break;
          case 'error':
            reject(new Error(msg.message));
            this.events.onStatus?.('error', msg.message);
            break;
        }
      };
    });
    node.onprocessorerror = () => this.events.onStatus?.('error', 'The audio engine crashed.');

    this.send({ type: 'init', faust: programs });
    await ready;
    node.connect(ctx.destination);
    if (ctx.state !== 'running') await ctx.resume();
    this.events.onStatus?.('ready');
  }

  /** Shut the engine down and release the audio device. */
  close(): void {
    this.starting = null;
    this.teardown();
    this.events.onStatus?.('off');
  }

  private teardown() {
    this.node?.disconnect();
    this.node = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  private send(msg: ToEngine) {
    this.node?.port.postMessage(msg);
  }

  setPatch(patch: EnginePatch): void {
    this.send({ type: 'patch', patch });
  }

  setParam(node: string, name: string, value: number): void {
    this.send({ type: 'param', node, name, value });
  }

  /** Start or stop rendering (with a short fade to avoid clicks). */
  setRunning(running: boolean): void {
    this.send({ type: 'run', running });
  }
}
