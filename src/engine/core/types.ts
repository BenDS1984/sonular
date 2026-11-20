/**
 * Core contracts of the audio engine.
 *
 * Everything in engine/core is plain TypeScript with no browser APIs, so it runs inside the
 * AudioWorklet, in offline rendering and in Node-based tests alike.
 */

import type { Transport } from './Transport';

/** Frames processed per engine block (the Web Audio render quantum). */
export const BLOCK_SIZE = 128;

/**
 * A unit of DSP inside the engine. Every module type (Faust-based or hand-written) implements
 * this one interface; the engine never needs to know what a module does.
 *
 * Buffers are mono Float32Arrays of BLOCK_SIZE. Modules must not keep references to input
 * buffers between calls and must not allocate memory in `process`.
 */
export interface DspModule {
  readonly numInputs: number;
  readonly numOutputs: number;
  /**
   * How long (in seconds) the module can keep producing sound after its inputs went silent:
   * 0 for stateless processors, the decay time for delays/reverbs, Infinity for generators.
   * The engine puts the module to sleep once its inputs have been silent for longer than this.
   * Modules without inputs (sources) are never put to sleep, whatever this value says.
   */
  readonly tailSeconds: number;
  /** Set a parameter by name. Unknown names are ignored. Smoothing is the module's job. */
  setParam(name: string, value: number): void;
  /**
   * Render one block. `inputs[i]` is always a valid buffer (a shared silent buffer when the
   * input is not connected); `inputSilent[i]` tells whether it is known to be all zeros.
   */
  process(
    inputs: readonly Float32Array[],
    inputSilent: readonly boolean[],
    outputs: readonly Float32Array[],
    frames: number,
  ): void;
  /**
   * Called whenever cables change, with one flag per input telling whether anything is plugged
   * in. Lets modules behave differently for unconnected inputs (e.g. mono-to-stereo).
   */
  onConnectionsChanged?(inputsConnected: readonly boolean[]): void;
  /** Names of the level meters this module exposes (e.g. "meterL"), if any. */
  readonly meterNames?: readonly string[];
  /** Write the current meter values into `out`, starting at `offset`, in `meterNames` order. */
  readMeters?(out: Float32Array, offset: number): void;
  /**
   * Set for modules that only watch signals (scopes). They are processed even when no cable
   * leads from them to an output, and so are the modules feeding them.
   */
  readonly isObserver?: boolean;
  /**
   * Set for modules that count time (clock, sequencer). They keep running while the sink they
   * feed is silent, so a muted patch is still in step with the others when it comes back.
   */
  readonly keepsTime?: boolean;
  /** Number of display values (e.g. a scope trace) this module exposes, if any. */
  readonly displayLength?: number;
  /** Write the current display values into `out`, starting at `offset`. No allocation. */
  readDisplay?(out: Float32Array, offset: number): void;
  /**
   * Recorders: hand over the audio recorded since the previous call, or null when there is
   * none. Called about 20 times per second; the arrays are moved to the main thread.
   */
  takeRecorded?(): RecordedAudio | null;
  /**
   * Modules with a pattern (sequencers): the timeline blocks to play, replacing earlier ones.
   * Called from the message handler, so it may allocate.
   */
  setClips?(clips: readonly EngineClip[]): void;
  /** Clear internal state (delay lines, filter memory, phases). */
  reset(): void;
  /** Release resources when removed from the patch. */
  dispose?(): void;
}

/** A module that delivers audio to the device. The engine sums all sinks into the master bus. */
export interface SinkModule extends DspModule {
  readonly isSink: true;
  /** Left/right result of the most recent `process` call. */
  readonly outL: Float32Array;
  readonly outR: Float32Array;
}

export function isSink(m: DspModule): m is SinkModule {
  return (m as Partial<SinkModule>).isSink === true;
}

/**
 * Creates a module instance of one kind for a given sample rate. Modules that follow the tempo
 * keep the transport and read its position while rendering.
 */
export type ModuleFactory = (sampleRate: number, transport: Transport) => DspModule;

/** Serializable description of the audio graph sent to the engine. */
/** A timeline block for the engine: from `start` up to (not including) `end`, in beats. */
export interface EngineClip {
  start: number;
  end: number;
  /** Which bank plays, 0-based. */
  bank: number;
}

export interface PatchNode {
  id: string;
  kind: string;
  params?: Record<string, number>;
  /** Modules with banks: their timeline blocks (none: they play the bank chosen on the module). */
  clips?: EngineClip[];
  /**
   * Sinks only: whether it is heard (default true). A silent sink fades out and then everything
   * that only feeds it stops rendering (a muted or un-soloed mixer channel).
   */
  active?: boolean;
}

export interface PatchEndpoint {
  node: string;
  port: number;
}

export interface PatchConnection {
  from: PatchEndpoint;
  to: PatchEndpoint;
}

export interface EnginePatch {
  nodes: PatchNode[];
  connections: PatchConnection[];
}

/** Counters describing the most recent block. */
export interface EngineBlockStats {
  /** Nodes that rendered audio. */
  processed: number;
  /** Nodes skipped because they were asleep. */
  sleeping: number;
  /** Nodes skipped because they don't reach any output. */
  unreachable: number;
}

/** Which meters the engine reports, in the order their values appear in a meter snapshot. */
export interface MeterLayoutEntry {
  node: string;
  names: readonly string[];
}

/** A piece of a recording, handed from a recorder module to the main thread. */
export interface RecordedAudio {
  /** Number of the take (recording run) this audio belongs to. */
  take: number;
  left: Float32Array;
  right: Float32Array;
}

/** Which displays the engine reports: each node's values follow the previous node's. */
export interface DisplayLayoutEntry {
  node: string;
  length: number;
}
