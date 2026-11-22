/**
 * Measurements of the timeline screen: zoom, snapping and the ruler. Times are in beats,
 * horizontal sizes in screen pixels; `ppb` is pixels per beat (the zoom).
 */
import { BEATS_PER_BAR } from '../../patch/timeline';

export const MIN_PPB = 2;
export const MAX_PPB = 2400;
export const DEFAULT_PPB = 24;

export const clampPpb = (ppb: number) => Math.min(MAX_PPB, Math.max(MIN_PPB, ppb));

/** Whether sixteenth lines are drawn (only when a beat is wide enough to show them). */
export const showsSixteenths = (ppb: number) => ppb >= 96;

/** Whether beat lines are drawn (they would be a blur when zoomed far out). */
export const showsBeats = (ppb: number) => ppb >= 8;

/**
 * Grid that dragging snaps to: a bar when zoomed out, a beat at normal zoom, a sixteenth when
 * zoomed far in.
 */
export function snapUnit(ppb: number): number {
  if (ppb < 12) return BEATS_PER_BAR;
  if (ppb < 96) return 1;
  return 0.25;
}

export const snap = (beat: number, unit: number) => Math.round(beat / unit) * unit;

/** Bars between two numbers on the ruler, so labels stay at least ~44 px apart. */
export function labelEvery(ppb: number): number {
  const barPx = ppb * BEATS_PER_BAR;
  let n = 1;
  while (n * barPx < 44) n *= 2;
  return n;
}

/** Position as bar.beat (counted from 1), with .sixteenth when it is not on a beat. */
export function formatPosition(beat: number): string {
  const sixteenths = Math.round(Math.max(0, beat) * 4);
  const bar = Math.floor(sixteenths / (4 * BEATS_PER_BAR)) + 1;
  const b = (Math.floor(sixteenths / 4) % BEATS_PER_BAR) + 1;
  const s = (sixteenths % 4) + 1;
  return s === 1 ? `${bar}.${b}` : `${bar}.${b}.${s}`;
}

/** Length as "N bars" (with beats when it is not whole bars). */
export function formatLength(beats: number): string {
  const bars = Math.floor(beats / BEATS_PER_BAR + 1e-9);
  const rest = Math.round((beats - bars * BEATS_PER_BAR) * 100) / 100;
  const barText = `${bars} bar${bars === 1 ? '' : 's'}`;
  if (rest === 0) return barText;
  const restText = `${rest} beat${rest === 1 ? '' : 's'}`;
  return bars ? `${barText} ${restText}` : restText;
}

/**
 * Zoom around a point: the beat under `x` (pixels from the left of the visible area) stays under
 * it. Returns the new zoom and scroll position.
 */
export function zoomAround(ppb: number, scrollLeft: number, x: number, factor: number) {
  const next = clampPpb(ppb * factor);
  const beat = (scrollLeft + x) / ppb;
  return { ppb: next, scrollLeft: Math.max(0, beat * next - x) };
}

/** Spacings (seconds) the time ruler can use, from very fine to ten minutes. */
const TIME_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

/** The smallest spacing in seconds that keeps time labels at least `minPx` apart. */
export function timeStep(pxPerSecond: number, minPx = 64): number {
  return TIME_STEPS.find((s) => s * pxPerSecond >= minPx) ?? TIME_STEPS[TIME_STEPS.length - 1]!;
}

/** A time as m:ss, with decimals when the spacing is finer than a second ("0:01.5"). */
export function formatTime(seconds: number, step: number): string {
  const t = Math.max(0, seconds);
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const rounded = Math.round(t * 10 ** decimals) / 10 ** decimals;
  const m = Math.floor(rounded / 60);
  const s = rounded - m * 60;
  return `${m}:${s.toFixed(decimals).padStart(decimals ? decimals + 3 : 2, '0')}`;
}
