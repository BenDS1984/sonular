<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const POLARITY = [
    { value: '0', label: 'Bi', title: 'Bipolar: the plain sum of the three signals' },
    { value: '1', label: 'Uni', title: 'Unipolar: the sum squeezed into 0…1' },
  ];
</script>

<div class="cvmix">
  <div class="row">
    <ParamKnob {module} {def} param="level1" />
    <ParamKnob {module} {def} param="level2" />
    <ParamKnob {module} {def} param="level3" />
  </div>
  <div class="polarity">
    <span>Polarity</span>
    <Segmented
      value={String(Math.round(module.params.polarity ?? 0))}
      options={POLARITY}
      label="Polarity"
      onchange={(v) => (module.params.polarity = Number(v))}
    />
  </div>
</div>

<style>
  .cvmix {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .polarity {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
