<!--
  Vertical slider.

  Interaction:
  - click or drag along the track to set the value (hold Shift while dragging for fine control)
  - double-click resets to the default value
  The slider is mouse only: it cannot be focused or moved with the keyboard.
  The mouse wheel does not move sliders: it pans the canvas.
-->
<script lang="ts">
  import { clamp, fromNormalized, quantize, toNormalized, type Scale } from '../scale';
  import { formatNumber } from '../format';
  import type { SignalType } from '../signals';

  interface Props {
    value: number;
    min?: number;
    max?: number;
    /** Value restored on double-click. Defaults to `min`. */
    defaultValue?: number;
    /** Snap increment; 0 = continuous. */
    step?: number;
    scale?: Scale;
    /** Height of the track in pixels. */
    height?: number;
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
    height = 70,
    label = '',
    unit = '',
    format,
    signal = 'audio',
    disabled = false,
    onchange,
  }: Props = $props();

  /** Distance kept free at both ends of the track, so the handle stays inside it. */
  const PAD = 6;
  const FINE_FACTOR = 10;

  let dragging = $state(false);
  let track: HTMLDivElement | undefined = $state();
  let lastY = 0;
  let dragNorm = 0;

  const norm = $derived(toNormalized(value, min, max, scale));
  const text = $derived(format ? format(value) : formatNumber(value, unit));
  const resetValue = $derived(defaultValue ?? min);
  const travel = $derived(height - 2 * PAD);

  function commit(v: number) {
    const next = clamp(quantize(v, step, min), min, max);
    if (next !== value) {
      value = next;
      onchange?.(next);
    }
  }

  const setNormalized = (t: number) => commit(fromNormalized(t, min, max, scale));

  /** The position along the track (0 at the bottom, 1 at the top) under a pointer. */
  function along(e: PointerEvent): number {
    const r = track!.getBoundingClientRect();
    return clamp((r.bottom - PAD - e.clientY) / (r.height - 2 * PAD), 0, 1);
  }

  function onpointerdown(e: PointerEvent) {
    if (disabled || e.button !== 0 || !track) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = true;
    lastY = e.clientY;
    // A click jumps to the pointer; with Shift it only starts a fine drag from where the value is.
    dragNorm = e.shiftKey ? norm : along(e);
    setNormalized(dragNorm);
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging || !track) return;
    if (e.shiftKey) {
      dragNorm = clamp(dragNorm + (lastY - e.clientY) / (travel * FINE_FACTOR), 0, 1);
    } else {
      dragNorm = along(e);
    }
    lastY = e.clientY;
    setNormalized(dragNorm);
  }

  const endDrag = () => (dragging = false);
</script>

<div class="slider" class:disabled style:--slider-accent={`var(--signal-${signal})`}>
  {#if label}<div class="label">{label}</div>{/if}
  <div
    class="track-area"
    class:active={dragging}
    style:height={`${height}px`}
    bind:this={track}
    role="meter"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={text}
    {onpointerdown}
    {onpointermove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onlostpointercapture={endDrag}
    ondblclick={() => !disabled && commit(resetValue)}
  >
    <div class="groove"></div>
    <div class="fill" style:height={`${PAD + norm * travel}px`}></div>
    <div class="handle" style:bottom={`${PAD + norm * travel}px`}></div>
  </div>
  <div class="value" class:active={dragging}>{text}</div>
</div>

<style>
  .slider {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    /* A fixed width, so a longer readout ("300 ms" after "5.0 ms") never moves the slider. */
    width: 44px;
  }
  .label {
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }
  .track-area {
    position: relative;
    width: 28px;
    cursor: ns-resize;
    touch-action: none;
    border-radius: var(--radius-sm);
    outline-offset: 1px;
  }
  .groove {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 6px;
    transform: translateX(-50%);
    border-radius: 3px;
    background: var(--knob-track);
  }
  .fill {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: 6px;
    transform: translateX(-50%);
    border-radius: 3px;
    background: var(--slider-accent);
  }
  .handle {
    position: absolute;
    left: 50%;
    width: 22px;
    height: 10px;
    margin-bottom: -5px;
    transform: translateX(-50%);
    border-radius: 3px;
    border: 1px solid var(--border-strong);
    background: var(--surface-knob);
    filter: var(--shadow-knob);
    transition: background var(--duration-fast) var(--ease-out);
  }
  .handle::after {
    content: '';
    position: absolute;
    left: 4px;
    right: 4px;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    border-radius: 1px;
    background: var(--slider-accent);
  }
  .track-area.active .handle {
    background: var(--surface-control-hover);
  }
  .disabled {
    opacity: 0.45;
  }
  .value {
    color: var(--text-default);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    white-space: nowrap;
    text-align: center;
  }
  .value.active {
    color: var(--text-strong);
  }
</style>
