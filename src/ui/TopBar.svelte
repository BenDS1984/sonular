<script lang="ts">
  // Transport and global controls: Play/Stop, tempo, position, CPU and the master meter.
  import { engineState, togglePlay } from '../engine/engine.svelte';
  import MasterMeter from './components/MasterMeter.svelte';
  import IconButton from './components/IconButton.svelte';
  import TempoField from './components/TempoField.svelte';
  import CpuGraph from './CpuGraph.svelte';
  import { canvasState, DEFAULT_PROJECT_NAME, isPatchEmpty, patch, project } from '../patch/patch.svelte';
  import { toCanvas } from '../patch/geometry';
  import { historyState, redo, undo } from '../patch/history.svelte';
  import { chooseProjectFile, newProject, requestSave } from '../patch/fileActions';
  import { interaction, closeBrowser, openBrowser } from './workspace/interaction.svelte';
  import { dialogs } from './dialogs.svelte';

  // ---------- New project (with confirmation when there is something to lose) ----------

  let confirmNew = $state(false);

  function askNew() {
    if (project.patches.length === 1 && isPatchEmpty()) newProject();
    else confirmNew = !confirmNew;
  }

  // ---------- CPU graph ----------

  let cpuOpen = $state(false);
  let cpuButton: HTMLButtonElement | undefined = $state();

  // ---------- Full screen ----------

  const fullscreenSupported = typeof document !== 'undefined' && document.fullscreenEnabled;
  let isFullscreen = $state(false);

  $effect(() => {
    const update = () => (isFullscreen = !!document.fullscreenElement);
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  });

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  }

  function toggleBrowser() {
    if (interaction.browser) {
      closeBrowser();
      return;
    }
    // Popup under the button (top-right of the canvas); new module goes in the middle of the view.
    const { w, h } = canvasState.viewport;
    openBrowser({ x: w - 308, y: 8 }, toCanvas(patch.view, w / 2, h / 2));
  }

  // Position as bar.beat.sixteenth in 4/4, counted from 1.
  const position = $derived.by(() => {
    const beat = engineState.playing ? Math.max(0, engineState.beat) : 0;
    const sixteenths = Math.floor(beat * 4 + 1e-6);
    return `${Math.floor(sixteenths / 16) + 1}.${(Math.floor(sixteenths / 4) % 4) + 1}.${(sixteenths % 4) + 1}`;
  });

  const cpuText = $derived(
    engineState.status === 'ready' && engineState.playing
      ? engineState.cpu < 0.01
        ? 'CPU <1%'
        : `CPU ${Math.min(999, Math.round(engineState.cpu * 100))}%`
      : 'CPU –',
  );
  const playLabel = $derived(
    engineState.status === 'starting' ? 'Starting…' : engineState.playing ? 'Stop' : 'Play',
  );

  function onkeydown(e: KeyboardEvent) {
    const el = document.activeElement;
    const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

    // Ctrl/Cmd shortcuts. In text fields, undo/redo stay with the field itself.
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        requestSave();
      } else if (key === 'o') {
        e.preventDefault();
        chooseProjectFile();
      } else if (!typing && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (!typing && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      return;
    }

    // Space toggles playback unless the user is typing or operating a focused control.
    if (e.code !== 'Space' || e.repeat) return;
    if (typing || el instanceof HTMLButtonElement) return;
    e.preventDefault();
    void togglePlay();
  }
</script>

<svelte:window {onkeydown} />

<header class="topbar">
  <div class="logo" aria-label="Sonular">
    <img src="/favicon.svg" alt="" width="20" height="20" />
    <span>SONULAR</span>
  </div>
  <button class="about" type="button" title="About Sonular" onclick={() => (dialogs.welcome = true)}>About</button>

  <div class="group doc">
    <label class="name-wrap" title="Click to rename the project (also the file name)">
    <input
      class="name"
      bind:value={project.name}
      aria-label="Project name"
      spellcheck="false"
      maxlength="80"
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur();
      }}
      onblur={() => {
        if (!project.name.trim()) project.name = DEFAULT_PROJECT_NAME;
      }}
    />
      <svg class="pencil" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M11 2.5l2.5 2.5L6 12.5l-3.25.75L3.5 10 11 2.5z" />
      </svg>
    </label>
    <span class="new-wrap">
      <IconButton icon="new" label="New project" active={confirmNew} onclick={askNew} />
      {#if confirmNew}
        <div class="confirm" role="dialog" aria-label="Start a new project">
          <p>Start a new project? The current one is cleared — you can undo this.</p>
          <div class="confirm-actions">
            <button type="button" class="pill" onclick={() => (confirmNew = false)}>Cancel</button>
            <button
              type="button"
              class="pill primary"
              onclick={() => {
                confirmNew = false;
                newProject();
              }}>New project</button
            >
          </div>
        </div>
      {/if}
    </span>
    <IconButton icon="open" label="Open project file (Ctrl+O)" onclick={chooseProjectFile} />
    <IconButton icon="save" label="Save project as file (Ctrl+S)" onclick={requestSave} />
    <span class="sep" aria-hidden="true"></span>
    <IconButton icon="undo" label="Undo (Ctrl+Z)" disabled={!historyState.canUndo} onclick={undo} />
    <IconButton icon="redo" label="Redo (Ctrl+Y)" disabled={!historyState.canRedo} onclick={redo} />
  </div>

  <div class="group">
    <button
      class="pill play"
      class:playing={engineState.playing}
      type="button"
      title="Play / stop (Space)"
      aria-pressed={engineState.playing}
      disabled={engineState.status === 'starting'}
      onclick={() => void togglePlay()}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        {#if engineState.playing}
          <rect x="3.5" y="3.5" width="9" height="9" rx="1" fill="currentColor" />
        {:else}
          <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
        {/if}
      </svg>
      {playLabel}
    </button>
    <TempoField value={project.tempo} onchange={(bpm) => (project.tempo = bpm)} />
    <span class="pill readout position" title="Position (bar.beat.sixteenth)">{position}</span>
  </div>

  <div class="spacer">
    {#if engineState.status === 'error'}
      <span class="error" role="alert">Audio could not start: {engineState.error}</span>
    {/if}
  </div>

  <div class="group">
    <button
      class="pill"
      class:open={!!interaction.browser}
      type="button"
      title="Add module (or double-click the canvas)"
      aria-expanded={!!interaction.browser}
      onpointerdown={(e) => e.stopPropagation()}
      onclick={toggleBrowser}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span class="module-label">Module</span>
    </button>
    <MasterMeter left={engineState.peakL} right={engineState.peakR} active={engineState.playing} tick={engineState.statsTick} />
    <span class="cpu-wrap">
      <button
        class="pill readout cpu"
        class:open={cpuOpen}
        type="button"
        title="Audio engine load (share of the real-time budget). Click for a graph over time."
        aria-expanded={cpuOpen}
        bind:this={cpuButton}
        onclick={() => (cpuOpen = !cpuOpen)}>{cpuText}</button
      >
      {#if cpuOpen && cpuButton}
        <CpuGraph anchor={cpuButton} onclose={() => (cpuOpen = false)} />
      {/if}
    </span>
    {#if fullscreenSupported}
      <IconButton
        icon={isFullscreen ? 'exit-fullscreen' : 'fullscreen'}
        label={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
        onclick={toggleFullscreen}
      />
    {/if}
  </div>
</header>

{#if confirmNew}
  <div class="confirm-backdrop" role="presentation" onpointerdown={() => (confirmNew = false)}></div>
{/if}

<style>
  .topbar {
    position: relative;
    z-index: 250002;
    display: flex;
    align-items: center;
    gap: 14px;
    height: var(--topbar-height);
    padding: 0 12px;
    background: var(--surface-bar);
    border-bottom: 1px solid var(--border-subtle);
    flex: none;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--text-strong);
    font-size: 13px;
  }
  .about {
    height: 24px;
    margin-left: -4px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .about:hover {
    background: var(--surface-control);
    color: var(--text-strong);
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .doc {
    gap: 2px;
  }
  .name-wrap {
    position: relative;
    display: flex;
    align-items: center;
    margin-right: 6px;
  }
  .pencil {
    position: absolute;
    right: 8px;
    fill: none;
    stroke: var(--text-muted);
    stroke-width: 1.4;
    stroke-linejoin: round;
    pointer-events: none;
    transition: opacity var(--duration-fast) var(--ease-out);
  }
  .name-wrap:hover .pencil {
    stroke: var(--text-secondary);
  }
  .name:focus + .pencil {
    opacity: 0;
  }
  .name {
    width: clamp(110px, 14vw, 180px);
    height: 28px;
    padding: 0 26px 0 8px;
    cursor: text;
    /* Always looks like a field you can type in, not only on hover. */
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--surface-inset);
    color: var(--text-default);
    font: inherit;
    font-size: var(--text-sm);
    text-overflow: ellipsis;
  }
  .name:hover {
    border-color: var(--border-strong);
  }
  .name:focus {
    outline: none;
    border-color: var(--border-focus);
    background: var(--surface-inset);
  }
  .sep {
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: var(--border-default);
  }
  .new-wrap {
    position: relative;
  }
  .confirm {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 250001;
    width: 260px;
    padding: var(--space-3);
    background: var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.5);
  }
  .confirm p {
    margin: 0 0 var(--space-3);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .primary {
    background: var(--signal-audio);
    border-color: var(--signal-audio);
    color: var(--text-on-accent);
    font-weight: 600;
  }
  .confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 250000;
  }
  .spacer {
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: center;
  }
  .error {
    color: var(--danger);
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cpu {
    min-width: 76px;
    justify-content: center;
  }
  .cpu-wrap {
    display: flex;
  }
  .pill {
    white-space: nowrap;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    background: var(--surface-control);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-default);
    font-size: 12px;
  }
  button.pill {
    cursor: pointer;
  }
  button.pill:hover {
    border-color: var(--text-muted);
  }
  .pill.open {
    border-color: var(--border-focus);
  }
  .readout {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--text-muted);
  }
  .play {
    background: var(--signal-audio);
    border-color: var(--signal-audio);
    color: var(--text-on-accent);
    font-weight: 600;
  }
  .play {
    min-width: 76px;
    justify-content: center;
  }
  .play:hover {
    filter: brightness(1.08);
  }
  .play.playing {
    background: var(--signal-audio-bg);
    color: var(--signal-audio-soft);
  }
  .play:disabled {
    cursor: progress;
    opacity: 0.7;
  }

  .position {
    min-width: 64px;
    justify-content: center;
  }

  /* Narrower windows: drop the position first, then shorten labels. */
  @media (max-width: 1260px) {
    .position {
      display: none;
    }
  }
  @media (max-width: 1160px) {
    .module-label {
      display: none;
    }
    .topbar {
      gap: 6px;
    }
  }
  @media (max-width: 900px) {
    .logo span {
      display: none;
    }
  }
</style>
