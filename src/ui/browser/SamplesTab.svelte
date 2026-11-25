<!--
  The Samples tab of the browser: the sample library on this computer.
  - drop audio files from the computer anywhere on the tab, or use "Add samples…" to choose them
  - click a sample to listen to it (click again to stop); one sample plays at a time, and its
    waveform shows how far it has played
  - right-click a sample to rename or delete it
  The library stays when the app is closed; it is not part of a project.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { placeMenu } from '../placeMenu';
  import {
    addSampleFiles,
    library,
    librarySize,
    loadLibrary,
    removeSample,
    renameSample,
    stopPreview,
    togglePreview,
  } from '../../samples/library.svelte';
  import { formatBytes, formatSampleLength, PEAK_COUNT, SAMPLE_DRAG_TYPE } from '../../samples/sampleFiles';
  import type { SampleInfo } from '../../platform/sampleStore';
  import { prefs } from '../prefs.svelte';

  void loadLibrary();
  onDestroy(stopPreview);

  let query = $state('');
  let picker: HTMLInputElement | undefined = $state();
  let dropping = $state(false);

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? library.samples.filter((s) => s.name.toLowerCase().includes(q) || s.fileName.toLowerCase().includes(q)) : library.samples;
  });

  // ---------- Adding ----------

  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

  function ondragover(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    dropping = true;
  }

  function ondragleave(e: DragEvent) {
    // Only when the pointer leaves the tab, not when it moves between its parts.
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dropping = false;
  }

  function ondrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dropping = false;
    void addSampleFiles(Array.from(e.dataTransfer!.files));
  }

  function onpicked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) void addSampleFiles(files);
  }

  // ---------- Renaming ----------

  let renaming = $state<string | null>(null);
  let draft = $state('');

  function startRename(s: SampleInfo) {
    menu = null;
    renaming = s.id;
    draft = s.name;
  }

  function finishRename(save: boolean) {
    const id = renaming;
    renaming = null;
    if (save && id) void renameSample(id, draft);
  }

  const focusSelect = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };

  // ---------- Dragging onto a Sampler ----------

  function dragSample(e: DragEvent, s: SampleInfo) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData(SAMPLE_DRAG_TYPE, s.hash);
    e.dataTransfer.effectAllowed = 'copy';
  }

  // ---------- Right-click menu ----------

  let menu = $state<{ x: number; y: number; sample: SampleInfo; confirm: boolean } | null>(null);

  function openMenu(e: MouseEvent, sample: SampleInfo) {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY, sample, confirm: false };
  }

  /** The waveform overview as a filled shape, mirrored around the middle (width 100, height 20). */
  function waveShape(peaks: readonly number[]): string {
    const n = peaks.length || PEAK_COUNT;
    const top = peaks.map((p, i) => `${(i / (n - 1)) * 100},${10 - Math.max(0.4, p * 9.5)}`);
    const bottom = peaks.map((p, i) => `${(i / (n - 1)) * 100},${10 + Math.max(0.4, p * 9.5)}`).reverse();
    return [...top, ...bottom].join(' ');
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (dropping files is a pointer gesture; "Add samples…" is the keyboard way) -->
<div class="samples" class:dropping {ondragover} {ondragleave} {ondrop}>
  <div class="tools">
    <button type="button" class="add" onclick={() => picker?.click()}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      Add samples…
    </button>
    <input bind:this={picker} class="picker" type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.ogg,.flac,.m4a" multiple onchange={onpicked} />
  </div>
  <input class="search" bind:value={query} type="search" placeholder="Search samples" aria-label="Search samples" />

  <div class="list" role="list" aria-label="Samples">
    {#each shown as s (s.id)}
      {@const playing = library.playing === s.id}
      <div
        class="sample"
        class:playing
        role="listitem"
        draggable="true"
        ondragstart={(e) => dragSample(e, s)}
        oncontextmenu={(e) => openMenu(e, s)}
      >
        {#if renaming === s.id}
          <input
            class="rename"
            bind:value={draft}
            aria-label="Sample name"
            use:focusSelect
            onkeydown={(e) => {
              if (e.key === 'Enter') finishRename(true);
              else if (e.key === 'Escape') finishRename(false);
              e.stopPropagation();
            }}
            onblur={() => finishRename(true)}
          />
        {:else}
          <button
            type="button"
            class="play"
            title={playing ? 'Stop' : `Listen to ${s.name} (${s.fileName}). Right-click to rename or delete.`}
            aria-label={playing ? `Stop ${s.name}` : `Listen to ${s.name}`}
            aria-pressed={playing}
            onclick={() => void togglePreview(s.id)}
          >
            <span class="icon" aria-hidden="true">
              {#if playing}
                <svg viewBox="0 0 10 10" width="9" height="9"><rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" /></svg>
              {:else}
                <svg viewBox="0 0 10 10" width="9" height="9"><path d="M2 1.2v7.6L8.6 5z" fill="currentColor" /></svg>
              {/if}
            </span>
            <span class="text">
              <span class="name">{s.name}</span>
              <span class="meta">{formatSampleLength(s.duration)} · {s.channels > 1 ? 'stereo' : 'mono'}</span>
            </span>
            <svg class="wave" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
              <polygon points={waveShape(s.peaks)} />
              {#if playing}
                <!-- The part already played, in the playing colour, and the position line. -->
                <clipPath id={`played-${s.id}`}>
                  <rect x="0" y="0" width={library.progress * 100} height="20" />
                </clipPath>
                <polygon class="played" points={waveShape(s.peaks)} clip-path={`url(#played-${s.id})`} />
                <line class="position" x1={library.progress * 100} y1="0" x2={library.progress * 100} y2="20" />
              {/if}
            </svg>
          </button>
        {/if}
      </div>
    {:else}
      {#if library.loaded && library.adding === 0}
        <div class="empty">
          {#if query && library.samples.length > 0}
            No samples match “{query}”.
          {:else}
            Drop audio files here (WAV, AIFF, MP3, OGG, FLAC), or use <strong>Add samples…</strong>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <div class="footer">
    <span class="count">
      {#if library.adding > 0}
        Reading {library.adding} file{library.adding > 1 ? 's' : ''}…
      {:else}
        {library.samples.length} sample{library.samples.length === 1 ? '' : 's'} · {formatBytes(librarySize())}
      {/if}
    </span>
    <button
      type="button"
      class="speaker"
      title={prefs.sampleMuted ? 'Unmute listening' : 'Mute listening'}
      aria-label={prefs.sampleMuted ? 'Unmute listening' : 'Mute listening'}
      aria-pressed={prefs.sampleMuted}
      onclick={() => (prefs.sampleMuted = !prefs.sampleMuted)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z" fill="currentColor" />
        {#if prefs.sampleMuted || prefs.sampleVolume === 0}
          <path d="M11 6l3.5 4M14.5 6 11 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        {:else}
          <path d="M10.5 5.5a3.5 3.5 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          {#if prefs.sampleVolume > 0.5}
            <path d="M12.3 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          {/if}
        {/if}
      </svg>
    </button>
    <input
      class="volume"
      type="range"
      min="0"
      max="100"
      step="1"
      value={Math.round(prefs.sampleVolume * 100)}
      style:--fill={`${prefs.sampleMuted ? 0 : prefs.sampleVolume * 100}%`}
      title={`Listening volume: ${prefs.sampleMuted ? 'muted' : `${Math.round(prefs.sampleVolume * 100)}%`}`}
      aria-label="Listening volume"
      oninput={(e) => {
        prefs.sampleVolume = Number((e.currentTarget as HTMLInputElement).value) / 100;
        prefs.sampleMuted = false;
      }}
    />
  </div>

  {#if dropping}
    <div class="drop-hint">Drop to add to the library</div>
  {/if}
</div>

{#if menu}
  {@const m = menu}
  <div class="backdrop" role="presentation" onpointerdown={() => (menu = null)} oncontextmenu={(e) => e.preventDefault()}></div>
  <div class="menu" role="menu" use:placeMenu={{ x: m.x, y: m.y }}>
    {#if m.confirm}
      <div class="menu-caption">Delete “{m.sample.name}” from the library? This cannot be undone.</div>
      <button
        type="button"
        role="menuitem"
        class="danger"
        onclick={() => {
          void removeSample(m.sample.id);
          menu = null;
        }}>Delete</button
      >
      <button type="button" role="menuitem" onclick={() => (menu = null)}>Cancel</button>
    {:else}
      <button type="button" role="menuitem" onclick={() => startRename(m.sample)}>Rename</button>
      <button type="button" role="menuitem" class="danger" onclick={() => (menu = { ...m, confirm: true })}>Delete…</button>
    {/if}
  </div>
{/if}

<style>
  .samples {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .tools {
    padding: var(--space-2) var(--space-2) 0;
  }
  .add {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 30px;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-control);
    color: var(--text-strong);
    font: inherit;
    cursor: pointer;
  }
  .add:hover {
    border-color: var(--border-strong);
  }
  .picker {
    display: none;
  }
  .search {
    margin: var(--space-2);
    height: 30px;
    padding: 0 var(--space-3);
    background: var(--surface-inset);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-default);
    font: inherit;
    outline: none;
  }
  .search:focus {
    border-color: var(--border-focus);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-1) var(--space-2);
  }
  .play {
    display: grid;
    grid-template-columns: 18px 1fr 64px;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 6px var(--space-2);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .play:hover,
  .sample.playing .play {
    background: var(--surface-control);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--surface-inset);
    color: var(--text-secondary);
  }
  .sample.playing .icon {
    background: var(--signal-audio);
    color: var(--text-on-accent);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-strong);
  }
  .meta {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .wave {
    width: 64px;
    height: 20px;
  }
  .wave polygon {
    fill: var(--text-muted);
    opacity: 0.6;
  }
  .wave polygon.played {
    fill: var(--signal-audio-soft);
    opacity: 1;
  }
  .wave .position {
    stroke: var(--text-strong);
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
  }
  .rename {
    width: 100%;
    height: 30px;
    margin: 2px 0;
    padding: 0 var(--space-2);
    background: var(--surface-inset);
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-md);
    color: var(--text-strong);
    font: inherit;
    outline: none;
  }
  .empty {
    padding: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .footer {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
    border-top: 1px solid var(--border-subtle);
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .count {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .speaker {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .speaker:hover {
    background: var(--surface-control);
    color: var(--text-strong);
  }
  /* A quiet slider, like the cable slider on the canvas. */
  .volume {
    -webkit-appearance: none;
    appearance: none;
    width: 64px;
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--gray-550) var(--fill), var(--gray-700) var(--fill));
    cursor: pointer;
  }
  .volume::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--gray-400);
    border: 0;
  }
  .volume::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--gray-400);
    border: 0;
  }
  .samples.dropping {
    outline: 2px dashed var(--border-focus);
    outline-offset: -4px;
  }
  .drop-hint {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-module);
    border: 1px solid var(--border-strong);
    color: var(--text-strong);
    pointer-events: none;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 260000;
  }
  .menu {
    position: fixed;
    z-index: 260001;
    min-width: 170px;
    max-width: 260px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    background: var(--surface-module);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
  }
  .menu button {
    padding: 6px 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-default);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--surface-control);
  }
  .menu button.danger {
    color: var(--danger);
  }
  .menu-caption {
    padding: 6px 10px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.4;
  }
</style>
