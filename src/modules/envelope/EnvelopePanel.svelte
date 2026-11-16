<script lang="ts">
  import Led from '../../ui/components/Led.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();
</script>

<div class="env">
  <div class="grid">
    <ParamKnob {module} {def} param="attack" />
    <ParamKnob {module} {def} param="decay" />
    <ParamKnob {module} {def} param="sustain" />
    <ParamKnob {module} {def} param="release" />
  </div>
  <div class="level">
    <Led level={meterValue(module.id, 'level')} signal="cv" label="Envelope level" />
    <span>level</span>
  </div>
</div>

<style>
  .env {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    justify-items: center;
    gap: var(--space-3);
  }
  .level {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
