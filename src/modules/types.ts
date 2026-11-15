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
export type ParamFormat = 'plain' | 'gain-db' | 'semitones' | 'cents' | 'pan' | 'hz' | 'percent' | 'toggle' | 'choice';

export interface ParamSpec {
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
  type: string;
  title: string;
  category: 'Sources' | 'Shaping' | 'Modulation' | 'Mixing' | 'Output' | 'Utilities';
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
   * Engine module kind that does the DSP, e.g. "faust:osc" for src/dsp/osc.dsp. Port order in
   * `inputs`/`outputs` is the engine's channel order; parameter ids are the engine's names.
   */
  engine: string;
}
