<script lang="ts">
  import { engineState, meterValue } from '../../engine/engine.svelte';
  import { library, loadLibrary, sampleByHash } from '../../samples/library.svelte';
  import { formatSampleLength, PEAK_COUNT, SAMPLE_DRAG_TYPE, SAMPLER_MAX_SECONDS } from '../../samples/sampleFiles';
  import { showToast } from '../../ui/toast.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  void loadLibrary();

  const W = 238;
  const H = 44;
  let dropping = $state(false);

  const hash = $derived(module.sample ?? '');
  const info = $derived(hash ? sampleByHash(hash) : undefined);
  /** A sample is chosen but the library does not have it (yet, or any more). */
  const missing = $derived(!!hash && library.loaded && !info);

  const start = $derived(module.params.start ?? 0);
  const position = $derived(meterValue(module.id, 'position'));
  const active = $derived(engineState.playing && meterValue(module.id, 'active') >= 0.5);

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
  <select
    class="choose"
    aria-label="Sample"
    value={hash}
    onchange={(e) => choose(e.currentTarget.value)}
  >
    <option value="">{library.samples.length === 0 && library.loaded ? 'No samples in the library' : 'Choose a sample…'}</option>
    {#if missing}
      <option value={hash} disabled>Missing sample</option>
    {/if}
    {#each library.samples as s (s.id)}
      <option value={s.hash}>{s.name} · {formatSampleLength(s.duration)}</option>
    {/each}
  </select>

  <div class="screen lcd">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={info ? `Waveform of ${info.name}` : 'No sample chosen'}>
      <line class="mid" x1="0" y1={H / 2} x2={W} y2={H / 2} />
      {#if shape}
        <polygon class="wave" points={shape} />
        <line class="start" x1={start * W} y1="0" x2={start * W} y2={H} />
        {#if active}
          <line class="head" x1={position * W} y1="0" x2={position * W} y2={H} />
        {/if}
      {/if}
    </svg>
    {#if !info}
      <span class="hint">{missing ? 'Sample not in the library' : 'Drop a sample here'}</span>
    {/if}
  </div>

  <div class="knobs">
    <ParamKnob {module} {def} param="tune" />
    <ParamKnob {module} {def} param="start" />
    <ParamKnob {module} {def} param="level" />
  </div>
  <div class="knobs">
    <ParamKnob {module} {def} param="attack" />
    <ParamKnob {module} {def} param="decay" />
  </div>
</div>

<style>
  .sampler {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-radius: var(--radius-md);
  }
  .sampler.dropping {
    outline: 2px dashed var(--signal-audio);
    outline-offset: 2px;
  }
  .choose {
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-xs);
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
  .knobs {
    display: flex;
    justify-content: space-around;
  }
</style>
