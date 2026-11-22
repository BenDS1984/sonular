/** Messages between the main thread and the engine running in the AudioWorklet. */
import type { DisplayLayoutEntry, EngineAudioClip, EngineClip, EnginePatch, MeterLayoutEntry, RecordedAudio } from './core/types';
import type { EngineLane } from './core/automation';
import type { FaustMeta } from './faust/FaustDsp';

export const PROCESSOR_NAME = 'sonular-engine';

export interface FaustProgram {
  name: string;
  module: WebAssembly.Module;
  meta: FaustMeta;
}

export type ToEngine =
  | { type: 'init'; faust: FaustProgram[]; tempo: number; masterLevel: number; loop: LoopSetting }
  | { type: 'patch'; patch: EnginePatch }
  | { type: 'param'; node: string; name: string; value: number }
  /** A sequencer's timeline blocks changed. */
  | { type: 'clips'; node: string; clips: EngineClip[] }
  /** An audio track's sample clips changed. */
  | { type: 'audioClips'; node: string; clips: EngineAudioClip[] }
  /** A decoded sample for the audio tracks (channels are moved, not copied). */
  | { type: 'sample'; id: string; rate: number; channels: Float32Array[] }
  /** Samples no longer used. */
  | { type: 'dropSamples'; ids: string[] }
  /** Every automation lane of the project (replaces the previous ones). */
  | { type: 'automation'; lanes: EngineLane[] }
  | { type: 'tempo'; bpm: number }
  /** A mixer channel is heard or not (mute/solo). */
  | { type: 'sinkActive'; node: string; active: boolean }
  /** Master level, linear gain. */
  | { type: 'master'; level: number }
  /** Start (from `from`, in beats) or stop. */
  | { type: 'run'; running: boolean; from: number }
  /** The playhead moved while playing. */
  | { type: 'locate'; beat: number }
  | ({ type: 'loop' } & LoopSetting);

export interface LoopSetting {
  on: boolean;
  start: number;
  end: number;
}

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
  /** Transport position in beats from the start of the song. */
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
  /** Audio recorded by a recorder module since the previous message. */
  | { type: 'recorded'; node: string; sampleRate: number; audio: RecordedAudio }
  /** Sent once the fade-out after `run: false` has finished. */
  | { type: 'stopped' }
  | { type: 'error'; message: string };
