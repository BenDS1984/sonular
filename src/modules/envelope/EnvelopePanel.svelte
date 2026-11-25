<script lang="ts">
  import { engineState, meterValue } from '../../engine/engine.svelte';
  import ParamSlider from '../ParamSlider.svelte';
  import type { ModulePanelProps } from '../types';
  import { dotAt, shape } from './curve';

  let { module, def }: ModulePanelProps = $props();

  const W = 178;
  const H = 62;
  const PAD = 6;

  const attack = $derived(module.params.attack ?? 0.005);
  const decay = $derived(module.params.decay ?? 0.3);
  const sustain = $derived(module.params.sustain ?? 0.5);
  const release = $derived(module.params.release ?? 0.4);

  const sx = (x: number) => PAD + x * (W - 2 * PAD);
  const sy = (y: number) => H - PAD - y * (H - 2 * PAD);

  /** The envelope as a line and as a filled shape under it. */
  const drawn = $derived.by(() => {
    const pts = shape(attack, decay, sustain, release);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join('');
    return { line, area: `${line}L${sx(1).toFixed(1)} ${sy(0).toFixed(1)}L${sx(0).toFixed(1)} ${sy(0).toFixed(1)}Z` };
  });

  /** The live dot: where on the curve the envelope is now (only while it plays). */
  const dot = $derived.by(() => {
    if (!engineState.playing) return null;
    const stage = Math.round(meterValue(module.id, 'stage'));
    return dotAt(stage, meterValue(module.id, 'level'), attack, decay, sustain, release);
  });
</script>

<div class="env">
  <div class="screen lcd">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The shape of the envelope">
      <line class="axis" x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(0)} />
      <line class="axis top" x1={sx(0)} y1={sy(1)} x2={sx(1)} y2={sy(1)} />
      <path class="area" d={drawn.area} />
      <path class="line" d={drawn.line} />
      {#if dot}
        <circle class="dot" cx={sx(dot[0])} cy={sy(dot[1])} r="3.5" />
      {/if}
    </svg>
  </div>
  <div class="sliders">
    <ParamSlider {module} {def} param="attack" label="A" height={64} />
    <ParamSlider {module} {def} param="decay" label="D" height={64} />
    <ParamSlider {module} {def} param="sustain" label="S" height={64} />
    <ParamSlider {module} {def} param="release" label="R" height={64} />
  </div>
</div>

<style>
  .env {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .screen {
    background: var(--surface-inset);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .axis {
    stroke: var(--border-default);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .axis.top {
    stroke: var(--border-subtle);
    stroke-dasharray: 2 3;
    opacity: 0.6;
  }
  .area {
    fill: var(--signal-cv);
    opacity: 0.18;
  }
  .line {
    fill: none;
    stroke: var(--signal-cv);
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px var(--signal-cv));
  }
  .dot {
    fill: var(--text-strong);
    filter: drop-shadow(0 0 3px var(--signal-cv));
  }
  .sliders {
    display: flex;
    justify-content: space-between;
  }
</style>
