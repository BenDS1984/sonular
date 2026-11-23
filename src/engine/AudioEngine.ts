/**
 * Main-thread handle to the audio engine: creates the AudioContext, loads the worklet and the
 * Faust programs, and forwards patch/parameter changes. All DSP happens in the worklet.
 */
import workletUrl from './worklet/processor.ts?worker&url';
import type { DisplayLayoutEntry, EngineAudioClip, EngineClip, EnginePatch, MeterLayoutEntry, RecordedAudio } from './core/types';
import { DEFAULT_TEMPO } from './core/Transport';
import type { EngineLane } from './core/automation';
import { compileFaustPrograms } from './faustPrograms';
import { PROCESSOR_NAME, type EngineStats, type FromEngine, type LoopSetting, type ToEngine } from './protocol';

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
  onMeterLayout?(layout: MeterLayoutEntry[], displays: DisplayLayoutEntry[]): void;
  onStopped?(): void;
  onRecorded?(node: string, sampleRate: number, audio: RecordedAudio): void;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private starting: Promise<void> | null = null;
  /** Whether CPU readings come from a high-resolution timer. */
  hiResTimer = false;
  private events: AudioEngineEvents;

  /** Current tempo in BPM; kept here so a freshly started engine gets it too. */
  private tempo = DEFAULT_TEMPO;
  /** Master level (linear); kept here for the same reason. */
  private masterLevel = 1;
  /** Master limiter on or off; kept here for the same reason. */
  private limiter = true;
  /** The loop; kept here for the same reason. */
  private loop: LoopSetting = { on: false, start: 0, end: 16 };

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

  /** The engine's output node, for diagnostics only (e.g. to route it elsewhere). */
  get output(): AudioNode | null {
    return this.node;
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
          case 'meterLayout':
            this.events.onMeterLayout?.(msg.layout, msg.displays);
            break;
          case 'stopped':
            this.events.onStopped?.();
            break;
          case 'recorded':
            this.events.onRecorded?.(msg.node, msg.sampleRate, msg.audio);
            break;
          case 'error':
            reject(new Error(msg.message));
            this.events.onStatus?.('error', msg.message);
            break;
        }
      };
    });
    node.onprocessorerror = () => this.events.onStatus?.('error', 'The audio engine crashed.');

    this.send({ type: 'init', faust: programs, tempo: this.tempo, masterLevel: this.masterLevel, limiter: this.limiter, loop: this.loop });
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

  setClips(node: string, clips: EngineClip[]): void {
    this.send({ type: 'clips', node, clips });
  }

  setAudioClips(node: string, clips: EngineAudioClip[]): void {
    this.send({ type: 'audioClips', node, clips });
  }

  /** Hand the engine a decoded sample (the arrays are moved to it). */
  sendSample(id: string, rate: number, channels: Float32Array[]): void {
    this.node?.port.postMessage({ type: 'sample', id, rate, channels } satisfies ToEngine, channels.map((c) => c.buffer));
  }

  dropSamples(ids: string[]): void {
    this.send({ type: 'dropSamples', ids });
  }

  setAutomation(lanes: EngineLane[]): void {
    this.send({ type: 'automation', lanes });
  }

  setTempo(bpm: number): void {
    this.tempo = bpm;
    this.send({ type: 'tempo', bpm });
  }

  /** Switch a mixer channel (sink) on or off: it fades, then stops using CPU. */
  setSinkActive(node: string, active: boolean): void {
    this.send({ type: 'sinkActive', node, active });
  }

  setMasterLevel(level: number): void {
    this.masterLevel = level;
    this.send({ type: 'master', level });
  }

  setLimiter(on: boolean): void {
    this.limiter = on;
    this.send({ type: 'limiter', on });
  }

  /** Start (from a position in beats) or stop rendering, with a short fade to avoid clicks. */
  setRunning(running: boolean, from = 0): void {
    this.send({ type: 'run', running, from });
  }

  /** Move the position while playing. */
  locate(beat: number): void {
    this.send({ type: 'locate', beat });
  }

  setLoop(loop: LoopSetting): void {
    this.loop = { ...loop };
    this.send({ type: 'loop', ...this.loop });
  }
}
