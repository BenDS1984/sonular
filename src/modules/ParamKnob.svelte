<!-- A knob bound to one parameter of a module instance; range, scale and display come from its spec. -->
<script lang="ts">
  import Knob from '../ui/components/Knob.svelte';
  import type { SignalType } from '../ui/signals';
  import type { ModuleInstance } from '../patch/types';
  import { paramFormatter } from './paramFormat';
  import type { ModuleDefinition } from './types';

  interface Props {
    module: ModuleInstance;
    def: ModuleDefinition;
    param: string;
    size?: 'sm' | 'md' | 'lg';
    /** Override the label from the spec (e.g. "Ch 1"). */
    label?: string;
    signal?: SignalType;
    disabled?: boolean;
  }

  let { module, def, param, size = 'md', label, signal, disabled = false }: Props = $props();

  const spec = $derived(def.params.find((p) => p.id === param));
  const format = $derived(spec ? paramFormatter(spec) : undefined);
</script>

{#if spec}
  <Knob
    bind:value={module.params[param]!}
    min={spec.min}
    max={spec.max}
    defaultValue={spec.default}
    step={spec.step ?? 0}
    scale={spec.scale ?? 'linear'}
    bipolar={spec.bipolar ?? false}
    {size}
    {disabled}
    label={label ?? spec.label}
    {format}
    signal={signal ?? def.signal}
  />
{/if}
