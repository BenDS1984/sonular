/** Messages between the main thread and the engine running in the AudioWorklet. */
import type { DisplayLayoutEntry, EnginePatch, MeterLayoutEntry } from './core/types';
import type { FaustMeta } from './faust/FaustDsp';

export const PROCESSOR_NAME = 'sonular-engine';

export interface FaustProgram {
  name: string;
  module: WebAssembly.Module;
  meta: FaustMeta;
}

export type ToEngine =
  | { type: 'init'; faust: FaustProgram[]; tempo: number }
  | { type: 'patch'; patch: EnginePatch }
  | { type: 'param'; node: string; name: string; value: number }
  | { type: 'tempo'; bpm: number }
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
  /** Transport position in beats since Play was pressed. */
  beat: number;
  /** Module meter values, ordered as in the latest `meterLayout` message. */
  meters: Float32Array;
  /** Module display values (scope traces), ordered as in the latest `meterLayout` message. */
  displays: Float32Array;
}

export type FromEngine =
  /** `hiResTimer`: whether the worklet has performance.now() (CPU readings are coarse without it). */
  | { type: 'ready'; sampleRate: number; hiResTimer: boolean }
  | { type: 'stats'; stats: EngineStats }
  /** Sent after every patch change: which meters and displays `stats` contains. */
  | { type: 'meterLayout'; layout: MeterLayoutEntry[]; displays: DisplayLayoutEntry[] }
  /** Sent once the fade-out after `run: false` has finished. */
  | { type: 'stopped' }
  | { type: 'error'; message: string };
