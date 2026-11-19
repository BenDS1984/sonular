<!--
  Vertical volume fader with a console-style dB scale (+6 dB at the top, −∞ at the bottom).
  `value` is a linear gain (1 = 0 dB).

  Interaction (like Knob):
  - drag the cap or the track up/down (hold Shift for fine control); clicking the track does not
    jump, so grabbing anywhere never causes a sudden level change
  - double-click resets to the default value
  - keyboard when focused: arrows, PageUp/PageDown, Home/End (Shift = fine)
-->
<script lang="ts">
  import { clamp } from '../scale';
  import { formatGainDb } from '../format';
  import { dbToPos, gainToPos, posToDb } from '../faderScale';

  interface Props {
    value: number;
    defaultValue?: number;
    /** Highest gain (linear); +6 dB = 2. */
    max?: number;
    /** Height of the travel in pixels. */
    height?: number;
    label?: string;
    onchange?: (value: number) => void;
  }

  let { value = $bindable(), defaultValue = 1, max = 2, height = 150, label = 'Level', onchange }: Props = $props();

  const MARKS = [6, 0, -6, -12, -24];
  const FINE_FACTOR = 10;

  const maxDb = $derived(20 * Math.log10(max));

  const posToGain = (p: number) => {
    const db = Math.min(posToDb(p), maxDb);
    return db === -Infinity || p <= 0 ? 0 : Math.pow(10, db / 20);
  };

  const pos = $derived(gainToPos(value));
  const text = $derived(formatGainDb(value));

  function commit(g: number) {
    const next = clamp(g, 0, max);
    if (next !== value) {
      value = next;
      onchange?.(next);
    }
  }

  // ---------- Pointer ----------
  let dragging = $state(false);
  let dragPos = 0;
  let lastY = 0;

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
    dragging = true;
    dragPos = pos;
    lastY = e.clientY;
  }

  function onpointermove(e: PointerEvent) {
    if (!dragging) return;
    const dy = lastY - e.clientY;
    lastY = e.clientY;
    dragPos = clamp(dragPos + dy / (height * (e.shiftKey ? FINE_FACTOR : 1)), 0, 1);
    commit(posToGain(dragPos));
  }

  function endDrag() {
    dragging = false;
  }

  function onkeydown(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.002 : 0.02;
    let p = pos;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        p += step;
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        p -= step;
        break;
      case 'PageUp':
        p += 0.1;
        break;
      case 'PageDown':
        p -= 0.1;
        break;
      case 'Home':
        commit(0);
        e.preventDefault();
        return;
      case 'End':
        commit(max);
        e.preventDefault();
        return;
      default:
        return;
    }
    e.preventDefault();
    commit(posToGain(clamp(p, 0, 1)));
  }
</script>

<div class="fader">
  <div
    class="track-area"
    class:active={dragging}
    style:height={`${height}px`}
    role="slider"
    tabindex="0"
    aria-label={label}
    aria-orientation="vertical"
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={text}
    {onpointerdown}
    {onpointermove}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    onlostpointercapture={endDrag}
    ondblclick={() => commit(defaultValue)}
    {onkeydown}
  >
    <div class="scale" aria-hidden="true">
      {#each MARKS as db (db)}
        <span class="mark" style:bottom={`${dbToPos(db) * 100}%`}>{db > 0 ? `+${db}` : db < 0 ? `−${-db}` : '0'}</span>
      {/each}
      <span class="mark" style:bottom="0%">−∞</span>
    </div>
    <div class="slot" aria-hidden="true"></div>
    <div class="cap" style:bottom={`${pos * 100}%`} aria-hidden="true"></div>
  </div>
  <div class="value" class:active={dragging}>{text}</div>
</div>

<style>
  .fader {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }
  .track-area {
    position: relative;
    width: 62px;
    cursor: ns-resize;
    touch-action: none;
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  .track-area:focus-visible {
    outline: 1px solid var(--border-strong);
  }
  .scale {
    position: absolute;
    inset: 0 auto 0 0;
    width: 30px;
  }
  .mark {
    position: absolute;
    left: 0;
    right: 0;
    text-align: center;
    transform: translateY(50%);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1;
    color: var(--text-muted);
    user-select: none;
  }
  .slot {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 46px;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--knob-track);
  }
  .cap {
    position: absolute;
    left: 46px;
    width: 26px;
    height: 12px;
    margin-left: -13px;
    transform: translateY(50%);
    border-radius: 3px;
    border: 1px solid var(--border-strong);
    background: linear-gradient(var(--surface-knob-hover), var(--surface-knob));
    box-shadow: var(--shadow-knob-box, 0 1px 3px rgb(0 0 0 / 0.5));
  }
  .cap::after {
    content: '';
    position: absolute;
    left: 3px;
    right: 3px;
    top: 50%;
    height: 2px;
    margin-top: -1px;
    background: var(--text-strong);
    border-radius: 1px;
  }
  .track-area:hover .cap,
  .track-area.active .cap {
    background: linear-gradient(var(--surface-control-hover), var(--surface-knob-hover));
  }
  .value {
    min-width: 60px;
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-default);
    user-select: none;
    white-space: nowrap;
  }
  .value.active {
    color: var(--signal-audio);
  }
</style>
