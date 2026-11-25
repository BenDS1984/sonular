<!-- A vertical slider bound to one parameter of a module instance; range, scale and display come from its spec. -->
<script lang="ts">
  import Slider from '../ui/components/Slider.svelte';
  import type { SignalType } from '../ui/signals';
  import type { ModuleInstance } from '../patch/types';
  import { paramFormatter } from './paramFormat';
  import type { ModuleDefinition } from './types';

  interface Props {
    module: ModuleInstance;
    def: ModuleDefinition;
    param: string;
    /** Height of the track in pixels. */
    height?: number;
    /** Override the label from the spec (e.g. "A"). */
    label?: string;
    signal?: SignalType;
  }

  let { module, def, param, height = 70, label, signal }: Props = $props();

  const spec = $derived(def.params.find((p) => p.id === param));
  // Without the space before the unit ('300ms'): sliders stand close together, so the readouts need the room.
  const format = $derived.by(() => {
    if (!spec) return undefined;
    const f = paramFormatter(spec);
    return (v: number) => f(v).replace(' ', '');
  });
</script>

{#if spec}
  <Slider
    bind:value={module.params[param]!}
    min={spec.min}
    max={spec.max}
    defaultValue={spec.default}
    step={spec.step ?? 0}
    scale={spec.scale ?? 'linear'}
    {height}
    label={label ?? spec.label}
    {format}
    signal={signal ?? def.signal}
  />
{/if}
