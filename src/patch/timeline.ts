/**
 * Timeline data operations: sequencer blocks (clips), automation lanes and the song settings.
 * Plain functions that mutate in place, like ./operations. Times are in beats (4 beats = 1 bar).
 */
import type { ModuleDefinition } from '../modules/types';
import type { AutomationLane, AutomationPoint, Clip, Patch, Timeline } from './types';

export const BEATS_PER_BAR = 4;
/** Longest song: 999 bars. */
export const MAX_BEATS = 999 * BEATS_PER_BAR;
/** Shortest block: one sixteenth note. */
export const MIN_CLIP_LENGTH = 0.25;

/** A new project's song: 16 bars long, loop off (over the first 4 bars when switched on). */
export function emptyTimeline(): Timeline {
  return { end: 16 * BEATS_PER_BAR, loop: { on: false, start: 0, end: 4 * BEATS_PER_BAR } };
}

/** Whether a module type gets a row of blocks on the timeline. */
export const hasPattern = (def: ModuleDefinition | undefined): boolean => !!def?.patternParams?.length;

/** Block ids b1, b2, ...: one past the highest in use, so a deleted block's id is never reused. */
export function nextClipId(patch: Pick<Patch, 'clips'>): string {
  let max = 0;
  for (const c of patch.clips) {
    const n = /^b(\d+)$/.exec(c.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `b${max + 1}`;
}

/** The blocks on one module's row, sorted by start. */
export function clipsOf(patch: Pick<Patch, 'clips'>, module: string): Clip[] {
  return patch.clips.filter((c) => c.module === module).sort((a, b) => a.start - b.start);
}

/** Whether a block from `start` for `length` beats would overlap another block on that row. */
export function overlaps(patch: Pick<Patch, 'clips'>, module: string, start: number, length: number, ignore?: string) {
  return patch.clips.some(
    (c) => c.module === module && c.id !== ignore && start < c.start + c.length && c.start < start + length,
  );
}

/**
 * Add a block to a sequencer's row holding `params` as its pattern. Returns it, or null when the
 * place is taken, out of range, or the module has no pattern.
 */
export function addClip(
  patch: Patch,
  def: ModuleDefinition,
  module: string,
  start: number,
  length: number,
  params: Record<string, number>,
): Clip | null {
  if (!hasPattern(def) || !patch.modules.some((m) => m.id === module)) return null;
  if (!(start >= 0) || !(length >= MIN_CLIP_LENGTH) || start + length > MAX_BEATS) return null;
  if (overlaps(patch, module, start, length)) return null;
  const pattern = Object.fromEntries(def.patternParams!.map((id) => [id, params[id] ?? 0]));
  const clip: Clip = { id: nextClipId(patch), module, start, length, params: pattern };
  patch.clips.push(clip);
  return clip;
}

export function removeClip(patch: Patch, id: string): void {
  const i = patch.clips.findIndex((c) => c.id === id);
  if (i >= 0) patch.clips.splice(i, 1);
}

/** The automation lane of one control, if it has one. */
export function laneOf(patch: Pick<Patch, 'lanes'>, module: string, param: string): AutomationLane | undefined {
  return patch.lanes.find((l) => l.module === module && l.param === param);
}

/** The lane of a control, created (without points) when it has none yet. */
export function ensureLane(patch: Patch, module: string, param: string): AutomationLane {
  const existing = laneOf(patch, module, param);
  if (existing) return existing;
  const lane: AutomationLane = { module, param, points: [] };
  patch.lanes.push(lane);
  return lane;
}

export function removeLane(patch: Patch, module: string, param: string): void {
  const i = patch.lanes.findIndex((l) => l.module === module && l.param === param);
  if (i >= 0) patch.lanes.splice(i, 1);
}

/**
 * Value of a lane at a time: straight lines between points, the first point's value before it and
 * the last point's after it. Points must be sorted by time. Undefined for a lane without points.
 */
export function valueAt(points: readonly AutomationPoint[], time: number): number | undefined {
  const n = points.length;
  if (n === 0) return undefined;
  if (time <= points[0]!.time) return points[0]!.value;
  if (time >= points[n - 1]!.time) return points[n - 1]!.value;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.time <= time) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi]!;
  return b.time === a.time ? b.value : a.value + ((b.value - a.value) * (time - a.time)) / (b.time - a.time);
}

/** Forget the blocks and lanes of a module that is being removed. */
export function removeModuleTimeline(patch: Patch, module: string): void {
  patch.clips = patch.clips.filter((c) => c.module !== module);
  patch.lanes = patch.lanes.filter((l) => l.module !== module);
}
