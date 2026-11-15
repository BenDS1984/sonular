/** Geometry helpers for the canvas: coordinate conversion, cable curves, grid snapping. */
import type { ViewState } from './types';

export interface Point {
  x: number;
  y: number;
}

export const GRID = 20;
export const SNAP = 10;
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2;

export const snap = (v: number, step = SNAP) => Math.round(v / step) * step;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Screen point (relative to the canvas element) -> canvas coordinates. */
export function toCanvas(view: ViewState, sx: number, sy: number): Point {
  return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom };
}

/** Zoom around a fixed screen point so the content under the cursor stays put. */
export function zoomAt(view: ViewState, sx: number, sy: number, zoom: number): ViewState {
  const z = clampZoom(zoom);
  const p = toCanvas(view, sx, sy);
  return { zoom: z, x: sx - p.x * z, y: sy - p.y * z };
}

/**
 * A hanging cable between two points: a cubic Bézier whose control points droop below the
 * ends, more so for longer cables, like a real patch cable under gravity.
 */
export function cablePath(a: Point, b: Point): string {
  const dx = b.x - a.x;
  const dist = Math.hypot(dx, b.y - a.y);
  const sag = Math.min(140, 24 + dist * 0.18);
  const c1x = a.x + dx / 3;
  const c2x = a.x + (2 * dx) / 3;
  const c1y = a.y + sag;
  const c2y = b.y + sag;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

/** View that shows all given rectangles with some margin, within the zoom limits. */
export function fitView(
  rects: { x: number; y: number; w: number; h: number }[],
  width: number,
  height: number,
  margin = 60,
): ViewState {
  if (!rects.length) return { x: 0, y: 0, zoom: 1 };
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const zoom = clampZoom(
    Math.min(1, (width - 2 * margin) / Math.max(1, maxX - minX), (height - 2 * margin) / Math.max(1, maxY - minY)),
  );
  return {
    zoom,
    x: (width - (maxX - minX) * zoom) / 2 - minX * zoom,
    y: (height - (maxY - minY) * zoom) / 2 - minY * zoom,
  };
}
