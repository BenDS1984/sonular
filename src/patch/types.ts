/**
 * The project: the user's document. Plain, serializable data (saved as a .sonular file).
 *
 * A project holds one or more patches. Each patch is a canvas of modules and cables and will
 * become one mixer channel (and later one timeline track). Every control is addressable as
 * patch id → module id → parameter id; those ids never change once created, so mixer channels,
 * timeline tracks and automation can refer to them safely.
 */

export interface ModuleInstance {
  /** Unique within its patch, never reused there. */
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
  /** Stable id within the project ("p1", "p2", ...), never reused there. */
  id: string;
  /** The user's name for the patch: shown on its tab, its mixer strip and its mixer channel. */
  name: string;
  /** Index into the channel colour palette. */
  color: number;
  modules: ModuleInstance[];
  cables: Cable[];
  /** Where this patch's canvas was scrolled and zoomed to. */
  view: ViewState;
}

export interface Project {
  /** Shown in the top bar and used as the file name. */
  name: string;
  /** Tempo of the master clock in BPM, shared by all patches. */
  tempo: number;
  /** Master channel level (linear gain, 1 = 0 dB, up to 2 = +6 dB). */
  masterLevel: number;
  /** Always at least one. */
  patches: Patch[];
  /** Id of the patch shown in the workspace. */
  activePatch: string;
}
