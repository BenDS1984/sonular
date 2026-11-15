<!--
  A patch point (jack). Outputs are drawn in their signal colour, inputs in neutral grey,
  so the direction of every cable is readable at a glance.
  Cable dragging is added in step 4; for now the port is visual only.
-->
<script lang="ts">
  import { SIGNAL_LABELS, type SignalType } from '../signals';

  interface Props {
    kind: 'in' | 'out';
    signal?: SignalType;
    label?: string;
    connected?: boolean;
  }

  let { kind, signal = 'audio', label = '', connected = false }: Props = $props();

  const title = $derived(`${label || kind} — ${SIGNAL_LABELS[signal]} ${kind === 'in' ? 'input' : 'output'}`);
</script>

<div class="port" style:--port-color={`var(--signal-${signal})`} {title}>
  <span class="jack {kind}" class:connected data-port-kind={kind} data-signal={signal}></span>
  {#if label}<span class="label">{label}</span>{/if}
</div>

<style>
  .port {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 28px;
  }
  .jack {
    position: relative;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--surface-inset);
    border: 2px solid var(--border-strong);
    cursor: crosshair;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out);
  }
  .jack.out {
    border-color: var(--port-color);
  }
  .jack:hover {
    border-color: var(--port-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--port-color) 25%, transparent);
  }
  .jack.connected::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--port-color);
  }
  .label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    user-select: none;
    line-height: 1;
  }
</style>
