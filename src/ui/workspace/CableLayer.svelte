<!--
  All cables, drawn above the modules in canvas coordinates.

  Each cable also has a wide invisible hit path for hovering and selecting, but that lives in a
  second layer *below* the modules: wherever a cable crosses a module, the module's knobs,
  buttons and jacks work as if the cable were not there. Cables are picked up where they run
  over empty canvas. Pressing on a cable end that sits on a jack starts a jack drag.
-->
<script lang="ts">
  import { canvasState, patch } from '../../patch/patch.svelte';
  import { cablePath } from '../../patch/geometry';
  import { getDefinition } from '../../modules/registry';
  import type { Cable } from '../../patch/types';
  import type { SignalType } from '../signals';
  import { interaction, portPosition } from './interaction.svelte';

  interface Props {
    /** Called when a press on a cable actually lands on a jack underneath it. */
    onjackpointerdown: (jack: HTMLElement, e: PointerEvent) => void;
  }

  let { onjackpointerdown }: Props = $props();

  let hovered = $state<string | null>(null);

  function signalOf(c: Cable): SignalType {
    const m = patch.modules.find((x) => x.id === c.from.module);
    const def = m && getDefinition(m.type);
    return def?.outputs.find((p) => p.id === c.from.port)?.signal ?? 'audio';
  }

  const drawn = $derived(
    patch.cables.flatMap((c) => {
      const a = portPosition(c.from);
      const b = portPosition(c.to);
      return a && b ? [{ cable: c, d: cablePath(a, b), signal: signalOf(c) }] : [];
    }),
  );

  const dragPath = $derived.by(() => {
    const drag = interaction.cable;
    if (!drag) return null;
    const fixed = portPosition(drag.fixed);
    if (!fixed) return null;
    const loose = drag.target ? (portPosition(drag.target) ?? drag.pointer) : drag.pointer;
    return drag.fixedKind === 'out' ? cablePath(fixed, loose) : cablePath(loose, fixed);
  });

  function onpointerdown(e: PointerEvent, cable: Cable) {
    if (e.button !== 0) return;
    // Cable ends overlap their jacks; if a jack is under the pointer, treat it as a jack press.
    const jack = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.port !== undefined);
    e.stopPropagation();
    if (jack) {
      onjackpointerdown(jack, e);
      return;
    }
    canvasState.selection = { kind: 'cable', id: cable.id };
  }
</script>

<svg class="cables hits" aria-hidden="true">
  {#each drawn as { cable, d } (cable.id)}
    <path
      class="hit"
      {d}
      role="presentation"
      onpointerenter={() => (hovered = cable.id)}
      onpointerleave={() => (hovered = null)}
      onpointerdown={(e) => onpointerdown(e, cable)}
    />
  {/each}
</svg>

<svg class="cables" aria-hidden="true">
  {#each drawn as { cable, d, signal } (cable.id)}
    {@const selected = canvasState.selection?.kind === 'cable' && canvasState.selection.id === cable.id}
    <g
      class="cable"
      class:hover={hovered === cable.id}
      class:selected
      style:--cable-color={`var(--signal-${signal})`}
    >
      <path class="shadow" {d} />
      <path class="line" {d} />
    </g>
  {/each}
  {#if dragPath && interaction.cable}
    <g class="cable dragging" style:--cable-color={`var(--signal-${interaction.cable.signal})`}>
      <path class="shadow" d={dragPath} />
      <path class="line" d={dragPath} />
    </g>
  {/if}
</svg>

<style>
  .cables {
    position: absolute;
    left: 0;
    top: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
    z-index: 100000;
  }
  /* Below every module (they stack from z-index 0), above the empty canvas. */
  .cables.hits {
    z-index: -1;
  }
  path {
    fill: none;
    stroke-linecap: round;
  }
  .shadow {
    stroke: var(--shadow-cable);
    stroke-width: 7;
    transform: translateY(2px);
  }
  .line {
    stroke: var(--cable-color);
    stroke-width: 4;
    opacity: 0.88;
    transition: opacity var(--duration-fast) var(--ease-out);
  }
  .hit {
    stroke: transparent;
    stroke-width: 16;
    pointer-events: stroke;
    cursor: pointer;
  }
  .cable.hover .line,
  .cable.dragging .line {
    opacity: 1;
  }
  .cable.selected .line {
    opacity: 1;
    stroke-width: 5.5;
  }
  .cable.selected .shadow {
    stroke: color-mix(in srgb, var(--cable-color) 35%, transparent);
    stroke-width: 11;
    transform: none;
  }
</style>
