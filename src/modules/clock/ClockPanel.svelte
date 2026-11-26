<script lang="ts">
  import Led from '../../ui/components/Led.svelte';
  import { engineState } from '../../engine/engine.svelte';
  import { patch } from '../../patch/patch.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const OUTPUTS = [1, 2, 3, 4];

  // The beat light flashes on every quarter note while playing.
  const beatOn = $derived(engineState.playing && engineState.beat % 1 < 0.25 ? 1 : 0);
</script>

<div class="clock">
  <div class="display lcd">
    <Led level={beatOn} label="Beat" />
    <span class="tempo">{Math.round(patch.tempo)}</span>
    <span class="unit">BPM</span>
  </div>
  <div class="outs">
    {#each OUTPUTS as n (n)}
      <div class="out">
        <ParamKnob {module} {def} param={`ratio${n}`} size="sm" />
      </div>
    {/each}
  </div>
</div>

<style>
  .clock {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .display {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-inset);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .display :global(.led) {
    align-self: center;
    margin-right: 4px;
  }
  .tempo {
    font-size: var(--text-xl);
    color: var(--text-strong);
  }
  .unit {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .outs {
    display: flex;
    justify-content: space-between;
  }
  .out {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
</style>
