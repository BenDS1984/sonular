<!--
  One automation lane on the timeline: the movement of one control drawn as a line through points.
  Height is the knob's position (bottom = minimum, top = maximum), so a straight line is the knob
  turning evenly. Choices and switches hold each point until the next; knobs that turn in steps
  (Tune) glide between points, which snap to the steps.
  - click on the lane to add a point (keep the button down to drag it into place)
  - drag a point to move it; it snaps to the grid, hold Alt for sixteenths; it stays between its
    neighbours
  - double-click a point, or select it and press Delete, to remove it
  - pointing at a point, or dragging it, shows its value and position next to it
-->
<script lang="ts">
  import { paramFormatter } from '../../modules/paramFormat';
  import type { ParamSpec } from '../../modules/types';
  import { addPoint, holdsSteps, movePoint, removePoint } from '../../patch/timeline';
  import type { AutomationLane } from '../../patch/types';
  import { fromNormalized, quantize, toNormalized } from '../scale';
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
  const R = 4;

  const scale = $derived(spec.scale ?? 'linear');
  const step = $derived(spec.step ?? 0);
  const hold = $derived(holdsSteps(spec));
  const format = $derived(paramFormatter(spec));

  const yOf = (value: number) => PAD + (1 - toNormalized(value, spec.min, spec.max, scale)) * (height - 2 * PAD);
  const valueAtY = (y: number) => {
    const t = 1 - (y - PAD) / (height - 2 * PAD);
    const v = fromNormalized(t, spec.min, spec.max, scale);
    return step > 0 ? quantize(v, step, spec.min) : v;
  };

  /** The line: flat before the first point and after the last, steps for stepped controls. */
  const path = $derived.by(() => {
    const pts = lane.points;
    if (pts.length === 0) return '';
    let d = `M0 ${yOf(pts[0]!.value)}`;
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i]!.time * ppb;
      const y = yOf(pts[i]!.value);
      if (hold && i > 0) d += ` H${x}`;
      d += ` L${x} ${y}`;
    }
    return `${d} H${width}`;
  });

  let svg: SVGSVGElement | undefined = $state();
  let selected = $state(-1);
  let dragging = $state(-1);
  let hovered = $state(-1);

  const LABEL_H = 16;
  /** The value label: for the point being dragged, else the one pointed at. */
  const label = $derived.by(() => {
    const i = dragging >= 0 ? dragging : hovered;
    const pt = lane.points[i];
    if (!pt) return null;
    const text = `${format(pt.value)} · ${formatPosition(pt.time)}`;
    const x = pt.time * ppb;
    const y = yOf(pt.value);
    // Above the point, or below it when it sits near the top of the lane.
    const top = y - LABEL_H - 6 >= 0 ? y - LABEL_H - 6 : y + 6;
    return { text, x: x + 8, y: top, w: text.length * 6.7 + 10 };
  });

  function local(e: PointerEvent | MouseEvent) {
    const r = svg!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: Math.min(height - PAD, Math.max(PAD, e.clientY - r.top)) };
  }

  const timeAt = (e: PointerEvent, x: number) => {
    const unit = e.altKey ? 0.25 : snapUnit(ppb);
    return Math.max(0, snap(x / ppb, unit));
  };

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    svg?.focus({ preventScroll: true });
    const target = (e.target as Element).closest<SVGElement>('[data-point]');
    const { x, y } = local(e);
    let index: number;
    if (target) {
      index = Number(target.dataset['point']);
    } else {
      index = addPoint(lane, timeAt(e, x), valueAtY(y));
    }
    selected = index;
    dragging = index;
    svg!.setPointerCapture(e.pointerId);
  }

  function onpointermove(e: PointerEvent) {
    if (dragging < 0) {
      const target = (e.target as Element).closest<SVGElement>('[data-point]');
      hovered = target ? Number(target.dataset['point']) : -1;
      return;
    }
    const { x, y } = local(e);
    movePoint(lane, dragging, timeAt(e, x), valueAtY(y));
  }

  function onpointerup() {
    dragging = -1;
  }

  // The lane captures the pointer on pointerdown (for dragging), so the browser sends the
  // double-click to the lane, not to the point: remove the point the first click selected.
  function ondblclick(e: MouseEvent) {
    e.stopPropagation();
    if (selected < 0) return;
    removePoint(lane, selected);
    selected = -1;
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected >= 0) {
      e.preventDefault();
      e.stopPropagation();
      removePoint(lane, selected);
      selected = -1;
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
  onblur={() => (selected = -1)}
>
  <path class="line" d={path} />
  {#each lane.points as pt, i (i)}
    <circle
      class="point"
      class:selected={i === selected}
      data-point={i}
      cx={pt.time * ppb}
      cy={yOf(pt.value)}
      r={R}
    />
  {/each}
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
    stroke-width: 1.5;
  }
  .point {
    fill: var(--bg-canvas);
    stroke: var(--lane-color);
    stroke-width: 1.5;
    cursor: grab;
  }
  .point:hover,
  .point.selected {
    fill: var(--lane-color);
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
