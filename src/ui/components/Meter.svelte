<!--
  Vertical peak meter on a dB scale (−60 dB … +6 dB).
  `level` is a linear peak amplitude (1.0 = 0 dBFS), fed by the caller every frame.
  Shows a peak-hold line and a latching clip LED (click to reset).
-->
<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    level: number;
    height?: number;
    width?: number;
    label?: string;
  }

  let { level, height = 80, width = 6, label = '' }: Props = $props();

  const MIN_DB = -60;
  const MAX_DB = 6;
  const HOLD_MS = 1000;
  const HOLD_DECAY = 0.94;

  function dbToPos(db: number): number {
    return Math.min(1, Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB)));
  }
  function gainToPos(gain: number): number {
    return gain <= 1e-6 ? 0 : dbToPos(20 * Math.log10(gain));
  }

  let hold = $state(0);
  let holdAt = 0;
  let clipped = $state(false);
  let decayFrame = 0;

  // Peak hold must keep falling even when `level` stops changing (e.g. silence),
  // so the decay runs on its own animation frame until it reaches the level.
  function decay() {
    decayFrame = 0;
    if (performance.now() - holdAt > HOLD_MS) hold = Math.max(level, hold * HOLD_DECAY);
    if (hold <= 1e-6) hold = 0;
    if (hold > level) decayFrame = requestAnimationFrame(decay);
  }

  $effect(() => {
    const l = level;
    untrack(() => {
      if (l >= hold) {
        hold = l;
        holdAt = performance.now();
      } else if (!decayFrame) {
        decayFrame = requestAnimationFrame(decay);
      }
      if (l > 1) clipped = true;
    });
  });

  $effect(() => () => cancelAnimationFrame(decayFrame));

  const fill = $derived(gainToPos(level));
  const holdPos = $derived(gainToPos(hold));
  // Colour zones: green below −12 dB, yellow up to 0 dB, red above.
  const warnStop = `${(dbToPos(-12) * 100).toFixed(1)}%`;
  const clipStop = `${(dbToPos(0) * 100).toFixed(1)}%`;
  const zeroDbFromBottom = `${(dbToPos(0) * 100).toFixed(1)}%`;
</script>

<div class="meter" title={label}>
  <button
    class="clip"
    class:on={clipped}
    type="button"
    title={clipped ? 'Clipped — click to reset' : 'Clip indicator'}
    aria-label="Reset clip indicator"
    onclick={() => (clipped = false)}
  ></button>
  <div
    class="bar lcd small"
    style:height={`${height}px`}
    style:width={`${width}px`}
    style:--warn-stop={warnStop}
    style:--clip-stop={clipStop}
  >
    <div class="lit" style:clip-path={`inset(${((1 - fill) * 100).toFixed(2)}% 0 0 0)`}></div>
    <div class="zero" style:bottom={zeroDbFromBottom}></div>
    {#if holdPos > 0}
      <div class="hold" style:bottom={`calc(${(holdPos * 100).toFixed(2)}% - 1px)`}></div>
    {/if}
  </div>
</div>

<style>
  .meter {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }
  .clip {
    width: 8px;
    height: 4px;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: var(--border-default);
    cursor: pointer;
  }
  .clip.on {
    background: var(--meter-high);
  }
  .bar {
    position: relative;
    background: var(--surface-inset);
    border-radius: 3px;
    overflow: hidden;
  }
  .lit {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to top,
      var(--meter-low) 0%,
      var(--meter-low) var(--warn-stop),
      var(--meter-mid) var(--warn-stop),
      var(--meter-mid) var(--clip-stop),
      var(--meter-high) var(--clip-stop)
    );
  }
  .zero {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: rgb(255 255 255 / 0.18);
  }
  .hold {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--text-strong);
    opacity: 0.8;
  }
</style>
