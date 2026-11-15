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

export interface Patch {
  modules: ModuleInstance[];
  cables: Cable[];
  view: ViewState;
}
