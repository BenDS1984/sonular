/**
 * Edge panning while something is dragged on the canvas (a cable, a module): when the pointer
 * comes within EDGE_PX of an edge of the canvas, the canvas scrolls that way, faster the closer the
 * pointer is (full speed at the edge and beyond), also while the pointer is held still. After each
 * step `onpan` lets the drag follow, so what is dragged stays under the pointer.
 */
import { patch } from '../../patch/patch.svelte';

export const EDGE_PX = 40;
/** Screen pixels per frame at full speed. */
const MAX_SPEED = 14;

/** Speed (px per frame, signed) for a pointer at `pos` between `lo` and `hi`. */
export function edgeSpeed(pos: number, lo: number, hi: number): number {
  const near = (d: number) => MAX_SPEED * Math.min(1, Math.max(0, (EDGE_PX - d) / EDGE_PX)) ** 2;
  if (pos - lo < EDGE_PX) return -near(pos - lo);
  if (hi - pos < EDGE_PX) return near(hi - pos);
  return 0;
}

export function startAutoPan(canvas: () => HTMLElement | null | undefined, onpan: () => void) {
  let x = 0;
  let y = 0;
  let frame = 0;

  function step() {
    frame = 0;
    const r = canvas()?.getBoundingClientRect();
    if (!r) return;
    const vx = edgeSpeed(x, r.left, r.right);
    const vy = edgeSpeed(y, r.top, r.bottom);
    if (vx === 0 && vy === 0) return;
    // Moving towards the right edge shows more of what lies to the right.
    patch.view.x -= vx;
    patch.view.y -= vy;
    onpan();
    frame = requestAnimationFrame(step);
  }

  return {
    /** Call with every pointer move of the drag. */
    update(e: { clientX: number; clientY: number }) {
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(step);
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
