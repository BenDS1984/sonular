<!--
  The light at the right of a sequencer's row on the timeline: it burns while the sequencer's gate is
  open. The engine reports whether a gate was high at any time since its last report, so even a short
  gate lights it; it stays lit a moment longer, so a short gate can be seen.
-->
<script lang="ts">
  import { engineState, meterValueIn } from '../../engine/engine.svelte';
  import Led from '../components/Led.svelte';

  let { patch, module, meter = 'gate', label = 'Gate' }: { patch: string; module: string; meter?: string; label?: string } = $props();

  /** How long the light stays on after a report with an open gate (ms). */
  const HOLD_MS = 90;

  const open = $derived(engineState.playing && meterValueIn(patch, module, meter) > 0.5);
  let lit = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    void engineState.statsTick; // every report renews the hold, also when the gate stays open
    if (open) {
      lit = true;
      clearTimeout(timer);
      timer = setTimeout(() => (lit = false), HOLD_MS);
    } else if (!engineState.playing) {
      clearTimeout(timer);
      lit = false;
    }
  });
  $effect(() => () => clearTimeout(timer));
</script>

<span class="gate" title={`${label}: lights while it is open`}>
  <Led level={lit ? 1 : 0} signal="gate" />
</span>

<style>
  .gate {
    display: inline-flex;
    margin-left: 6px;
  }
</style>
