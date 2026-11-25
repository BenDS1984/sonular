<script lang="ts">
  import { meterValue } from '../../engine/engine.svelte';
  import Segmented from '../../ui/components/Segmented.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  // The picture shows the filter's response from 20 Hz to 20 kHz and from -40 to +30 dB.
  const W = 176;
  const H = 76;
  const F_LO = 20;
  const F_HI = 20000;
  const DB_LO = -40;
  const DB_HI = 30;
  const POINTS = 96;
  const SR = 48000;

  const xOf = (hz: number) => (Math.log(hz / F_LO) / Math.log(F_HI / F_LO)) * W;
  const yOf = (db: number) => ((DB_HI - Math.max(DB_LO, Math.min(DB_HI, db))) / (DB_HI - DB_LO)) * H;

  /** Level in dB at `hz`: the same response the engine's filter has (its frequency warping included). */
  function responseDb(hz: number, type: number, cutoff: number, resonance: number): number {
    const k = 1 / (0.7071 * Math.pow(35, resonance));
    const s = Math.tan((Math.PI * hz) / SR) / Math.tan((Math.PI * Math.min(cutoff, 0.45 * SR)) / SR);
    const re = 1 - s * s;
    const im = k * s;
    const den = Math.hypot(re, im);
    const mag = type === 0 ? 1 / den : type === 1 ? (k * s) / den : (s * s) / den;
    return 20 * Math.log10(Math.max(mag, 1e-6));
  }

  const curve = $derived.by(() => {
    const type = Math.round(module.params.type ?? 0);
    // While playing, the mod input moves the cutoff: the curve follows (the engine reports the shift).
    const cutoff = Math.min(F_HI, Math.max(F_LO, (module.params.cutoff ?? 1000) * Math.pow(2, meterValue(module.id, 'shift'))));
    const resonance = module.params.resonance ?? 0;
    let line = '';
    for (let i = 0; i < POINTS; i++) {
      const hz = F_LO * Math.pow(F_HI / F_LO, i / (POINTS - 1));
      line += `${i ? 'L' : 'M'}${xOf(hz).toFixed(1)} ${yOf(responseDb(hz, type, cutoff, resonance)).toFixed(1)}`;
    }
    return { line, area: `${line}L${W} ${H}L0 ${H}Z`, x: xOf(Math.min(F_HI, Math.max(F_LO, cutoff))) };
  });

  const MARKS = [
    { hz: 100, label: '100' },
    { hz: 1000, label: '1k' },
    { hz: 10000, label: '10k' },
  ];

  const TYPES = [
    { value: '0', label: 'LP', title: 'Low-pass: lets the lows through, removes the highs' },
    { value: '1', label: 'BP', title: 'Band-pass: lets a band around the cutoff through' },
    { value: '2', label: 'HP', title: 'High-pass: lets the highs through, removes the lows' },
  ];
</script>

<div class="filter">
  <div class="screen lcd">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Filter response">
      {#each MARKS as m (m.label)}
        <line class="grid" x1={xOf(m.hz)} y1="0" x2={xOf(m.hz)} y2={H} />
        <text class="label" x={xOf(m.hz) + 2} y={H - 3}>{m.label}</text>
      {/each}
      <line class="grid zero" x1="0" y1={yOf(0)} x2={W} y2={yOf(0)} />
      <path class="area" d={curve.area} />
      <path class="line" d={curve.line} />
      <line class="cut" x1={curve.x} y1="0" x2={curve.x} y2={H} />
    </svg>
  </div>
  <Segmented
    value={String(Math.round(module.params.type ?? 0))}
    options={TYPES}
    label="Filter type"
    onchange={(v) => (module.params.type = Number(v))}
  />
  <div class="row">
    <ParamKnob {module} {def} param="cutoff" />
    <ParamKnob {module} {def} param="resonance" />
    <ParamKnob {module} {def} param="mod" />
  </div>
</div>

<style>
  .filter {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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
  .grid.zero {
    stroke-dasharray: none;
    opacity: 0.35;
  }
  .label {
    fill: var(--text-muted);
    font-size: 6px;
  }
  .area {
    fill: color-mix(in srgb, var(--signal-audio) 30%, transparent);
  }
  .line {
    fill: none;
    stroke: var(--signal-audio);
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px var(--signal-audio));
  }
  .cut {
    stroke: var(--text-strong);
    stroke-width: 1;
    opacity: 0.35;
    vector-effect: non-scaling-stroke;
  }
  .row {
    display: flex;
    justify-content: space-between;
  }
</style>
