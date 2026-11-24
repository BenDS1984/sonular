<!--
  One automation lane on the timeline: the movement of one control drawn as a line through points.
  Height is the knob's position (bottom = minimum, top = maximum), so a straight line is the knob
  turning evenly. Choices and switches hold each point until the next; knobs that turn in steps
  (Tune) glide between points, which snap to the steps.
  - double-click an empty spot to add a point; double-click a point to remove it
  - click a point to select it, Shift+click to add it to the selection or take it out
  - drag on an empty spot to select the points in a box (Shift adds to the selection); a click on
    an empty spot clears the selection
  - drag a selected point to move all selected points; the grabbed point snaps to the grid (Alt
    for sixteenths); they keep their order and stay between the points not selected
  - Ctrl+A selects all points, Delete removes the selection, Escape clears it
  - Ctrl+C copies the selection, Ctrl+V pastes it at the playhead, replacing the points there
  - pointing at a point, or dragging it, shows its value and position next to it
  - drag the handle in the middle of a line up or down to bend it; double-click the handle to make
    the line straight again
-->
<script lang="ts">
  import { bend, CURVE_K, curveForMidpoint } from '../../engine/core/automation';
  import { currentBeat, engineState, shownPosition, transportState } from '../../engine/engine.svelte';
  import { paramFormatter } from '../../modules/paramFormat';
  import type { ParamSpec } from '../../modules/types';
  import {
    addPoint,
    copyPoints,
    holdsSteps,
    moveGroup,
    pastePoints,
    removePoint,
    removePoints,
    setCurve,
  } from '../../patch/timeline';
  import type { AutomationLane, AutomationPoint } from '../../patch/types';
  import { fromNormalized, quantize, toNormalized } from '../scale';
  import { endDragLook, startDragLook } from '../dragLook';
  import { laneClipboard } from './laneClipboard';
  import { formatPosition, snap, snapUnit } from './timelineGeometry';

  interface Props {
    lane: AutomationLane;
    spec: ParamSpec;
    /** Pixels per beat. */
    ppb: number;
    /** Width of the song area in pixels. */
    width: number;
    height: number;
    /** The patch's colour. */
    color: string;
  }

  let { lane, spec, ppb, width, height, color }: Props = $props();

  const PAD = 6;
  const R = 4.5;
  /** A press that moves less than this (px) is a click, not a box. */
  const CLICK_SLOP = 3;

  const scale = $derived(spec.scale ?? 'linear');
  const step = $derived(spec.step ?? 0);
  const hold = $derived(holdsSteps(spec));
  const format = $derived(paramFormatter(spec));

  const posOf = (value: number) => toNormalized(value, spec.min, spec.max, scale);
  const yOfPos = (pos: number) => PAD + (1 - pos) * (height - 2 * PAD);
  const yOf = (value: number) => yOfPos(posOf(value));
  /**
   * A bent line is drawn as this many smooth (cubic Bézier) pieces that follow the exact shape and
   * slope at their ends, so the browser draws one even curve instead of many tiny straight bits.
   */
  const CURVE_PIECES = 12;

  /** Slope of `bend` at fraction t (share of the way per share of the time). */
  const bendSlope = (t: number, curve: number) => {
    const a = curve * CURVE_K;
    return Math.abs(a) < 1e-6 ? 1 : (a * Math.exp(-a * t)) / (1 - Math.exp(-a));
  };
  /** Lines shorter than this (px) get no bend handle. */
  const HANDLE_MIN_PX = 14;
  const valueAtY = (y: number) => {
    const t = 1 - (y - PAD) / (height - 2 * PAD);
    const v = fromNormalized(t, spec.min, spec.max, scale);
    return step > 0 ? quantize(v, step, spec.min) : v;
  };

  /**
   * The line: flat before the first point and after the last, steps for choices and switches,
   * bent lines drawn in small pieces.
   */
  const path = $derived.by(() => {
    const pts = lane.points;
    if (pts.length === 0) return '';
    let d = `M0 ${yOf(pts[0]!.value)}`;
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i]!.time * ppb;
      const y = yOf(pts[i]!.value);
      const prev = pts[i - 1];
      if (hold && i > 0) d += ` H${x}`;
      else if (prev?.curve && !hold) {
        const x0 = prev.time * ppb;
        const p0 = posOf(prev.value);
        const p1 = posOf(pts[i]!.value);
        const c = prev.curve;
        const dx = x - x0;
        // Height on screen per share of the way (y grows downwards).
        const dy = -(p1 - p0) * (height - 2 * PAD);
        const h = 1 / CURVE_PIECES;
        for (let k = 0; k < CURVE_PIECES; k++) {
          const ta = k * h;
          const tb = ta + h;
          const ya = yOfPos(p0 + (p1 - p0) * bend(ta, c));
          const yb = yOfPos(p0 + (p1 - p0) * bend(tb, c));
          const c1x = x0 + dx * (ta + h / 3);
          const c1y = ya + (dy * bendSlope(ta, c) * h) / 3;
          const c2x = x0 + dx * (tb - h / 3);
          const c2y = yb - (dy * bendSlope(tb, c) * h) / 3;
          d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${x0 + dx * tb} ${yb}`;
        }
        continue;
      }
      d += ` L${x} ${y}`;
    }
    return `${d} H${width}`;
  });

  /** A bend handle in the middle of every line that goes somewhere (not for choices and switches). */
  const handles = $derived.by(() => {
    if (hold) return [];
    const pts = lane.points;
    const out: { i: number; x: number; y: number; bent: boolean }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const p0 = posOf(a.value);
      const p1 = posOf(b.value);
      if (Math.abs(p1 - p0) < 1e-6 || (b.time - a.time) * ppb < HANDLE_MIN_PX) continue;
      const x = ((a.time + b.time) / 2) * ppb;
      out.push({ i, x, y: yOfPos(p0 + (p1 - p0) * bend(0.5, a.curve ?? 0)), bent: !!a.curve });
    }
    return out;
  });

  type Drag =
    | { kind: 'move'; grab: number; from: AutomationPoint[]; x0: number; y0: number }
    | { kind: 'curve'; i: number }
    | { kind: 'box'; x0: number; y0: number; x1: number; y1: number; base: number[] };

  let svg: SVGSVGElement | undefined = $state();
  /** Indices of the selected points. */
  let selection: number[] = $state([]);
  let drag = $state<Drag | null>(null);
  let hovered = $state(-1);
  /** The point the last press was on (-1: an empty spot), for the double-click. */
  let lastDown = -1;
  /** The line whose bend handle the last press was on (-1: none). */
  let lastCurve = -1;

  const LABEL_H = 16;
  /** The value label: for the point being dragged, else the one pointed at. */
  const label = $derived.by(() => {
    const i = drag?.kind === 'move' ? drag.grab : drag ? -1 : hovered;
    const pt = lane.points[i];
    if (!pt) return null;
    const text = `${format(pt.value)} · ${formatPosition(pt.time)}`;
    const x = pt.time * ppb;
    const y = yOf(pt.value);
    // Above the point, or below it when it sits near the top of the lane.
    const top = y - LABEL_H - 6 >= 0 ? y - LABEL_H - 6 : y + 6;
    return { text, x: x + 8, y: top, w: text.length * 6.7 + 10 };
  });

  const box = $derived(
    drag?.kind === 'box'
      ? {
          x: Math.min(drag.x0, drag.x1),
          y: Math.min(drag.y0, drag.y1),
          w: Math.abs(drag.x1 - drag.x0),
          h: Math.abs(drag.y1 - drag.y0),
        }
      : null,
  );

  function raw(e: MouseEvent) {
    const r = svg!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function local(e: MouseEvent) {
    const { x, y } = raw(e);
    return { x, y: Math.min(height - PAD, Math.max(PAD, y)) };
  }

  const unitOf = (e: MouseEvent) => (e.altKey ? 0.25 : snapUnit(ppb));
  const timeAt = (e: MouseEvent, x: number) => Math.max(0, snap(x / ppb, unitOf(e)));

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    svg?.focus({ preventScroll: true });
    const handle = (e.target as Element).closest<SVGElement>('[data-curve]');
    lastCurve = -1;
    if (handle) {
      lastCurve = Number(handle.dataset['curve']);
      lastDown = -1;
      drag = { kind: 'curve', i: lastCurve };
      startDragLook('ns-resize');
      svg!.setPointerCapture(e.pointerId);
      return;
    }
    const target = (e.target as Element).closest<SVGElement>('[data-point]');
    const { x, y } = raw(e);
    if (target) {
      const i = Number(target.dataset['point']);
      lastDown = i;
      if (e.shiftKey) {
        selection = selection.includes(i) ? selection.filter((k) => k !== i) : [...selection, i];
        return;
      }
      if (!selection.includes(i)) selection = [i];
      drag = { kind: 'move', grab: i, from: lane.points.map((p) => ({ ...p })), x0: x, y0: y };
    } else {
      lastDown = -1;
      drag = { kind: 'box', x0: x, y0: y, x1: x, y1: y, base: e.shiftKey ? [...selection] : [] };
    }
    startDragLook(drag.kind === 'move' ? 'grabbing' : 'crosshair');
    svg!.setPointerCapture(e.pointerId);
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) {
      const target = (e.target as Element).closest<SVGElement>('[data-point]');
      hovered = target ? Number(target.dataset['point']) : -1;
      return;
    }
    const { x, y } = raw(e);
    if (drag.kind === 'curve') {
      // The handle follows the pointer: bend the line so its middle is at the pointer's height.
      const a = lane.points[drag.i];
      const b = lane.points[drag.i + 1];
      if (!a || !b) return;
      const p0 = posOf(a.value);
      const p1 = posOf(b.value);
      if (Math.abs(p1 - p0) < 1e-6) return;
      const pos = 1 - (y - PAD) / (height - 2 * PAD);
      setCurve(a, curveForMidpoint((pos - p0) / (p1 - p0)));
      return;
    }
    if (drag.kind === 'move') {
      // The grabbed point lands on the grid; the others move by the same amount.
      const t0 = drag.from[drag.grab]!.time;
      const dt = Math.max(0, snap(t0 + (x - drag.x0) / ppb, unitOf(e))) - t0;
      const dpos = -(y - drag.y0) / (height - 2 * PAD);
      moveGroup(spec, lane, drag.from, selection, dt, dpos);
      return;
    }
    drag.x1 = x;
    drag.y1 = y;
    const x0 = Math.min(drag.x0, x);
    const x1 = Math.max(drag.x0, x);
    const y0 = Math.min(drag.y0, y);
    const y1 = Math.max(drag.y0, y);
    const inside: number[] = [];
    lane.points.forEach((p, i) => {
      const px = p.time * ppb;
      const py = yOf(p.value);
      if (px >= x0 && px <= x1 && py >= y0 && py <= y1) inside.push(i);
    });
    selection = [...new Set([...drag.base, ...inside])];
  }

  function onpointerup() {
    if (drag) endDragLook();
    if (drag?.kind === 'box') {
      const click = Math.abs(drag.x1 - drag.x0) < CLICK_SLOP && Math.abs(drag.y1 - drag.y0) < CLICK_SLOP;
      if (click) selection = [...drag.base];
    }
    drag = null;
  }

  // The lane captures the pointer on pointerdown, so the browser sends the double-click to the
  // lane, not to the point: use the point the press was on.
  function ondblclick(e: MouseEvent) {
    e.stopPropagation();
    if (lastCurve >= 0) {
      const a = lane.points[lastCurve];
      if (a) setCurve(a, 0);
      lastCurve = -1;
      return;
    }
    if (lastDown >= 0) {
      removePoint(lane, lastDown);
      selection = [];
      lastDown = -1;
      return;
    }
    const { x, y } = local(e);
    selection = [addPoint(lane, timeAt(e, x), valueAtY(y))];
  }

  /** Where Ctrl+V pastes: the playhead (where the song is while playing), on the grid. */
  function pasteAt() {
    const beat = engineState.playing ? shownPosition(currentBeat()) : transportState.start;
    return Math.max(0, snap(beat, snapUnit(ppb)));
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    let handled = true;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length > 0) {
      removePoints(lane, selection);
      selection = [];
    } else if (e.key === 'Escape' && selection.length > 0) {
      selection = [];
    } else if (mod && key === 'a') {
      selection = lane.points.map((_, i) => i);
    } else if (mod && key === 'c' && selection.length > 0) {
      laneClipboard.points = copyPoints(spec, lane.points, selection);
    } else if (mod && key === 'v' && laneClipboard.points.length > 0) {
      selection = pastePoints(spec, lane, laneClipboard.points, pasteAt());
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions (drawing points is a pointer gesture) -->
<svg
  bind:this={svg}
  class="lane"
  {width}
  {height}
  tabindex="-1"
  role="application"
  aria-label={`Automation of ${spec.label}`}
  style:--lane-color={color}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  onpointerleave={() => (hovered = -1)}
  {ondblclick}
  {onkeydown}
  onblur={() => (selection = [])}
>
  <path class="line" d={path} />
  {#each handles as h (h.i)}
    <circle class="curve-handle" class:bent={h.bent} data-curve={h.i} cx={h.x} cy={h.y} r="3.5" />
  {/each}
  {#each lane.points as pt, i (i)}
    <circle
      class="point"
      class:selected={selection.includes(i)}
      data-point={i}
      cx={pt.time * ppb}
      cy={yOf(pt.value)}
      r={R}
    />
  {/each}
  {#if box}
    <rect class="box" x={box.x} y={box.y} width={box.w} height={box.h} />
  {/if}
  {#if label}
    <g class="value-label" transform={`translate(${label.x} ${label.y})`} aria-hidden="true">
      <rect width={label.w} height={LABEL_H} rx="3" />
      <text x="5" y={LABEL_H - 4.5}>{label.text}</text>
    </g>
  {/if}
</svg>

<style>
  .lane {
    display: block;
    cursor: crosshair;
    outline: none;
  }
  .line {
    fill: none;
    stroke: var(--lane-color);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .point {
    fill: var(--bg-canvas);
    stroke: var(--lane-color);
    stroke-width: 2;
    cursor: grab;
  }
  :global(html:not(.dragging)) .point:hover,
  .point.selected {
    fill: var(--lane-color);
  }
  /*
   * Bend handles: faint until the pointer is over the lane. Only the fill changes, at once: an
   * opacity fade makes the browser redraw the lane on its own layer, and the thin points flicker.
   */
  .curve-handle {
    fill: var(--lane-color);
    fill-opacity: 0;
    cursor: ns-resize;
  }
  .curve-handle.bent {
    fill-opacity: 0.35;
  }
  .lane:hover .curve-handle {
    fill-opacity: 0.6;
  }
  :global(html:not(.dragging)) .lane .curve-handle:hover {
    fill-opacity: 1;
  }
  .box {
    fill: color-mix(in srgb, var(--lane-color) 15%, transparent);
    stroke: var(--lane-color);
    stroke-width: 1;
    stroke-dasharray: 3 2;
    pointer-events: none;
  }
  .value-label {
    pointer-events: none;
  }
  .value-label rect {
    fill: var(--surface-bar);
    stroke: var(--lane-color);
    stroke-width: 1;
  }
  .value-label text {
    fill: var(--text-strong);
    font-size: 11px;
    font-family: var(--font-mono);
  }
</style>
