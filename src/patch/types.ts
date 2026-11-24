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
  /** The user's own name for the module (sequencers: shown on the module and its timeline row). */
  name?: string;
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
  /**
   * Heights in pixels of automation lanes on the timeline that are not the standard height, by
   * "<module id>:<param>". Saved with the view: not part of undo.
   */
  laneHeights?: Record<string, number>;
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
  /**
   * Free: the patch ignores the timeline. Its sequencers play the pattern chosen on the module, as
   * if they had no blocks (the blocks stay, and count again when Free is switched off).
   */
  free?: boolean;
}

// ---------- Timeline ----------
// Times on the timeline are in beats (quarter notes) from the start of the song; 4 beats = 1 bar.

/**
 * A block on a sequencer's row: while the song is inside it, the sequencer plays one of its banks,
 * starting at its first step. Blocks on one row never overlap.
 */
export interface Clip {
  /** Unique within its patch ("b1", "b2", ...), never reused there. */
  id: string;
  /** The sequencer module whose row the block is on. */
  module: string;
  start: number;
  length: number;
  /** Which of the module's banks plays, 0-based (shown as Bank 1..8). */
  bank: number;
}

export interface AutomationPoint {
  /** In beats. */
  time: number;
  /** In the parameter's own range and units. */
  value: number;
  /**
   * Bend of the line from this point to the next (-1..1): positive starts fast, negative starts
   * slow. Left out (or 0) for a straight line.
   */
  curve?: number;
}

/** The movement of one control over time: lines (straight or bent) between points, sorted by time. */
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

// ---------- Audio tracks ----------

/**
 * A piece of a sample on an audio track: plays the sample from `offset` seconds in, from beat
 * `start` for `length` beats. Clips on one track never overlap.
 */
export interface AudioClip {
  /** Unique within its track ("c1", "c2", ...), never reused there. */
  id: string;
  /** Id of the sample in the sample library on this computer. */
  sample: string;
  /** The sample's name when it was placed (shown when the sample is not in the library). */
  name: string;
  start: number;
  length: number;
  /**
   * Where in the sample the clip starts, in seconds. For a reversed clip this, and `loop`, count
   * from the end of the sample (as if the sample itself were reversed).
   */
  offset: number;
  /** Plays the sample backwards. */
  reverse?: true;
  /**
   * Repeats a part of the sample (seconds, from `start` up to `end`) for as long as the clip lasts:
   * the clip plays from `offset` on and goes round to `start` whenever it reaches `end`.
   */
  loop?: { start: number; end: number };
  /**
   * Fade in and fade out, in beats (straight lines; none when left out). They may be longer than a
   * shortened clip has room for: `audioFades` gives the part that applies.
   */
  fadeIn?: number;
  fadeOut?: number;
  /** How each fade is bent: its level halfway through (0.5 = straight, when left out). */
  fadeInBend?: number;
  fadeOutBend?: number;
  /** The clip's own volume, as a factor (0 = silent, up to +12 dB); 1 (0 dB) when left out. */
  gain?: number;
}

/** A timeline track that plays samples, with its own channel in the mixer. */
export interface AudioTrack {
  /** Stable id within the project ("a1", "a2", ...), never reused there. */
  id: string;
  name: string;
  /** Index into the channel colour palette. */
  color: number;
  /** Channel level (linear gain, 1 = 0 dB, up to 2 = +6 dB). */
  level: number;
  /** Balance, -1 (left) to 1 (right), like the patch channels. */
  pan: number;
  /** Send levels (0..1). They feed the effect channels once those exist; they do nothing yet. */
  send1: number;
  send2: number;
  mute: boolean;
  solo: boolean;
  /** Height of the track on the timeline in pixels, when the user made it taller than the standard. */
  height?: number;
  clips: AudioClip[];
}

export interface Project {
  /** Shown in the top bar and used as the file name. */
  name: string;
  /** Tempo of the master clock in BPM, shared by all patches. */
  tempo: number;
  /** Master channel level (linear gain, 1 = 0 dB, up to 2 = +6 dB). */
  masterLevel: number;
  /** Whether the master limiter keeps the master under full scale (on unless switched off). */
  masterLimiter: boolean;
  /** Always at least one. */
  patches: Patch[];
  /** Id of the patch shown in the workspace. */
  activePatch: string;
  timeline: Timeline;
  /** Timeline tracks that play samples, listed after the patch tracks. */
  audioTracks: AudioTrack[];
}
