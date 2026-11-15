<script lang="ts">
  import Meter from '../../ui/components/Meter.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();
</script>

<div class="output">
  <div class="meters">
    <Meter level={meterValue(module.id, 'meterL')} height={110} width={10} label="Output left" />
    <Meter level={meterValue(module.id, 'meterR')} height={110} width={10} label="Output right" />
  </div>
  <ParamKnob {module} {def} param="volume" size="lg" />
</div>

<style>
  .output {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }
  .meters {
    display: flex;
    gap: 6px;
    padding: var(--space-2) 0;
  }
</style>
