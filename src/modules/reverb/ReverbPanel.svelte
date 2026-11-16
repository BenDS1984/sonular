<script lang="ts">
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();
</script>

<div class="grid">
  <ParamKnob {module} {def} param="size" />
  <ParamKnob {module} {def} param="predelay" />
  <ParamKnob {module} {def} param="damping" />
  <ParamKnob {module} {def} param="mix" />
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    justify-items: center;
    gap: var(--space-3);
  }
</style>
