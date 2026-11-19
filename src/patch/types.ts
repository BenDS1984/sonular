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
  /** Timeline blocks of this patch's sequencers (its timeline track). */
  clips: Clip[];
  /** Automation lines of this patch's controls (shown under its timeline track). */
  lanes: AutomationLane[];
}

// ---------- Timeline ----------
// Times on the timeline are in beats (quarter notes) from the start of the song; 4 beats = 1 bar.

/**
 * A block on a sequencer's row: while the song is inside it, the sequencer plays the block's own
 * pattern, starting at its first step. Blocks on one row never overlap.
 */
export interface Clip {
  /** Unique within its patch ("b1", "b2", ...), never reused there. */
  id: string;
  /** The sequencer module whose row the block is on. */
  module: string;
  start: number;
  length: number;
  /** The block's pattern: values of the module's pattern parameters (`patternParams`). */
  params: Record<string, number>;
}

export interface AutomationPoint {
  /** In beats. */
  time: number;
  /** In the parameter's own range and units. */
  value: number;
}

/** The movement of one control over time: straight lines between points, sorted by time. */
export interface AutomationLane {
  module: string;
  param: string;
  points: AutomationPoint[];
}

/** Song-wide timeline settings. */
export interface Timeline {
  /** End of the song, in beats. */
  end: number;
  /** The loop: when on, playback jumps from `end` back to `start`. */
  loop: { on: boolean; start: number; end: number };
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
  timeline: Timeline;
}
