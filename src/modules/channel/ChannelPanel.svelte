<!--
  The Channel module's panel: the channel strip of the patch shown in the workspace.
-->
<script lang="ts">
  import ChannelStrip from './ChannelStrip.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import { patch } from '../../patch/patch.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();
</script>

<ChannelStrip
  target={patch}
  {module}
  {def}
  meterL={meterValue(module.id, 'meterL')}
  meterR={meterValue(module.id, 'meterR')}
/>
