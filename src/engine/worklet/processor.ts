/**
 * AudioWorklet entry point: hosts one Engine for the whole patch.
 * Bundled separately by Vite (imported with `?worker&url`) and loaded via audioWorklet.addModule.
 */
import { Engine, type MasterMeters } from '../core/Engine';
import type { ModuleFactory, RecordedAudio } from '../core/types';
import { FaustDsp, declaredSink } from '../faust/FaustDsp';
import { FaustSink } from '../faust/FaustSink';
import { Master } from '../modules/Master';
import { NATIVE_MODULES } from '../modules/native';
import { PROCESSOR_NAME, type EngineStats, type FromEngine, type ToEngine } from '../protocol';

/** Fade applied when starting/stopping playback, to avoid clicks. */
const FADE_SECONDS = 0.01;
/** How often stats are posted to the UI. */
const STATS_INTERVAL_SECONDS = 0.05;

// performance.now() is not available in every AudioWorkletGlobalScope (Chromium lacks it).
// Date.now() only ticks per millisecond, but summed over many blocks it is an unbiased estimate,
// so the CPU figure is smoothed over roughly a second (less with a high-resolution timer).
const HIRES_TIMER = typeof performance !== 'undefined' && typeof performance.now === 'function';
const now: () => number = HIRES_TIMER ? () => performance.now() : () => Date.now();
const CPU_SMOOTHING = HIRES_TIMER ? 0.3 : 0.05;

class SonularProcessor extends AudioWorkletProcessor {
  private engine: Engine | null = null;
  private running = false;
  private gain = 0;
  private readonly fadeStep = 1 / Math.max(1, FADE_SECONDS * sampleRate);
  private busyMs = 0;
  private cpu = 0;
  private renderedFrames = 0;
  private readonly statsFrames = Math.round(STATS_INTERVAL_SECONDS * sampleRate);
  // Reused every time stats are sent, to avoid creating garbage on the audio thread.
  private readonly meters: MasterMeters = { peakL: 0, peakR: 0, clipped: false, faulted: false };
  private readonly stats: EngineStats = {
    cpu: 0,
    peakL: 0,
    peakR: 0,
    clipped: false,
    faulted: false,
    processed: 0,
    sleeping: 0,
    unreachable: 0,
    beat: 0,
    meters: new Float32Array(0),
    displays: new Float32Array(0),
  };
  private readonly statsMessage: FromEngine = { type: 'stats', stats: this.stats };

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<ToEngine>) => {
      try {
        this.handle(e.data);
      } catch (err) {
        this.post({ type: 'error', message: (err as Error).message });
      }
    };
  }

  private post(msg: FromEngine) {
    this.port.postMessage(msg);
  }

  // Moves (not copies) the recorded audio to the main thread.
  private readonly sendRecording = (node: string, audio: RecordedAudio) => {
    const msg: FromEngine = { type: 'recorded', node, sampleRate, audio };
    this.port.postMessage(msg, [audio.left.buffer, audio.right.buffer]);
  };

  private handle(msg: ToEngine) {
    switch (msg.type) {
      case 'init': {
        const factories: Record<string, ModuleFactory> = {
          master: () => new Master(),
          ...NATIVE_MODULES,
        };
        for (const prog of msg.faust) {
          const sink = declaredSink(prog.meta);
          factories[`faust:${prog.name}`] = (sr) => {
            const dsp = new FaustDsp(prog.module, prog.meta, sr);
            return sink ? new FaustSink(dsp) : dsp;
          };
        }
        this.engine = new Engine(sampleRate, factories);
        this.engine.setTempo(msg.tempo);
        this.engine.setMasterLevel(msg.masterLevel);
        this.post({ type: 'ready', sampleRate, hiResTimer: HIRES_TIMER });
        break;
      }
      case 'patch': {
        const engine = this.engine;
        if (!engine) break;
        engine.setPatch(msg.patch);
        if (engine.meterValueCount !== this.stats.meters.length) {
          this.stats.meters = new Float32Array(engine.meterValueCount);
        }
        if (engine.displayValueCount !== this.stats.displays.length) {
          this.stats.displays = new Float32Array(engine.displayValueCount);
        }
        this.post({ type: 'meterLayout', layout: [...engine.meterLayout], displays: [...engine.displayLayout] });
        break;
      }
      case 'param':
        this.engine?.setParam(msg.node, msg.name, msg.value);
        break;
      case 'tempo':
        this.engine?.setTempo(msg.bpm);
        break;
      case 'sinkActive':
        this.engine?.setSinkActive(msg.node, msg.active);
        break;
      case 'master':
        this.engine?.setMasterLevel(msg.level);
        break;
      case 'run':
        // Starting from silence (not while a stop is still fading out): begin at the top.
        if (msg.running && !this.running && this.gain === 0) this.engine?.restart();
        this.running = msg.running;
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const engine = this.engine;
    if (!out || !out[0] || !engine) return true;
    const L = out[0];
    const R = out[1] ?? L;
    const frames = L.length;

    // Idle: fully silent and faded out. Outputs are already zero-filled by the browser.
    if (!this.running && this.gain === 0) {
      this.tickStats(engine, frames, 0);
      return true;
    }

    const t0 = now();
    engine.render(L, R, frames);

    const target = this.running ? 1 : 0;
    if (this.gain !== target || target !== 1) {
      for (let i = 0; i < frames; i++) {
        if (this.gain < target) this.gain = Math.min(target, this.gain + this.fadeStep);
        else if (this.gain > target) this.gain = Math.max(target, this.gain - this.fadeStep);
        L[i]! *= this.gain;
        if (R !== L) R[i]! *= this.gain;
      }
      if (!this.running && this.gain === 0) this.post({ type: 'stopped' });
    }
    this.tickStats(engine, frames, now() - t0);
    return true;
  }

  private tickStats(engine: Engine, frames: number, busyMs: number) {
    this.busyMs += busyMs;
    this.renderedFrames += frames;
    if (this.renderedFrames < this.statsFrames) return;
    const budgetMs = (this.renderedFrames / sampleRate) * 1000;
    const meters = engine.takeMeters(this.meters);
    this.cpu += (this.busyMs / budgetMs - this.cpu) * CPU_SMOOTHING;
    const st = this.stats;
    st.cpu = this.cpu;
    st.peakL = meters.peakL;
    st.peakR = meters.peakR;
    st.clipped = meters.clipped;
    st.faulted = meters.faulted;
    st.processed = engine.stats.processed;
    st.sleeping = engine.stats.sleeping;
    st.unreachable = engine.stats.unreachable;
    st.beat = engine.transport.beat;
    engine.readMeters(st.meters);
    engine.readDisplays(st.displays);
    this.post(this.statsMessage);
    engine.collectRecordings(this.sendRecording);
    this.busyMs = 0;
    this.renderedFrames = 0;
  }
}

registerProcessor(PROCESSOR_NAME, SonularProcessor);
