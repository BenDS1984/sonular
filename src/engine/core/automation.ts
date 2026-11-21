/**
 * Automation lanes in the engine: the value of a control at a position on the timeline.
 *
 * Points are stored as knob positions (0..1 along the knob's travel), so a straight line drawn on
 * the timeline is the knob turning evenly, also for logarithmic knobs. Stepped controls (choices,
 * switches) hold each point's value until the next point. Before the first point and after the
 * last, the value stays at that point.
 *
 * A segment can be bent (a curve from -1 to 1, stored on the point it starts at): positive starts
 * fast and ends slow, negative starts slow and ends fast, 0 is a straight line. The shape is
 * exponential, so a piece of a curve is again such a curve (splitting a segment keeps its shape).
 */
import { fromNormalized, quantize, type Scale } from '../../ui/scale';

/** One automated control as the engine takes it. */
export interface EngineLane {
  node: string;
  param: string;
  /** Point times in beats, sorted. */
  times: number[];
  /** Knob positions (0..1), one per point. */
  positions: number[];
  min: number;
  max: number;
  scale: Scale;
  /** Snap increment of the control; above 0, the value holds from point to point. */
  step: number;
  /** Bend of the segment starting at each point (-1..1, 0 = straight); none means all straight. */
  curves?: number[];
}

/** How strongly a curve of 1 bends: the exponent of the shape at full bend. */
export const CURVE_K = 8;

/**
 * Share of the way from a segment's start to its end at fraction `t` of its time (both 0..1), for
 * a bend `curve` (-1..1).
 */
export function bend(t: number, curve: number): number {
  const a = curve * CURVE_K;
  if (Math.abs(a) < 1e-6) return t;
  return (1 - Math.exp(-a * t)) / (1 - Math.exp(-a));
}

/**
 * The bend that puts a segment's middle at share `m` (0..1) of the way from its start to its end:
 * the inverse of `bend(0.5, curve)`, limited to -1..1.
 */
export function curveForMidpoint(m: number): number {
  const mm = Math.min(0.999, Math.max(0.001, m));
  return Math.min(1, Math.max(-1, (2 * Math.log(mm / (1 - mm))) / CURVE_K));
}

/**
 * Index i of the segment holding `beat` (times[i] <= beat < times[i + 1]), searched from `hint`
 * onwards when that is not past `beat` (playback mostly moves forward), else from the start.
 */
export function segmentAt(times: ArrayLike<number>, beat: number, hint = 0): number {
  const n = times.length;
  let i = hint > 0 && hint < n - 1 && times[hint]! <= beat ? hint : 0;
  while (i < n - 2 && times[i + 1]! <= beat) i++;
  return i;
}

/** Knob position of a lane at `beat`, using segment `i` (from `segmentAt`). */
export function positionAt(
  times: ArrayLike<number>,
  positions: ArrayLike<number>,
  beat: number,
  i = segmentAt(times, beat),
  hold = false,
  curves?: ArrayLike<number>,
): number {
  const n = times.length;
  if (n === 0) return 0;
  if (beat <= times[0]!) return positions[0]!;
  if (beat >= times[n - 1]!) return positions[n - 1]!;
  const t0 = times[i]!;
  const t1 = times[i + 1]!;
  const p0 = positions[i]!;
  if (hold || t1 <= t0) return p0;
  const t = (beat - t0) / (t1 - t0);
  const c = curves ? (curves[i] ?? 0) : 0;
  return p0 + (positions[i + 1]! - p0) * (c === 0 ? t : bend(t, c));
}

/** Value of a lane at `beat`, in the control's own units. */
export function laneValueAt(lane: EngineLane, beat: number): number {
  const hold = lane.step > 0;
  const v = fromNormalized(
    positionAt(lane.times, lane.positions, beat, segmentAt(lane.times, beat), hold, lane.curves),
    lane.min,
    lane.max,
    lane.scale,
  );
  return hold ? quantize(v, lane.step, lane.min) : v;
}
