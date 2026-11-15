<script lang="ts">
  // Transport and global controls. Play/Stop, CPU and the master meter talk to the audio engine;
  // tempo and position are still placeholders.
  import { engineState, togglePlay } from '../engine/engine.svelte';
  import MasterMeter from './components/MasterMeter.svelte';
  import { canvasState, patch } from '../patch/patch.svelte';
  import { toCanvas } from '../patch/geometry';
  import { interaction, closeBrowser, openBrowser } from './workspace/interaction.svelte';

  function toggleBrowser() {
    if (interaction.browser) {
      closeBrowser();
      return;
    }
    // Popup under the button (top-right of the canvas); new module goes in the middle of the view.
    const { w, h } = canvasState.viewport;
    openBrowser({ x: w - 308, y: 8 }, toCanvas(patch.view, w / 2, h / 2));
  }

  let bpm = $state(120);

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
    // Space toggles playback unless the user is typing or operating a focused control.
    if (e.code !== 'Space' || e.repeat) return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement || el instanceof HTMLSelectElement) return;
    e.preventDefault();
    void togglePlay();
  }
</script>

<svelte:window {onkeydown} />

<header class="topbar">
  <div class="logo" aria-label="Modulab">
    <img src="/favicon.svg" alt="" width="20" height="20" />
    <span>MODULAB</span>
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
    <span class="pill readout" title="Tempo">{bpm} BPM</span>
    <span class="pill readout" title="Position (bar.beat.step)">1.1.1</span>
  </div>

  <div class="spacer">
    {#if engineState.status === 'error'}
      <span class="error" role="alert">Audio could not start: {engineState.error}</span>
    {/if}
  </div>

  <div class="group">
    <MasterMeter left={engineState.peakL} right={engineState.peakR} active={engineState.playing} tick={engineState.statsTick} />
    <span class="pill readout cpu" title="Audio engine load (share of the real-time budget)">{cpuText}</span>
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
      Module
    </button>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 16px;
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
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
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
  .pill {
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
</style>
