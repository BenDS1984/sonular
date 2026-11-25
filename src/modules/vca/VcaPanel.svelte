<script lang="ts">
  import Meter from '../../ui/components/Meter.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import { smoothed } from '../../ui/smoothed.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  // Tall enough to make the module 280 high, like the Oscillator and Reverb.
  const METER_HEIGHT = 124;

  // The gain (level × cv): 0 (closed) .. 1 (fully open).
  const target = $derived(Math.min(1, Math.max(0, meterValue(module.id, 'gain'))));
  // Calmer for fast sequences: opens at once, closes gradually.
  const smooth = smoothed(() => target, 0.12);
  const gain = $derived(smooth.value);
</script>

<div class="vca">
  <div class="col">
    <Meter level={meterValue(module.id, 'in')} height={METER_HEIGHT} label="Input level" />
    <span class="cap">in</span>
  </div>
  <div class="col">
    <div class="open" role="meter" aria-label="Gain" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(gain * 100)}>
      <div class="fill" style:height={`${gain * 100}%`}></div>
    </div>
    <span class="cap">{Math.round(gain * 100)}%</span>
  </div>
  <div class="col">
    <Meter level={meterValue(module.id, 'out')} height={METER_HEIGHT} label="Output level" />
    <span class="cap">out</span>
  </div>
  <div class="knob">
    <ParamKnob {module} {def} param="level" />
  </div>
</div>

<style>
  .vca {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .cap {
    /* Fixed width, so "100%" does not push the other elements aside. */
    width: 32px;
    text-align: center;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  /* The VCA's opening: the fuller, the more sound passes through. */
  .open {
    position: relative;
    display: flex;
    align-items: flex-end;
    width: 14px;
    height: 124px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    overflow: hidden;
  }
  .fill {
    width: 100%;
    background: var(--signal-cv);
  }
  .knob {
    margin-left: auto;
    margin-right: 10px;
  }
</style>
