/**
 * Timeline data operations: sequencer blocks (clips), automation lanes and the song settings.
 * Plain functions that mutate in place, like ./operations. Times are in beats (4 beats = 1 bar).
 */
import type { ModuleDefinition, ParamSpec } from '../modules/types';
import { positionAt } from '../engine/core/automation';
import { fromNormalized, quantize, toNormalized } from '../ui/scale';
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

/**
 * What a module is called without a name of its own: "Sequencer 2" for modules with a timeline row
 * (they need the number there), else the plain title ("Oscillator").
 */
export function defaultTitle(def: ModuleDefinition | undefined, module: { id: string; type: string }): string {
  return hasBanks(def) ? numberedTitle(def, module) : (def?.title ?? module.type);
}

/** What a module is called: the user's name, else its default title. */
export function moduleLabel(def: ModuleDefinition | undefined, module: { id: string; type: string; name?: string }): string {
  return module.name || defaultTitle(def, module);
}

/** Tooltip for a module with its own name: "Kick (Sequencer 3)", "Bass (Oscillator)". */
export function moduleTooltip(def: ModuleDefinition | undefined, module: { id: string; type: string; name?: string }): string {
  const base = defaultTitle(def, module);
  return module.name ? `${module.name} (${base})` : base;
}

/** Give a module its own name; an empty name goes back to the default title. */
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
  patch.lanes.push({ module, param, points: [] });
  // The lane as stored (in the app a reactive copy), so later changes to it are seen.
  return patch.lanes[patch.lanes.length - 1]!;
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

/**
 * Whether a lane holds each point's value until the next instead of gliding: choices and switches
 * (a waveform, on/off), where nothing lies between two values. Knobs that turn in steps but stand
 * for a number (Tune in semitones) glide in automation; only their drawn points snap to the steps.
 */
export function holdsSteps(spec: ParamSpec): boolean {
  return (spec.step ?? 0) > 0 && (spec.format === 'choice' || spec.format === 'toggle' || !!spec.choices);
}

/**
 * Value of a control's lane at a time, exactly as the engine plays it: straight lines along the
 * knob's travel (so also even on logarithmic knobs), choices and switches holding each point.
 */
export function laneValueAt(spec: ParamSpec, points: readonly AutomationPoint[], time: number): number | undefined {
  if (points.length === 0) return undefined;
  const scale = spec.scale ?? 'linear';
  const hold = holdsSteps(spec);
  const times = points.map((p) => p.time);
  const positions = points.map((p) => toNormalized(p.value, spec.min, spec.max, scale));
  let i = 0;
  while (i < times.length - 2 && times[i + 1]! <= time) i++;
  const v = fromNormalized(positionAt(times, positions, time, i, hold), spec.min, spec.max, scale);
  return hold ? quantize(v, spec.step!, spec.min) : v;
}

/**
 * Start automating a control: its lane, with one point at the start holding the control's
 * current value (so nothing changes until more points are drawn). An existing lane is kept.
 */
export function addAutomation(patch: Patch, module: string, param: string, value: number): AutomationLane {
  const lane = ensureLane(patch, module, param);
  if (lane.points.length === 0) lane.points.push({ time: 0, value });
  return lane;
}

/** Add a point, keeping the points sorted by time; returns its index. */
export function addPoint(lane: AutomationLane, time: number, value: number): number {
  const t = Math.min(MAX_BEATS, Math.max(0, time));
  let i = 0;
  while (i < lane.points.length && lane.points[i]!.time <= t) i++;
  lane.points.splice(i, 0, { time: t, value });
  return i;
}

/** Move a point; it stays between its neighbours, so the order of points never changes. */
export function movePoint(lane: AutomationLane, index: number, time: number, value: number): void {
  const pt = lane.points[index];
  if (!pt) return;
  const lo = lane.points[index - 1]?.time ?? 0;
  const hi = lane.points[index + 1]?.time ?? MAX_BEATS;
  pt.time = Math.min(hi, Math.max(lo, time));
  pt.value = value;
}

export function removePoint(lane: AutomationLane, index: number): void {
  if (index >= 0 && index < lane.points.length) lane.points.splice(index, 1);
}

/** Forget the blocks and lanes of a module that is being removed. */
export function removeModuleTimeline(patch: Patch, module: string): void {
  patch.clips = patch.clips.filter((c) => c.module !== module);
  patch.lanes = patch.lanes.filter((l) => l.module !== module);
}

// ---------- Recording automation ----------

/**
 * Gap in beats between a recorded stretch and the old line around it: the old line runs on until
 * just before the recording starts and resumes just after it ends.
 */
export const RECORD_GUARD = 1 / 16;

/**
 * A recorded movement with only the points needed to draw it: points that lie within `tolerance`
 * (a share of the knob's travel) of the straight line between their neighbours are dropped.
 * Choices and switches keep only the points where the value changes. Samples must be sorted by time.
 */
export function thinPoints(spec: ParamSpec, samples: readonly AutomationPoint[], tolerance = 0.005): AutomationPoint[] {
  if (samples.length <= 2) return samples.map((p) => ({ ...p }));
  if (holdsSteps(spec)) {
    const kept = [samples[0]!];
    for (let i = 1; i < samples.length; i++) {
      if (samples[i]!.value !== kept[kept.length - 1]!.value) kept.push(samples[i]!);
    }
    const last = samples[samples.length - 1]!;
    if (kept[kept.length - 1] !== last) kept.push(last);
    return kept.map((p) => ({ ...p }));
  }
  const scale = spec.scale ?? 'linear';
  const pos = samples.map((p) => toNormalized(p.value, spec.min, spec.max, scale));
  // A knob that turns in steps records as a staircase: allow one step, so a steady turn becomes
  // one smooth slope.
  const step = spec.step ?? 0;
  if (step > 0) tolerance = Math.max(tolerance, step / (spec.max - spec.min));
  const keep = new Uint8Array(samples.length);
  keep[0] = 1;
  keep[samples.length - 1] = 1;
  // Ramer–Douglas–Peucker, measuring the vertical distance (knob travel) to the line.
  const stack: [number, number][] = [[0, samples.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const ta = samples[a]!.time;
    const span = samples[b]!.time - ta;
    let worst = -1;
    let worstDist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const f = span > 0 ? (samples[i]!.time - ta) / span : 0;
      const d = Math.abs(pos[i]! - (pos[a]! + f * (pos[b]! - pos[a]!)));
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return samples.filter((_, i) => keep[i]).map((p) => ({ ...p }));
}

/**
 * The points of a lane after recording over `start`…`end`: the old points (`base`) outside that
 * stretch stay, the recorded `samples` replace the ones inside it, and a point just before and
 * just after keeps the old line as it was around the recording. A lane without old points keeps
 * the control's own value (`own`) before the recording and the last recorded value after it.
 */
export function punchIn(
  spec: ParamSpec,
  base: readonly AutomationPoint[],
  start: number,
  end: number,
  samples: readonly AutomationPoint[],
  own: number,
): AutomationPoint[] {
  if (samples.length === 0) return base.map((p) => ({ ...p }));
  const from = start - RECORD_GUARD;
  const to = end + RECORD_GUARD;
  const out: AutomationPoint[] = [];
  for (const p of base) if (p.time < from) out.push({ ...p });
  if (from > 0) {
    const before = base.length > 0 ? laneValueAt(spec, base, from)! : own;
    out.push({ time: from, value: before });
  }
  for (const p of samples) out.push({ ...p });
  if (base.length > 0) {
    out.push({ time: to, value: laneValueAt(spec, base, to)! });
    for (const p of base) if (p.time > to) out.push({ ...p });
  }
  return out;
}

// ---------- Several points at once ----------

/**
 * Move selected points of a lane together, from where they were when the drag started (`from`,
 * the lane's points then): `dt` beats later and `dpos` of the knob's travel higher. The move in
 * time is limited so the points keep their order and stay between the points not selected; each
 * point's height is limited to the knob's range, and snaps to its steps.
 */
export function moveGroup(
  spec: ParamSpec,
  lane: AutomationLane,
  from: readonly AutomationPoint[],
  selected: readonly number[],
  dt: number,
  dpos: number,
): void {
  const sel = new Set(selected.filter((i) => i >= 0 && i < from.length));
  if (sel.size === 0) return;
  let lo = -Infinity;
  let hi = Infinity;
  for (const i of sel) {
    const t = from[i]!.time;
    lo = Math.max(lo, sel.has(i - 1) ? -Infinity : i > 0 ? from[i - 1]!.time - t : -t);
    hi = Math.min(hi, sel.has(i + 1) ? Infinity : i < from.length - 1 ? from[i + 1]!.time - t : MAX_BEATS - t);
  }
  const shift = Math.min(hi, Math.max(lo, dt));
  const scale = spec.scale ?? 'linear';
  const step = spec.step ?? 0;
  lane.points = from.map((p, i) => {
    if (!sel.has(i)) return { ...p };
    const pos = Math.min(1, Math.max(0, toNormalized(p.value, spec.min, spec.max, scale) + dpos));
    const v = fromNormalized(pos, spec.min, spec.max, scale);
    return { time: p.time + shift, value: step > 0 ? quantize(v, step, spec.min) : v };
  });
}

/** Remove several points of a lane at once. */
export function removePoints(lane: AutomationLane, indices: readonly number[]): void {
  const drop = new Set(indices);
  lane.points = lane.points.filter((_, i) => !drop.has(i));
}

/**
 * Copied points: times from the first copied point, heights as knob positions, so they can be
 * pasted onto any control (the same shape, in that control's range).
 */
export interface CopiedPoint {
  time: number;
  position: number;
}

export function copyPoints(spec: ParamSpec, points: readonly AutomationPoint[], indices: readonly number[]): CopiedPoint[] {
  const scale = spec.scale ?? 'linear';
  const picked = [...new Set(indices)]
    .filter((i) => i >= 0 && i < points.length)
    .sort((a, b) => a - b)
    .map((i) => points[i]!);
  if (picked.length === 0) return [];
  const t0 = picked[0]!.time;
  return picked.map((p) => ({ time: p.time - t0, position: toNormalized(p.value, spec.min, spec.max, scale) }));
}

/**
 * Paste copied points into a lane from beat `at`: they replace the lane's points in the stretch
 * they cover. Returns the indices of the pasted points (to select them).
 */
export function pastePoints(spec: ParamSpec, lane: AutomationLane, copied: readonly CopiedPoint[], at: number): number[] {
  if (copied.length === 0) return [];
  const scale = spec.scale ?? 'linear';
  const step = spec.step ?? 0;
  const start = Math.max(0, at);
  const end = start + copied[copied.length - 1]!.time;
  const pasted = copied
    .map((c) => {
      const v = fromNormalized(Math.min(1, Math.max(0, c.position)), spec.min, spec.max, scale);
      return { time: Math.min(MAX_BEATS, start + c.time), value: step > 0 ? quantize(v, step, spec.min) : v };
    });
  const before = lane.points.filter((p) => p.time < start);
  const after = lane.points.filter((p) => p.time > end);
  lane.points = [...before.map((p) => ({ ...p })), ...pasted, ...after.map((p) => ({ ...p }))];
  return pasted.map((_, k) => before.length + k);
}
