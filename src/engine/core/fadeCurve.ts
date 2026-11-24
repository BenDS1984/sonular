/**
 * The shape of an audio clip's fade, shared by the engine (what is heard) and the timeline (what is
 * drawn), so both are always the same curve.
 *
 * A fade's bend is its level halfway through: 0.5 is a straight line, higher bulges (the sound
 * stays loud longer), lower sags (it gets quiet sooner). The curve is gain = progress ^ power,
 * with the power chosen so that it passes through that halfway level.
 */

/** A straight fade. */
export const FADE_LINEAR = 0.5;
/** The furthest a fade can be bent, either way. */
export const FADE_BEND_MIN = 0.1;
export const FADE_BEND_MAX = 0.9;

export const clampFadeBend = (bend: number): number =>
  Number.isFinite(bend) ? Math.min(FADE_BEND_MAX, Math.max(FADE_BEND_MIN, bend)) : FADE_LINEAR;

/** The power of the curve with this bend (1 for a straight line). */
export const fadePower = (bend: number): number => Math.log(clampFadeBend(bend)) / Math.log(0.5);

/** Gain of a fade at `progress` (0: the silent end, 1: full level), for a curve of `power`. */
export function fadeGain(progress: number, power = 1): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  return power === 1 ? progress : progress ** power;
}
