<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import { displayValues } from '../../engine/engine.svelte';
  import { SCOPE_COLUMNS } from '../../engine/modules/Scope';
  import { patch } from '../../patch/patch.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const W = 240;
  const H = 120;
  const MARGIN = 4;
  const C = SCOPE_COLUMNS;

  const TRIGGER_OPTIONS = [
    { value: 'auto', label: 'Auto', title: 'A repeating wave stands still' },
    { value: 'free', label: 'Free', title: 'The picture runs freely' },
  ] as const;
  type TriggerMode = (typeof TRIGGER_OPTIONS)[number]['value'];

  const trigger: TriggerMode = $derived(Math.round(module.params.trigger ?? 0) === 1 ? 'free' : 'auto');

  /** Channels with a cable in: only those are drawn. */
  const connected = $derived({
    a: patch.cables.some((c) => c.to.module === module.id && c.to.port === 'a'),
    b: patch.cables.some((c) => c.to.module === module.id && c.to.port === 'b'),
  });

  /**
   * Outline of one channel: the highest values from left to right, then the lowest back. A thin
   * wave gives a line; a dense one (long time windows) a filled band.
   */
  function outline(values: Float32Array, channel: number, gain: number): string {
    const base = channel * 2 * C;
    const amp = (H / 2 - MARGIN) * gain;
    const y = (v: number) => Math.max(1, Math.min(H - 1, H / 2 - v * amp)).toFixed(1);
    const x = (c: number) => (((c + 0.5) / C) * W).toFixed(1);
    let d = '';
    for (let c = 0; c < C; c++) d += `${c ? 'L' : 'M'}${x(c)} ${y(values[base + C + c]!)}`;
    for (let c = C - 1; c >= 0; c--) d += `L${x(c)} ${y(values[base + c]!)}`;
    return d + 'Z';
  }

  const traces = $derived.by(() => {
    const values = displayValues(module.id);
    if (!values || values.length < 4 * C) return { a: '', b: '' };
    const gain = module.params.scale ?? 1;
    return {
      a: connected.a ? outline(values, 0, gain) : '',
      b: connected.b ? outline(values, 1, gain) : '',
    };
  });

  const GRID_X = [1, 2, 3, 4, 5, 6, 7].map((i) => (i / 8) * W);
  const GRID_Y = [1, 3].map((i) => (i / 4) * H);
</script>

<div class="scope">
  <div class="screen lcd" style:height={`${H}px`}>
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Oscilloscope screen">
      {#each GRID_X as x (x)}
        <line class="grid" x1={x} y1="0" x2={x} y2={H} />
      {/each}
      {#each GRID_Y as y (y)}
        <line class="grid" x1="0" y1={y} x2={W} y2={y} />
      {/each}
      <line class="axis" x1="0" y1={H / 2} x2={W} y2={H / 2} />
      {#if traces.b}
        <path class="trace b" d={traces.b} />
      {/if}
      {#if traces.a}
        <path class="trace a" d={traces.a} />
      {/if}
    </svg>
    <div class="legend" aria-hidden="true">
      <span class="a" class:off={!connected.a}>A</span>
      <span class="b" class:off={!connected.b}>B</span>
    </div>
  </div>
  <div class="row">
    <ParamKnob {module} {def} param="time" />
    <ParamKnob {module} {def} param="scale" />
    <div class="trigger">
      <Segmented
        value={trigger}
        options={[...TRIGGER_OPTIONS]}
        label="Trigger"
        onchange={(v) => (module.params.trigger = v === 'free' ? 1 : 0)}
      />
      <span>Trigger</span>
    </div>
  </div>
</div>

<style>
  .scope {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .screen {
    position: relative;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .grid {
    stroke: var(--border-subtle);
    stroke-width: 1;
    stroke-dasharray: 2 3;
    opacity: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .axis {
    stroke: var(--border-subtle);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .trace {
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .trace.a {
    --trace: var(--signal-audio);
  }
  .trace.b {
    --trace: var(--signal-cv);
  }
  .trace {
    stroke: var(--trace);
    fill: color-mix(in srgb, var(--trace) 35%, transparent);
    filter: drop-shadow(0 0 3px var(--trace));
  }
  .legend {
    position: absolute;
    top: 4px;
    right: 6px;
    display: flex;
    gap: 6px;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }
  .legend .a {
    color: var(--signal-audio);
  }
  .legend .b {
    color: var(--signal-cv);
  }
  .legend .off {
    opacity: 0.3;
  }
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .trigger {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding-top: 6px;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
