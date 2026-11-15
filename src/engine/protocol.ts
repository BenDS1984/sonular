/** Messages between the main thread and the engine running in the AudioWorklet. */
import type { EnginePatch } from './core/types';
import type { FaustMeta } from './faust/FaustDsp';

export const PROCESSOR_NAME = 'modulab-engine';

export interface FaustProgram {
  name: string;
  module: WebAssembly.Module;
  meta: FaustMeta;
}

export type ToEngine =
  | { type: 'init'; faust: FaustProgram[] }
  | { type: 'patch'; patch: EnginePatch }
  | { type: 'param'; node: string; name: string; value: number }
  | { type: 'run'; running: boolean };

export interface EngineStats {
  /** Share of the real-time budget spent rendering (0..1+). */
  cpu: number;
  peakL: number;
  peakR: number;
  clipped: boolean;
  faulted: boolean;
  processed: number;
  sleeping: number;
  unreachable: number;
}

export type FromEngine =
  /** `hiResTimer`: whether the worklet has performance.now() (CPU readings are coarse without it). */
  | { type: 'ready'; sampleRate: number; hiResTimer: boolean }
  | { type: 'stats'; stats: EngineStats }
  /** Sent once the fade-out after `run: false` has finished. */
  | { type: 'stopped' }
  | { type: 'error'; message: string };
