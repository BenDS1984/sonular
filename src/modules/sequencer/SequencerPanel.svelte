<script lang="ts">
  import Led from '../../ui/components/Led.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];

  // Meter "step" is 1..8 for the step playing, 0 before the first clock pulse.
  const current = $derived(Math.round(meterValue(module.id, 'step')));
</script>

<div class="steps">
  {#each STEPS as n (n)}
    {@const on = (module.params[`on${n}`] ?? 1) >= 0.5}
    <div class="step" class:off={!on}>
      <Led level={current === n ? 1 : 0} signal="pitch" label={current === n ? `Step ${n} playing` : ''} />
      <ParamKnob {module} {def} param={`pitch${n}`} size="sm" />
      <Toggle
        pressed={on}
        label={on ? 'On' : 'Off'}
        title={`Step ${n} on/off`}
        tone="gate"
        onchange={(p) => (module.params[`on${n}`] = p ? 1 : 0)}
      />
    </div>
  {/each}
</div>

<style>
  .steps {
    display: flex;
    justify-content: space-between;
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 44px;
  }
  .step :global(.toggle) {
    width: 34px;
  }
  .step.off :global(.knob) {
    opacity: 0.45;
  }
</style>
