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
export const hasBanks = (def: ModuleDefinition | undefined): boolean => (def?.banks ?? 0) > 0;

/**
 * Name of a module with a timeline row, with its number: "Sequencer 2". The number comes from the
 * module id (sequencer2), so it stays the same when other sequencers are added or removed.
 */
export function numberedTitle(def: ModuleDefinition | undefined, module: { id: string; type: string }): string {
  const title = def?.title ?? module.type;
  const n = /(\d+)$/.exec(module.id);
  return n ? `${title} ${n[1]}` : title;
}

/** What a module with a timeline row is called: the user's name, else "Sequencer 2". */
export function moduleLabel(def: ModuleDefinition | undefined, module: { id: string; type: string; name?: string }): string {
  return module.name || numberedTitle(def, module);
}

/** Tooltip for a module with its own name: "Kick (Sequencer 3)". */
export function moduleTooltip(def: ModuleDefinition | undefined, module: { id: string; type: string; name?: string }): string {
  const numbered = numberedTitle(def, module);
  return module.name ? `${module.name} (${numbered})` : numbered;
}

/** Give a module its own name; an empty name goes back to the numbered one. */
export function renameModule(module: { name?: string }, name: string): void {
  const n = name.trim().slice(0, 40);
  if (n) module.name = n;
  else delete module.name;
}

/** A bank number brought into a module's range (whole, 0..banks-1). */
export function clampBank(def: ModuleDefinition | undefined, bank: number): number {
  const last = (def?.banks ?? 1) - 1;
  return Number.isFinite(bank) ? Math.min(last, Math.max(0, Math.round(bank))) : 0;
}

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
 * Add a block to a sequencer's row that plays `bank`. Returns it, or null when the place is taken,
 * out of range, or the module has no banks.
 */
export function addClip(
  patch: Patch,
  def: ModuleDefinition,
  module: string,
  start: number,
  length: number,
  bank: number,
): Clip | null {
  if (!hasBanks(def) || !patch.modules.some((m) => m.id === module)) return null;
  if (!(start >= 0) || !(length >= MIN_CLIP_LENGTH) || start + length > MAX_BEATS) return null;
  if (overlaps(patch, module, start, length)) return null;
  const clip: Clip = { id: nextClipId(patch), module, start, length, bank: clampBank(def, bank) };
  patch.clips.push(clip);
  return clip;
}

/**
 * The free space on a row around a block (or around a position, for a new block): from the end
 * of the block before it to the start of the block after it. A block being moved or resized
 * stays inside this range, so it never jumps over or into its neighbours.
 */
export function freeRange(patch: Pick<Patch, 'clips'>, module: string, at: number, ignore?: string) {
  let lo = 0;
  let hi = MAX_BEATS;
  for (const c of patch.clips) {
    if (c.module !== module || c.id === ignore) continue;
    const end = c.start + c.length;
    if (end <= at) lo = Math.max(lo, end);
    else if (c.start >= at) hi = Math.min(hi, c.start);
  }
  return { lo, hi };
}

/**
 * Copy a block to the first free place after it on the same row. Returns the copy, or null
 * when there is no room before the end of the timeline.
 */
export function duplicateClip(patch: Patch, id: string): Clip | null {
  const clip = patch.clips.find((c) => c.id === id);
  if (!clip) return null;
  let start = clip.start + clip.length;
  for (const c of clipsOf(patch, clip.module)) {
    if (c.start + c.length <= start) continue;
    if (c.start >= start + clip.length) break;
    start = c.start + c.length; // taken: try right after this one
  }
  if (start + clip.length > MAX_BEATS) return null;
  const copy: Clip = { id: nextClipId(patch), module: clip.module, start, length: clip.length, bank: clip.bank };
  patch.clips.push(copy);
  return copy;
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
