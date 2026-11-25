<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const TYPES = [
    { value: '0', label: 'LP', title: 'Low-pass: lets the lows through, removes the highs' },
    { value: '1', label: 'BP', title: 'Band-pass: lets a band around the cutoff through' },
    { value: '2', label: 'HP', title: 'High-pass: lets the highs through, removes the lows' },
  ];
</script>

<div class="filter">
  <Segmented
    value={String(Math.round(module.params.type ?? 0))}
    options={TYPES}
    label="Filter type"
    onchange={(v) => (module.params.type = Number(v))}
  />
  <div class="row">
    <ParamKnob {module} {def} param="cutoff" />
    <ParamKnob {module} {def} param="resonance" />
    <ParamKnob {module} {def} param="mod" />
  </div>
</div>

<style>
  .filter {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .row {
    display: flex;
    justify-content: space-between;
  }
</style>
