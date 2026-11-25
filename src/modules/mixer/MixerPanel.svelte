<script lang="ts">
  import Meter from '../../ui/components/Meter.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const CHANNELS = [1, 2, 3, 4];
  // The meters are as tall as the two knobs of a strip.
  const METER_HEIGHT = 132;
</script>

<div class="mixer">
  {#each CHANNELS as ch (ch)}
    <div class="strip">
      <div class="body">
        <div class="knobs">
          <ParamKnob {module} {def} param={`gain${ch}`} size="sm" label={`Ch ${ch}`} />
          <ParamKnob {module} {def} param={`pan${ch}`} size="sm" />
        </div>
        <Meter level={meterValue(module.id, `meter${ch}`)} height={METER_HEIGHT} label={`Channel ${ch} level`} />
      </div>
      <div class="switches">
        <Toggle
          pressed={(module.params[`mute${ch}`] ?? 0) >= 0.5}
          label="M"
          title={`Mute channel ${ch}`}
          tone="danger"
          onchange={(p) => (module.params[`mute${ch}`] = p ? 1 : 0)}
        />
        <Toggle
          pressed={(module.params[`solo${ch}`] ?? 0) >= 0.5}
          label="S"
          title={`Solo channel ${ch}: hear only the soloed channels`}
          tone="solo"
          onchange={(p) => (module.params[`solo${ch}`] = p ? 1 : 0)}
        />
      </div>
    </div>
  {/each}
  <div class="strip main">
    <div class="body">
      <div class="knobs">
        <ParamKnob {module} {def} param="main" />
      </div>
      <div class="meters">
        <Meter level={meterValue(module.id, 'mainL')} height={METER_HEIGHT} label="Main left" />
        <Meter level={meterValue(module.id, 'mainR')} height={METER_HEIGHT} label="Main right" />
      </div>
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
    align-items: stretch;
    gap: var(--space-2);
    flex: 1;
  }
  /* Knobs on the left, the level meter beside them. */
  .body {
    display: flex;
    justify-content: center;
    align-items: stretch;
    gap: 8px;
  }
  .knobs {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }
  .strip.main {
    flex: 0 0 auto;
    border-left: 1px solid var(--border-subtle);
    padding-left: var(--space-3);
  }
  .strip.main .knobs {
    justify-content: center;
  }
  .switches {
    display: flex;
    gap: 4px;
  }
  .switches :global(.toggle) {
    flex: 1;
  }
  .meters {
    display: flex;
    gap: 4px;
  }
</style>
