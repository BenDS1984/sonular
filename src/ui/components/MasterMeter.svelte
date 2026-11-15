<!--
  Compact horizontal stereo meter for the top bar (−60 … +6 dB), with peak hold.
  Values come from the engine's own measurement, so browser privacy features can't distort them.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    left: number;
    right: number;
    active?: boolean;
    /** Changes on every new measurement, so the fall-off continues while the values repeat. */
    tick?: number;
  }

  let { left, right, active = true, tick = 0 }: Props = $props();

  const MIN_DB = -60;
  const MAX_DB = 6;
  const pos = (g: number) => (g <= 1e-6 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(g) - MIN_DB) / (MAX_DB - MIN_DB))));
  const zeroDb = ((0 - MIN_DB) / (MAX_DB - MIN_DB)) * 100;
  const warn = ((-12 - MIN_DB) / (MAX_DB - MIN_DB)) * 100;

  // Ballistics: instant rise, smooth fall, so the meter stays readable at ~20 updates per second.
  let shownL = $state(0);
  let shownR = $state(0);
  $effect(() => {
    void tick;
    const l = active ? left : 0;
    const r = active ? right : 0;
    untrack(() => {
      if (!active) {
        shownL = 0;
        shownR = 0;
        return;
      }
      shownL = l >= shownL ? l : Math.max(l, shownL * 0.7);
      shownR = r >= shownR ? r : Math.max(r, shownR * 0.7);
    });
  });

  const peakDb = $derived.by(() => {
    const p = Math.max(shownL, shownR);
    return p <= 1e-5 ? '−∞' : (20 * Math.log10(p)).toFixed(1).replace('-', '−');
  });
</script>

<div class="master" title="Master output level" style:--zero={`${zeroDb}%`} style:--warn={`${warn}%`}>
  <div class="bars">
    {#each [shownL, shownR] as v, i (i)}
      <div class="bar">
        <div class="lit" style:clip-path={`inset(0 ${((1 - pos(v)) * 100).toFixed(2)}% 0 0)`}></div>
        <div class="tick"></div>
      </div>
    {/each}
  </div>
  <span class="db">{peakDb} dB</span>
</div>

<style>
  .master {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 8px;
    background: var(--surface-control);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: 110px;
  }
  .bar {
    position: relative;
    height: 5px;
    background: var(--surface-inset);
    border-radius: 2px;
    overflow: hidden;
  }
  .lit {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to right,
      var(--meter-low) 0%,
      var(--meter-low) var(--warn),
      var(--meter-mid) var(--warn),
      var(--meter-mid) var(--zero),
      var(--meter-high) var(--zero)
    );
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--zero);
    width: 1px;
    background: rgb(255 255 255 / 0.25);
  }
  .db {
    min-width: 52px;
    text-align: right;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
</style>
