<!--
  A knob bound to one parameter of a module instance; range, scale and display come from its spec.
  Right-click for automation. An automated knob has a ring in the automation colour and follows its
  lane while the song plays.
-->
<script lang="ts">
  import Knob from '../ui/components/Knob.svelte';
  import type { SignalType } from '../ui/signals';
  import type { ModuleInstance } from '../patch/types';
  import { paramFormatter } from './paramFormat';
  import { isAutomated, isOverridden, isRecordingControl, openControlMenu, setControl, shownValue } from '../ui/automation.svelte';
  import type { ModuleDefinition } from './types';

  interface Props {
    module: ModuleInstance;
    def: ModuleDefinition;
    param: string;
    size?: 'sm' | 'md' | 'lg';
    /** Override the label from the spec (e.g. "Ch 1"). */
    label?: string;
    signal?: SignalType;
  }

  let { module, def, param, size = 'md', label, signal }: Props = $props();

  const spec = $derived(def.params.find((p) => p.id === param));
  const format = $derived(spec ? paramFormatter(spec) : undefined);
  const automated = $derived(isAutomated(module, param));
  const recording = $derived(isRecordingControl(module, param));
  const overridden = $derived(automated && !recording && isOverridden(module, param));
</script>

{#if spec}
  <!-- svelte-ignore a11y_no_static_element_interactions (right-click menu; keyboard users reach automation from the timeline) -->
  <div
    class="param-knob"
    class:automated
    class:overridden
    class:recording
    title={recording
      ? 'Recording automation'
      : overridden
      ? 'Automation paused: you turned this knob. It follows its automation again at the next Play.'
      : automated
        ? 'Automated — right-click for options'
        : undefined}
    oncontextmenu={(e) => openControlMenu(e, module, param, `${def.title} · ${label ?? spec.label}`)}
  >
  <Knob
    value={shownValue(module, param)}
    onchange={(v) => setControl(module, param, v)}
    min={spec.min}
    max={spec.max}
    defaultValue={spec.default}
    step={spec.step ?? 0}
    scale={spec.scale ?? 'linear'}
    bipolar={spec.bipolar ?? false}
    {size}
    label={label ?? spec.label}
    {format}
    signal={signal ?? def.signal}
  />
  </div>
{/if}

<style>
  .param-knob {
    display: contents;
  }
  /* Automated: a ring in the automation colour around the knob. */
  .param-knob.automated :global(.knob svg) {
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--automation);
  }
  /* Taken over: a dashed ring until the next Play. */
  .param-knob.overridden :global(.knob svg) {
    box-shadow: none;
    outline: 2px dashed var(--automation);
    outline-offset: 0;
  }
  /* Being recorded: a red ring while it is turned. */
  .param-knob.recording :global(.knob svg) {
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--danger);
  }
</style>
