<!--
  A patch point (jack), always drawn in its signal colour so you can see what fits where.
  Outputs sit on a darker plate (drawn by the module footer), so direction is readable too.
  Cable dragging is handled by the workspace through the data-* attributes on the jack.
-->
<script lang="ts">
  import { SIGNAL_LABELS, type SignalType } from '../signals';

  interface Props {
    kind: 'in' | 'out';
    signal?: SignalType;
    label?: string;
    connected?: boolean;
    /** Owning module and port id; makes the jack patchable on the canvas. */
    moduleId?: string;
    portId?: string;
    /** A valid target while a cable is being dragged. */
    target?: boolean;
    /** The cable being dragged would land here on release. */
    active?: boolean;
  }

  let {
    kind,
    signal = 'audio',
    label = '',
    connected = false,
    moduleId,
    portId,
    target = false,
    active = false,
  }: Props = $props();

  const title = $derived(`${label || kind} — ${SIGNAL_LABELS[signal]} ${kind === 'in' ? 'input' : 'output'}`);
</script>

<div class="port" style:--port-color={`var(--signal-${signal})`} {title}>
  <span
    class="jack {kind}"
    class:connected
    class:target
    class:active
    data-port-kind={kind}
    data-signal={signal}
    data-module={moduleId}
    data-port={portId}
  ></span>
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
    border: 3px solid var(--port-color);
    box-shadow: var(--shadow-hole);
    cursor: crosshair;
    touch-action: none;
    transition:
      border-color var(--duration-fast) var(--ease-out),
      box-shadow var(--duration-fast) var(--ease-out),
      transform var(--duration-fast) var(--ease-out);
  }
  .jack:hover,
  .jack.target {
    box-shadow: var(--shadow-hole), 0 0 0 3px color-mix(in srgb, var(--port-color) 25%, transparent);
  }
  .jack.active {
    transform: scale(1.25);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--port-color) 45%, transparent);
  }
  .jack.connected::after {
    content: '';
    position: absolute;
    inset: 2px;
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
