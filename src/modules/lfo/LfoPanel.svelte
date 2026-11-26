<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import { engineState, meterValue } from '../../engine/engine.svelte';
  import { patch } from '../../patch/patch.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const W = 172;
  const H = 56;
  const PAD = 5;
  const POINTS = 120;

  const WAVES = [
    { value: '0', label: 'Sin', title: 'Sine: smooth up and down' },
    { value: '1', label: 'Tri', title: 'Triangle: straight up and down' },
    { value: '2', label: 'Saw', title: 'Saw: rises, then jumps back' },
    { value: '3', label: 'Sqr', title: 'Square: switches between high and low' },
    { value: '4', label: 'S&H', title: 'Random steps: a new random level every cycle' },
    { value: '5', label: 'Smo', title: 'Smooth random: glides to a new random level every cycle' },
  ];
  const POLARITY = [
    { value: '0', label: 'Bi', title: 'Bipolar: swings between −1 and +1' },
    { value: '1', label: 'Uni', title: 'Unipolar: swings between 0 and +1' },
  ];

  const wave = $derived(Math.round(module.params.wave ?? 0));
  const unipolar = $derived(Math.round(module.params.polarity ?? 0) === 1);
  const amount = $derived(module.params.amount ?? 1);
  const random = $derived(wave >= 4);

  /** Whether a clock is patched in: then Sync counts and Rate rests, otherwise the other way round. */
  const clocked = $derived(patch.cables.some((c) => c.to.module === module.id && c.to.port === 'clock'));

  /** The wave at place x (0..1) of one cycle (the random waves are not drawn: see the badge). */
  function value(x: number): number {
    if (wave === 0) return Math.sin(2 * Math.PI * x);
    if (wave === 1) return x < 0.25 ? 4 * x : x < 0.75 ? 2 - 4 * x : 4 * x - 4;
    if (wave === 2) return 2 * x - 1;
    if (wave === 3) return x < 0.5 ? 1 : -1;
    return 0;
  }

  /** Height on the screen of a wave value, with Amount and the polarity applied. */
  function y(v: number): number {
    const u = unipolar ? (0.5 * v + 0.5) * amount : v * amount;
    return unipolar ? H - PAD - u * (H - 2 * PAD) : H / 2 - u * (H / 2 - PAD);
  }

  const shape = $derived.by(() => {
    let line = '';
    for (let i = 0; i <= POINTS; i++) {
      const x = i / POINTS;
      line += `${i ? 'L' : 'M'}${(x * W).toFixed(1)} ${y(value(x)).toFixed(1)}`;
    }
    return line;
  });

  /** The moving dot: where the wave is now (only while playing). */
  const place = $derived(meterValue(module.id, 'phase'));
  const dotX = $derived(place * W);
  const dotY = $derived(y(value(Math.min(place, 1 - 1e-9))));
</script>

<div class="lfo">
  <div class="screen lcd">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="LFO wave">
      {#if random}
        <!-- The pattern is new at every Play, so no wave is drawn: just the dice and the name. -->
        <g class="hint" transform="translate(0 -4)">
          <rect x={W / 2 - 13} y={H / 2 - 20} width="26" height="26" rx="6" />
          <circle cx={W / 2 - 7} cy={H / 2 - 14} r="2" />
          <circle cx={W / 2 + 7} cy={H / 2 - 14} r="2" />
          <circle cx={W / 2} cy={H / 2 - 7} r="2" />
          <circle cx={W / 2 - 7} cy={H / 2} r="2" />
          <circle cx={W / 2 + 7} cy={H / 2} r="2" />
          <text x={W / 2} y={H / 2 + 22} class="hint-title" text-anchor="middle">{wave === 4 ? 'S&H' : 'Smooth S&H'}</text>
        </g>
      {:else}
        {#if !unipolar}
          <line class="grid" x1="0" y1={H / 2} x2={W} y2={H / 2} />
        {/if}
        <path class="line" d={shape} />
        {#if engineState.playing}
          <circle class="dot" cx={dotX} cy={dotY} r="3" />
        {/if}
      {/if}
    </svg>
  </div>
  <Segmented
    value={String(wave)}
    options={WAVES}
    label="Waveform"
    fill
    onchange={(v) => (module.params.wave = Number(v))}
  />
  <div class="row">
    <!-- One speed knob: Hz while free, a clock ratio once a clock is patched in. -->
    <ParamKnob {module} {def} param={clocked ? 'sync' : 'rate'} />
    <ParamKnob {module} {def} param="amount" />
    <ParamKnob {module} {def} param="phase" />
  </div>
  <div class="polarity">
    <span>Polarity</span>
    <Segmented
      value={String(Math.round(module.params.polarity ?? 0))}
      options={POLARITY}
      label="Polarity"
      onchange={(v) => (module.params.polarity = Number(v))}
    />
  </div>
</div>

<style>
  .lfo {
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
  .grid {
    stroke: var(--border-subtle);
    stroke-width: 1;
    stroke-dasharray: 2 3;
    opacity: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .line {
    fill: none;
    stroke: var(--signal-cv);
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px var(--signal-cv));
  }
  .hint rect {
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 1.2;
  }
  .hint circle {
    fill: var(--text-muted);
  }
  .hint text {
    fill: var(--text-muted);
    font-family: inherit;
  }
  .hint-title {
    font-size: 12px;
  }
  .dot {
    fill: var(--text-strong);
    filter: drop-shadow(0 0 3px var(--signal-cv));
  }
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .polarity {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
