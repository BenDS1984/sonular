<!-- A row of mutually exclusive options, e.g. oscillator waveform. -->
<script lang="ts" generics="T extends string">
  import type { SignalType } from '../signals';

  interface Option {
    value: T;
    label: string;
    title?: string;
  }

  interface Props {
    value: T;
    options: Option[];
    label?: string;
    signal?: SignalType;
    onchange?: (value: T) => void;
  }

  let { value = $bindable(), options, label = '', signal = 'audio', onchange }: Props = $props();

  function select(v: T) {
    if (v === value) return;
    value = v;
    onchange?.(v);
  }
</script>

<div
  class="segmented"
  role="radiogroup"
  aria-label={label}
  style:--seg-accent={`var(--signal-${signal})`}
  style:--seg-accent-soft={`var(--signal-${signal}-soft)`}
  style:--seg-accent-bg={`var(--signal-${signal}-bg)`}
>
  {#each options as opt (opt.value)}
    <button
      type="button"
      role="radio"
      aria-checked={opt.value === value}
      class:selected={opt.value === value}
      title={opt.title ?? opt.label}
      onclick={() => select(opt.value)}
    >
      {opt.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
  }
  button {
    height: 20px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  button:hover {
    color: var(--text-default);
  }
  button.selected {
    background: var(--seg-accent-bg);
    border-color: var(--seg-accent);
    color: var(--seg-accent-soft);
  }
</style>
