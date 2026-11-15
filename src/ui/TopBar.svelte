<script lang="ts">
  // Transport and global controls. Placeholders only: nothing is wired to audio yet.
  let bpm = $state(120);
</script>

<header class="topbar">
  <div class="logo" aria-label="Modulab">
    <img src="/favicon.svg" alt="" width="20" height="20" />
    <span>MODULAB</span>
  </div>

  <div class="group">
    <button class="pill play" type="button" title="Play (not available yet)">
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
      </svg>
      Play
    </button>
    <span class="pill readout" title="Tempo">{bpm} BPM</span>
    <span class="pill readout" title="Position (bar.beat.step)">1.1.1</span>
  </div>

  <div class="spacer"></div>

  <div class="group">
    <span class="pill readout" title="Audio engine load">CPU –</span>
    <button class="pill" type="button" title="Add module (not available yet)">
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
    height: 44px;
    padding: 0 12px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex: none;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-strong);
    font-size: 13px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .spacer {
    flex: 1;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border-strong);
    border-radius: 6px;
    color: var(--color-text);
    font-size: 12px;
  }
  button.pill {
    cursor: pointer;
  }
  button.pill:hover {
    border-color: var(--color-text-muted);
  }
  .readout {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--color-text-muted);
  }
  .play {
    background: var(--color-audio);
    border-color: var(--color-audio);
    color: var(--color-on-audio);
    font-weight: 600;
  }
  .play:hover {
    filter: brightness(1.08);
  }
</style>
