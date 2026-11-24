/**
 * The patch: the user's document. Plain, serializable data (saved to disk in step 6).
 */

export interface ModuleInstance {
  id: string;
  type: string;
  /** Position of the top-left corner on the canvas, in canvas pixels. */
  x: number;
  y: number;
  /** Parameter values by parameter id. All numeric, so they map 1:1 onto the engine. */
  params: Record<string, number>;
  /** The user's own name for the module (shown instead of "Oscillator 2"). */
  name?: string;
}

export interface PortRef {
  module: string;
  port: string;
}

export interface Cable {
  id: string;
  /** Always an output port. */
  from: PortRef;
  /** Always an input port. */
  to: PortRef;
}

export interface ViewState {
  /** Screen offset of the canvas origin, in screen pixels. */
  x: number;
  y: number;
  zoom: number;
}

/**
 * Modules the user grouped on the canvas, like a mini patch. Only a view on the patch: the sound is
 * exactly the same. A collapsed group shows as one small bar and hides its modules.
 */
export interface ModuleGroup {
  id: string;
  name: string;
  /** Two or more modules; a module is in at most one group. */
  moduleIds: string[];
  collapsed: boolean;
}

export interface Patch {
  /** Shown in the top bar and used as the file name. */
  name: string;
  /** Tempo of the master clock in BPM. */
  tempo: number;
  /** The master limiter: on unless this says false (and then not stored when on). */
  limiter?: boolean;
  modules: ModuleInstance[];
  cables: Cable[];
  /** Left out when there are none. */
  groups?: ModuleGroup[];
  view: ViewState;
}
