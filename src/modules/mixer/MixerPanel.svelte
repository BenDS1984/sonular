<script lang="ts">
  import Meter from '../../ui/components/Meter.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const CHANNELS = [1, 2, 3, 4];
</script>

<div class="mixer">
  {#each CHANNELS as ch (ch)}
    <div class="strip">
      <ParamKnob {module} {def} param={`gain${ch}`} size="sm" label={`Ch ${ch}`} />
      <ParamKnob {module} {def} param={`pan${ch}`} size="sm" />
      <div class="foot">
        <Toggle
          pressed={(module.params[`mute${ch}`] ?? 0) >= 0.5}
          label="M"
          title={`Mute channel ${ch}`}
          tone="danger"
          onchange={(p) => (module.params[`mute${ch}`] = p ? 1 : 0)}
        />
        <Meter level={meterValue(module.id, `meter${ch}`)} height={52} label={`Channel ${ch} level`} />
      </div>
    </div>
  {/each}
  <div class="strip main">
    <ParamKnob {module} {def} param="main" />
    <div class="meters">
      <Meter level={meterValue(module.id, 'mainL')} height={96} label="Main left" />
      <Meter level={meterValue(module.id, 'mainR')} height={96} label="Main right" />
    </div>
  </div>
</div>

<style>
  .mixer {
    display: flex;
    gap: var(--space-2);
  }
  .strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
  }
  .foot {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .strip.main {
    border-left: 1px solid var(--border-subtle);
    padding-left: var(--space-3);
  }
  .meters {
    display: flex;
    gap: 4px;
  }
</style>
