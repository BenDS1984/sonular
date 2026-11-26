<script lang="ts">
  import { engineState, meterValue } from '../../engine/engine.svelte';
  import { library, loadLibrary, sampleByHash } from '../../samples/library.svelte';
  import { formatSampleLength, PEAK_COUNT, SAMPLE_DRAG_TYPE, SAMPLER_MAX_SECONDS } from '../../samples/sampleFiles';
  import { showToast } from '../../ui/toast.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import ParamSlider from '../ParamSlider.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  void loadLibrary();

  const W = 226;
  const H = 44;
  let dropping = $state(false);

  const hash = $derived(module.sample ?? '');
  const info = $derived(hash ? sampleByHash(hash) : undefined);
  /** A sample is chosen but the library does not have it (yet, or any more). */
  const missing = $derived(!!hash && library.loaded && !info);

  const start = $derived(module.params.start ?? 0);
  const position = $derived(meterValue(module.id, 'position'));
  const active = $derived(engineState.playing && meterValue(module.id, 'active') >= 0.5);

  const tune = $derived(module.params.tune ?? 0);
  const attack = $derived(module.params.attack ?? 0);
  /** Decay at its minimum means Off: the sound is not cut short. */
  const decay = $derived(module.params.decay ?? 0);
  const decayOff = $derived(decay <= (def.params.find((p) => p.id === 'decay')?.min ?? 0) * 1.02);

  /**
   * The level Attack and Decay give over time, drawn on the waveform: from where the sample starts,
   * rising over Attack and falling over Decay (flat when Decay is Off). Time in the screen is the
   * sample's own length, so a higher Tune plays it (and the envelope) faster across it.
   */
  const envelope = $derived.by(() => {
    if (!info || info.duration <= 0) return '';
    const secondsPerScreen = info.duration / Math.pow(2, tune / 12);
    const t0 = start * secondsPerScreen;
    const a = attack <= 0.0011 ? 0 : attack;
    const level = (t: number) => {
      if (a > 0 && t < a) return t / a;
      if (decayOff) return 1;
      const u = (t - a) / decay;
      return u >= 1 ? 0 : (1 - u) * (1 - u);
    };
    const span = secondsPerScreen - t0;
    let line = '';
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * span;
      const x = ((t0 + t) / secondsPerScreen) * W;
      const y = H - 3 - level(t) * (H - 6);
      line += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return line;
  });

  /** The waveform overview as a filled shape, mirrored around the middle. */
  const shape = $derived.by(() => {
    const peaks = info?.peaks ?? [];
    if (peaks.length === 0) return '';
    const n = peaks.length || PEAK_COUNT;
    const mid = H / 2;
    const top = peaks.map((p, i) => `${((i / (n - 1)) * W).toFixed(1)},${(mid - Math.max(0.6, p * (mid - 2))).toFixed(1)}`);
    const bottom = peaks.map((p, i) => `${((i / (n - 1)) * W).toFixed(1)},${(mid + Math.max(0.6, p * (mid - 2))).toFixed(1)}`).reverse();
    return [...top, ...bottom].join(' ');
  });

  function choose(newHash: string) {
    if (!newHash) {
      module.sample = undefined;
      return;
    }
    const chosen = sampleByHash(newHash);
    if (chosen && chosen.duration > SAMPLER_MAX_SECONDS) {
      showToast(`“${chosen.name}” is longer than ${SAMPLER_MAX_SECONDS} seconds: too long for the Sampler.`, 'warning');
      return;
    }
    module.sample = newHash;
  }

  const isSampleDrag = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(SAMPLE_DRAG_TYPE);

  function ondragover(e: DragEvent) {
    if (!isSampleDrag(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    dropping = true;
  }

  function ondrop(e: DragEvent) {
    if (!isSampleDrag(e)) return;
    e.preventDefault();
    dropping = false;
    choose(e.dataTransfer!.getData(SAMPLE_DRAG_TYPE));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (dropping a sample is a pointer gesture; the list is the keyboard way) -->
<div class="sampler" class:dropping {ondragover} ondragleave={() => (dropping = false)} {ondrop}>
  <div class="screen lcd">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={info ? `Waveform of ${info.name}` : 'No sample chosen'}>
      <line class="mid" x1="0" y1={H / 2} x2={W} y2={H / 2} />
      {#if shape}
        <polygon class="wave" points={shape} />
        <path class="env" d={envelope} />
        <line class="start" x1={start * W} y1="0" x2={start * W} y2={H} />
        {#if active}
          <line class="head" x1={position * W} y1="0" x2={position * W} y2={H} />
        {/if}
      {/if}
    </svg>
    {#if info}
      <span class="name">{info.name} · {formatSampleLength(info.duration)}</span>
    {:else}
      <span class="hint">{missing ? 'Sample not in the library' : 'Drop a sample here'}</span>
    {/if}
  </div>

  <div class="controls">
    <div class="knobs">
      <ParamKnob {module} {def} param="tune" />
      <ParamKnob {module} {def} param="start" />
      <ParamKnob {module} {def} param="attack" />
      <ParamKnob {module} {def} param="decay" />
    </div>
    <ParamSlider {module} {def} param="level" height={118} />
  </div>
</div>

<style>
  .sampler {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    border-radius: var(--radius-md);
  }
  .sampler.dropping {
    outline: 2px dashed var(--signal-audio);
    outline-offset: 2px;
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
    height: auto;
  }
  .mid {
    stroke: var(--border-subtle);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .wave {
    fill: var(--signal-audio);
    opacity: 0.85;
  }
  .start {
    stroke: var(--text-strong);
    stroke-width: 1;
    stroke-dasharray: 2 2;
    vector-effect: non-scaling-stroke;
    opacity: 0.8;
  }
  .head {
    stroke: var(--text-strong);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px var(--signal-audio));
  }
  .name {
    position: absolute;
    top: 3px;
    right: 4px;
    max-width: calc(100% - 8px);
    text-align: right;
    text-shadow: 0 0 3px #000, 0 0 2px #000;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-default);
    font-size: 10px;
    pointer-events: none;
  }
  .hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: var(--text-xs);
    pointer-events: none;
  }
  .controls {
    /* Three equal columns: the two knob columns and the Level slider, evenly spread. */
    display: grid;
    grid-template-columns: 2fr 1fr;
    align-items: start;
    justify-items: center;
  }
  .knobs {
    display: grid;
    width: 100%;
    justify-items: center;
    grid-template-columns: repeat(2, 1fr);
    row-gap: 5px;
  }
  .env {
    fill: none;
    stroke: var(--signal-cv);
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px var(--signal-cv));
  }
</style>
