<!--
  Overview of the whole patch in the top-right corner. The frame shows the visible area:
  drag it (or click anywhere) to move around; Ctrl + scroll zooms.
-->
<script lang="ts">
  import { getDefinition } from '../../modules/registry';
  import { canvasState, patch } from '../../patch/patch.svelte';
  import { zoomAt } from '../../patch/geometry';
  import { portPosition } from './interaction.svelte';

  const W = 200;
  const H = 130;
  /** Margin around the content, in canvas pixels. */
  const PAD = 60;

  interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  const union = (a: Rect, b: Rect): Rect => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  };

  const moduleRects = $derived(
    patch.modules.map((m) => {
      const size = canvasState.moduleSizes[m.id] ?? { w: getDefinition(m.type)?.width ?? 200, h: 200 };
      const family = (getDefinition(m.type)?.category ?? 'Utilities').toLowerCase();
      return { id: m.id, family, x: m.x, y: m.y, w: size.w, h: size.h };
    }),
  );

  /** The visible area of the canvas, in canvas coordinates. */
  const viewRect = $derived<Rect>({
    x: -patch.view.x / patch.view.zoom,
    y: -patch.view.y / patch.view.zoom,
    w: canvasState.viewport.w / patch.view.zoom,
    h: canvasState.viewport.h / patch.view.zoom,
  });

  // While dragging, the mapping is frozen so the frame follows the pointer exactly.
  let frozen: Rect | null = $state(null);

  const bounds = $derived.by<Rect>(() => {
    if (frozen) return frozen;
    let b = viewRect;
    for (const r of moduleRects) b = union(b, r);
    return { x: b.x - PAD, y: b.y - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD };
  });

  const scale = $derived(Math.min(W / bounds.w, H / bounds.h));
  const ox = $derived((W - bounds.w * scale) / 2 - bounds.x * scale);
  const oy = $derived((H - bounds.h * scale) / 2 - bounds.y * scale);
  const mx = (x: number) => ox + x * scale;
  const my = (y: number) => oy + y * scale;

  const cableLines = $derived(
    patch.cables.flatMap((c) => {
      const a = portPosition(c.from);
      const b = portPosition(c.to);
      const m = patch.modules.find((x) => x.id === c.from.module);
      const signal = (m && getDefinition(m.type)?.outputs.find((p) => p.id === c.from.port)?.signal) ?? 'audio';
      return a && b ? [{ id: c.id, a, b, signal }] : [];
    }),
  );

  /** Move the view so that canvas point (cx, cy) is in the middle of the screen. */
  function centerOn(cx: number, cy: number) {
    patch.view.x = canvasState.viewport.w / 2 - cx * patch.view.zoom;
    patch.view.y = canvasState.viewport.h / 2 - cy * patch.view.zoom;
  }

  function toCanvasPoint(e: PointerEvent, el: Element) {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    frozen = bounds;
    const start = toCanvasPoint(e, el);
    const v = viewRect;
    const inside = start.x >= v.x && start.x <= v.x + v.w && start.y >= v.y && start.y <= v.y + v.h;
    // Grab the frame where it was pressed; a click outside it jumps there first.
    const grab = inside ? { x: start.x - (v.x + v.w / 2), y: start.y - (v.y + v.h / 2) } : { x: 0, y: 0 };
    if (!inside) centerOn(start.x, start.y);
    const move = (ev: PointerEvent) => {
      const p = toCanvasPoint(ev, el);
      centerOn(p.x - grab.x, p.y - grab.y);
    };
    const up = () => {
      frozen = null;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!(e.ctrlKey || e.metaKey)) return;
    const { w, h } = canvasState.viewport;
    patch.view = zoomAt(patch.view, w / 2, h / 2, patch.view.zoom * Math.exp(-e.deltaY * 0.0015));
  }
</script>

<div
  class="minimap"
  role="img"
  aria-label="Patch overview. Drag to move around."
  title="Overview — drag to move around, Ctrl + scroll to zoom"
  {onpointerdown}
  {onwheel}
  ondblclick={(e) => e.stopPropagation()}
>
  <svg width={W} height={H} aria-hidden="true">
    {#each cableLines as c (c.id)}
      <line
        class="cable"
        x1={mx(c.a.x)}
        y1={my(c.a.y)}
        x2={mx(c.b.x)}
        y2={my(c.b.y)}
        style:stroke={`var(--signal-${c.signal})`}
      />
    {/each}
    {#each moduleRects as r (r.id)}
      <rect
        class="module"
        x={mx(r.x)}
        y={my(r.y)}
        width={Math.max(2, r.w * scale)}
        height={Math.max(2, r.h * scale)}
        rx="1.5"
        style:--family={`var(--family-${r.family})`}
      />
    {/each}
    <rect
      class="view"
      x={mx(viewRect.x)}
      y={my(viewRect.y)}
      width={viewRect.w * scale}
      height={viewRect.h * scale}
      rx="2"
    />
  </svg>
</div>

<style>
  .minimap {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    z-index: 150000;
    padding: 0;
    background: var(--surface-bar);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.35);
    cursor: grab;
    touch-action: none;
    overflow: hidden;
  }
  .minimap:active {
    cursor: grabbing;
  }
  svg {
    display: block;
  }
  /* Same family colour as the module's header on the canvas. */
  .module {
    fill: var(--family);
    stroke: color-mix(in srgb, var(--family) 60%, white);
    stroke-width: 1;
  }
  .cable {
    stroke-width: 1.2;
    opacity: 0.85;
  }
  .view {
    fill: rgb(255 255 255 / 0.06);
    stroke: var(--text-secondary);
    stroke-width: 1.2;
  }
</style>
