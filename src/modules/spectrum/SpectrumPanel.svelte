<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import { displayValues } from '../../engine/engine.svelte';
  import { SPECTRUM_BANDS } from '../../engine/modules/Spectrum';
  import { patch } from '../../patch/patch.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const W = 376;
  const H = 150;
  const B = SPECTRUM_BANDS;
  /** The picture's dB range choices (the Range parameter is an index into this). */
  const RANGES = [60, 90, 120];

  const RANGE_OPTIONS = [
    { value: '0', label: '60', title: 'Show 60 dB' },
    { value: '1', label: '90', title: 'Show 90 dB' },
    { value: '2', label: '120', title: 'Show 120 dB' },
  ];
  const PEAK_OPTIONS = [
    { value: '0', label: 'Off', title: 'No peak line' },
    { value: '1', label: 'On', title: 'A thin line holds the highest level for a moment' },
  ];
  const SCALE_OPTIONS = [
    { value: '0', label: 'Log', title: 'Frequency axis as we hear it (each octave equally wide)' },
    { value: '1', label: 'Lin', title: 'Frequency axis in equal steps of Hz' },
  ];

  const range = $derived(RANGES[Math.round(module.params.range ?? 1)] ?? 90);
  const peakOn = $derived(Math.round(module.params.peak ?? 1) === 1);
  const linear = $derived(Math.round(module.params.scale ?? 0) === 1);

  /** Whether anything is patched into the module (otherwise there is nothing to show). */
  const connected = $derived(
    patch.cables.some((c) => c.to.module === module.id && (c.to.port === 'l' || c.to.port === 'r')),
  );

  const x = (c: number) => (((c + 0.5) / B) * W).toFixed(1);
  /** 0 dB at the top, `-range` dB at the bottom. */
  const y = (db: number) => (Math.max(0, Math.min(1, -db / range)) * H).toFixed(1);

  const shape = $derived.by(() => {
    const values = displayValues(module.id);
    if (!connected || !values || values.length < 2 * B) return { area: '', top: '', peak: '' };
    let top = '';
    for (let c = 0; c < B; c++) top += `${c ? 'L' : 'M'}${x(c)} ${y(values[c]!)}`;
    let peak = '';
    if (peakOn) for (let c = 0; c < B; c++) peak += `${c ? 'L' : 'M'}${x(c)} ${y(values[B + c]!)}`;
    return { area: `${top}L${x(B - 1)} ${H}L${x(0)} ${H}Z`, top, peak };
  });

  /** Horizontal lines every 20 dB (not at 0, the top edge). */
  const gridDb = $derived(Array.from({ length: Math.floor(range / 20) }, (_, i) => -(i + 1) * 20).filter((d) => d > -range));

  /** Position of a frequency on the current axis, in columns. */
  const column = (hz: number) => (linear ? (hz / 20000) * B : (Math.log(hz / 20) / Math.log(1000)) * B);
  const marks = $derived(
    (linear
      ? [
          { hz: 5000, label: '5k' },
          { hz: 10000, label: '10k' },
          { hz: 15000, label: '15k' },
        ]
      : [
          { hz: 100, label: '100' },
          { hz: 1000, label: '1k' },
          { hz: 10000, label: '10k' },
        ]
    ).map((m) => ({ label: m.label, x: (column(m.hz) / B) * W })),
  );
</script>

<div class="spectrum">
  <div class="screen lcd">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Spectrum screen">
      {#each marks as m (m.label)}
        <line class="grid" x1={m.x} y1="0" x2={m.x} y2={H} />
        <text class="label" x={m.x + 3} y={H - 4}>{m.label}</text>
      {/each}
      {#each gridDb as d (d)}
        <line class="grid" x1="0" y1={y(d)} x2={W} y2={y(d)} />
        <text class="label" x="3" y={Number(y(d)) - 3}>{d}</text>
      {/each}
      {#if shape.area}
        <path class="area" d={shape.area} />
        <path class="line" d={shape.top} />
      {/if}
      {#if shape.peak}
        <path class="peak" d={shape.peak} />
      {/if}
    </svg>
  </div>
  <div class="row">
    <ParamKnob {module} {def} param="decay" />
    <div class="choice">
      <Segmented
        value={String(Math.round(module.params.range ?? 1))}
        options={RANGE_OPTIONS}
        label="Range in dB"
        onchange={(v) => (module.params.range = Number(v))}
      />
      <span>Range (dB)</span>
    </div>
    <div class="choice">
      <Segmented
        value={String(Math.round(module.params.peak ?? 1))}
        options={PEAK_OPTIONS}
        label="Peak hold"
        onchange={(v) => (module.params.peak = Number(v))}
      />
      <span>Peak hold</span>
    </div>
    <div class="choice">
      <Segmented
        value={String(Math.round(module.params.scale ?? 0))}
        options={SCALE_OPTIONS}
        label="Frequency axis"
        onchange={(v) => (module.params.scale = Number(v))}
      />
      <span>Axis</span>
    </div>
  </div>
</div>

<style>
  .spectrum {
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
  .label {
    fill: var(--text-muted);
    font-size: 8px;
  }
  .area {
    fill: color-mix(in srgb, var(--signal-audio) 35%, transparent);
  }
  .line {
    fill: none;
    stroke: var(--signal-audio);
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px var(--signal-audio));
  }
  .peak {
    fill: none;
    stroke: var(--text-strong);
    stroke-width: 1;
    opacity: 0.8;
    vector-effect: non-scaling-stroke;
  }
  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
  }
  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding-top: 6px;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
</style>
