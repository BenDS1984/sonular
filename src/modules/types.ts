/**
 * Module definitions: everything the app needs to know about a module type — its ports,
 * parameters, look and (later) its DSP. One definition per module type; instances live in the patch.
 */
import type { Component } from 'svelte';
import type { SignalType } from '../ui/signals';
import type { Scale } from '../ui/scale';
import type { ModuleInstance } from '../patch/types';

export interface PortSpec {
  id: string;
  label: string;
  signal: SignalType;
}

/** How a parameter value is shown to the user. */
export type ParamFormat =
  | 'plain'
  | 'gain-db'
  | 'semitones'
  | 'cents'
  | 'pan'
  | 'hz'
  | 'percent'
  | 'seconds'
  /** Seconds, but the maximum reads "Off" (a time that can be switched off). */
  | 'seconds-off'
  | 'ms'
  /** Semitones from middle C shown as a note name ("C4", "F#3"). */
  | 'note'
  /** A multiplication factor, e.g. "×2.0". */
  | 'times'
  /** A shift in octaves, e.g. "+1.5 oct". */
  | 'octaves'
  /** An angle in degrees, e.g. "90°". */
  | 'degrees'
  | 'toggle'
  | 'choice';

export interface ParamSpec {
  /** Fixed internal id (also the engine's parameter name). Never rename it. */
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** Snap increment; 0 = continuous. */
  step?: number;
  scale?: Scale;
  /** Knob arc grows from the centre (pan, detune, ...). */
  bipolar?: boolean;
  format?: ParamFormat;
  /** Labels for 'choice' parameters, indexed by value. */
  choices?: string[];
}

export interface ModulePanelProps {
  module: ModuleInstance;
  def: ModuleDefinition;
}

export interface ModuleDefinition {
  /** Fixed internal id, stored in patch files. Never rename it; display text goes in `title`. */
  type: string;
  /**
   * Version of the module's behaviour, starting at 1. Raise it when parameters, ports or the
   * sound change in a way that affects saved patches (see "Patch compatibility" in
   * docs/architecture.md).
   */
  version: number;
  title: string;
  category: 'Sources' | 'Sequencing' | 'Shaping' | 'Modulation' | 'Effects' | 'Mixing' | 'Output' | 'Utilities';
  description: string;
  /** Accent colour: the kind of signal the module mainly produces. */
  signal: SignalType;
  /** Panel width in pixels. */
  width: number;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
  /** Controls shown in the module body. */
  panel: Component<ModulePanelProps>;
  /**
   * Engine module kind that does the DSP: "faust:osc" for src/dsp/osc.dsp, or "native:clock" for
   * a module written in TypeScript (src/engine/modules/native.ts). Port order in
   * `inputs`/`outputs` is the engine's channel order; parameter ids are the engine's names.
   */
  engine: string;
}
