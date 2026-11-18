<!--
  Rotary knob.

  Interaction:
  - drag up/down to change (hold Shift for fine control)
  The mouse wheel does not turn knobs: it pans the canvas, so scrolling over a module never
  changes a setting by accident.
  - double-click resets to the default value
  - keyboard when focused: arrows, PageUp/PageDown, Home/End (Shift = fine)
-->
<script lang="ts">
  import { clamp, fromNormalized, quantize, toNormalized, type Scale } from '../scale';
  import { formatNumber } from '../format';
  import type { SignalType } from '../signals';

  // Unique id for this knob's highlight gradient (ids must not repeat on the page).
  const uid = $props.id();
  const shineId = `knob-shine-${uid}`;

  interface Props {
    value: number;
    min?: number;
    max?: number;
    /** Value restored on double-click. Defaults to the centre for bipolar knobs, else `min`. */
    defaultValue?: number;
    /** Snap increment; 0 = continuous. */
    step?: number;
    scale?: Scale;
    /** Draw the value arc from the centre (for pan, fine tune, ...). */
    bipolar?: boolean;
    size?: 'sm' | 'md' | 'lg';
    label?: string;
    unit?: string;
    format?: (value: number) => string;
    signal?: SignalType;
    disabled?: boolean;
    onchange?: (value: number) => void;
  }

  let {
    value = $bindable(),
    min = 0,
    max = 1,
    defaultValue,
    step = 0,
    scale = 'linear',
    bipolar = false,
    size = 'md',
    label = '',
    unit = '',
    format,
    signal = 'audio',
    disabled = false,
    onchange,
  }: Props = $props();

  const SIZES = { sm: 30, md: 40, lg: 52 } as const;
  const START_DEG = -135;
  const SWEEP_DEG = 270;
  /** Pixels of vertical drag for the full range. */
  const DRAG_RANGE_PX = 200;
  const FINE_FACTOR = 10;

  let dragging = $state(false);
  let dragNorm = 0;
  let lastY = 0;

  const norm = $derived(toNormalized(value, min, max, scale));
  const px = $derived(SIZES[size]);
  const text = $derived(format ? format(value) : formatNumber(value, unit));
  const resetValue = $derived(defaultValue ?? (bipolar ? (min + max) / 2 : min));
  const angle = $derived(START_DEG + norm * SWEEP_DEG);

  // ---------- Geometry (SVG viewBox 0..100) ----------
  const C = 50;
  const R_ARC = 42;

  function polar(deg: number, r: number): [number, number] {
    const a = (deg * Math.PI) / 180;
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  }

  function arcPath(fromDeg: number, toDeg: number, r: number): string {
    if (toDeg - fromDeg < 0.5) return '';
    const [x0, y0] = polar(fromDeg, r);
    const [x1, y1] = polar(toDeg, r);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  const trackPath = arcPath(START_DEG, START_DEG + SWEEP_DEG, R_ARC);
  const valuePath = $derived(
    bipolar ? arcPath(Math.min(0, angle), Math.max(0, angle), R_ARC) : arcPath(START_DEG, angle, R_ARC),
  );
  const pointer = $derived({ from: polar(angle, 12), to: polar(angle, 27) });

  // ---------- Value changes ----------
  function commit(v: number) {
    const next = clamp(quantize(v, step, min), min, max);
    if (next !== value) {
      value = next;
      onchange?.(next);
    }
  }

  function setNormalized(t: number) {
    commit(fromNormalized(t, min, max, scale));
  }

  /** Move by a fraction of the range, or by whole steps for stepped knobs. */
  function nudge(direction: number, fraction: number) {
    if (step) commit(value + direction * step * Math.max(1, Math.round(fraction * 100)));
    else setNormalized(norm + direction * fraction);
  }

  // ---------- Pointer ----------
  function onpointerdown(e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    dragging = true;
    dragNorm = norm;
    lastY = e.clientY;
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging) return;
    const dy = lastY - e.clientY;
    lastY = e.clientY;
    dragNorm = clamp(dragNorm + dy / (DRAG_RANGE_PX * (e.shiftKey ? FINE_FACTOR : 1)), 0, 1);
    setNormalized(dragNorm);
  }

  function endDrag() {
    dragging = false;
  }

  function onkeydown(e: KeyboardEvent) {
    if (disabled) return;
    const fine = e.shiftKey ? 0.1 : 1;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        nudge(1, 0.01 * fine);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        nudge(-1, 0.01 * fine);
        break;
      case 'PageUp':
        nudge(1, 0.1);
        break;
      case 'PageDown':
        nudge(-1, 0.1);
        break;
      case 'Home':
        commit(min);
        break;
      case 'End':
        commit(max);
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<div class="knob" class:disabled style:--knob-accent={`var(--signal-${signal})`}>
  {#if label}<div class="label">{label}</div>{/if}
  <div
    class="dial"
    class:active={dragging}
    style:width={`${px}px`}
    style:height={`${px}px`}
    role="slider"
    tabindex={disabled ? -1 : 0}
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={text}
    aria-disabled={disabled}
    {onpointerdown}
    {onpointermove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onlostpointercapture={endDrag}
    ondblclick={() => !disabled && commit(resetValue)}
    {onkeydown}
  >
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path class="track" d={trackPath} />
      {#if valuePath}<path class="arc" d={valuePath} />{/if}
      <defs>
        <radialGradient id={shineId} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0" stop-color="#fff" stop-opacity="0.22" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <circle class="cap" cx={C} cy={C} r="31" />
      <circle class="shine" cx={C} cy={C} r="30" fill={`url(#${shineId})`} />
      <line
        class="pointer"
        x1={pointer.from[0]}
        y1={pointer.from[1]}
        x2={pointer.to[0]}
        y2={pointer.to[1]}
      />
    </svg>
  </div>
  <div class="value" class:active={dragging}>{text}</div>
</div>

<style>
  .knob {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 40px;
  }
  .dial {
    position: relative;
    cursor: ns-resize;
    touch-action: none;
    border-radius: 50%;
    outline-offset: 1px;
  }
  .dial:focus-visible {
    outline: 2px solid var(--knob-accent);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .track {
    fill: none;
    stroke: var(--knob-track);
    stroke-width: 7;
    stroke-linecap: round;
  }
  .arc {
    fill: none;
    stroke: var(--knob-accent);
    stroke-width: 7;
    stroke-linecap: round;
  }
  .cap {
    fill: var(--surface-knob);
    stroke: var(--border-strong);
    stroke-width: 2;
    filter: var(--shadow-knob);
    transition: fill var(--duration-fast) var(--ease-out);
  }
  .shine {
    pointer-events: none;
  }
  .dial:hover .cap,
  .dial.active .cap {
    fill: var(--surface-knob-hover);
  }
  .pointer {
    stroke: var(--text-strong);
    stroke-width: 6;
    stroke-linecap: round;
  }
  .label {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--text-secondary);
    user-select: none;
    white-space: nowrap;
  }
  .value {
    min-width: 52px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-default);
    user-select: none;
    white-space: nowrap;
    transition: color var(--duration-fast) var(--ease-out);
  }
  .value.active {
    color: var(--knob-accent);
  }
  .disabled {
    opacity: 0.45;
  }
  .disabled .dial {
    cursor: default;
  }
</style>
