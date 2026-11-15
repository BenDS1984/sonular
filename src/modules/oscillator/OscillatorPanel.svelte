<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import WaveDisplay from '../../ui/components/WaveDisplay.svelte';
  import { WAVEFORM_OPTIONS } from '../../ui/waveform';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const waveIndex = $derived(Math.max(0, Math.min(WAVEFORM_OPTIONS.length - 1, Math.round(module.params.wave ?? 0))));
  const wave = $derived(WAVEFORM_OPTIONS[waveIndex]!.value);
</script>

<div class="osc">
  <WaveDisplay {wave} amplitude={Math.min(1, (module.params.level ?? 0) / 0.8)} />
  <Segmented
    value={wave}
    options={WAVEFORM_OPTIONS}
    label="Waveform"
    onchange={(v) => (module.params.wave = WAVEFORM_OPTIONS.findIndex((o) => o.value === v))}
  />
  <div class="row">
    <ParamKnob {module} {def} param="tune" />
    <ParamKnob {module} {def} param="fine" />
    <ParamKnob {module} {def} param="level" />
  </div>
</div>

<style>
  .osc {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row {
    display: flex;
    justify-content: space-between;
  }
</style>
