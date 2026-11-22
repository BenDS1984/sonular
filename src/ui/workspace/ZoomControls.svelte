<!-- Bottom-right corner of the canvas: cable visibility and transparency, overview, zoom. -->
<script lang="ts">
  interface Props {
    zoom: number;
    onzoom: (factor: number) => void;
    onreset: () => void;
    onfit: () => void;
    minimap: boolean;
    ontoggleminimap: () => void;
    cablesVisible: boolean;
    ontogglecables: () => void;
    /** 0.1..1 */
    cableOpacity: number;
    oncableopacity: (opacity: number) => void;
  }

  let {
    zoom,
    onzoom,
    onreset,
    onfit,
    minimap,
    ontoggleminimap,
    cablesVisible,
    ontogglecables,
    cableOpacity,
    oncableopacity,
  }: Props = $props();
</script>

<div class="zoom" role="toolbar" aria-label="View">
  <button
    type="button"
    class:on={cablesVisible}
    title={cablesVisible ? 'Hide cables (they stay connected)' : 'Show cables'}
    aria-label={cablesVisible ? 'Hide cables' : 'Show cables'}
    aria-pressed={cablesVisible}
    onclick={ontogglecables}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 4.5c0 6 9 1 9 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      <circle cx="3.5" cy="4" r="1.8" fill="currentColor" />
      <circle cx="12.5" cy="12" r="1.8" fill="currentColor" />
      {#if !cablesVisible}
        <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      {/if}
    </svg>
  </button>
  <input
    class="opacity"
    type="range"
    min="10"
    max="100"
    step="5"
    value={Math.round(cableOpacity * 100)}
    style:--fill={`${((cableOpacity * 100 - 10) / 90) * 100}%`}
    disabled={!cablesVisible}
    title={`Cable opacity: ${Math.round(cableOpacity * 100)}%`}
    aria-label="Cable opacity"
    oninput={(e) => oncableopacity(Number((e.currentTarget as HTMLInputElement).value) / 100)}
    onpointerdown={(e) => e.stopPropagation()}
  />
  <span class="sep" aria-hidden="true"></span>
  <button
    type="button"
    class:on={minimap}
    title={minimap ? 'Hide overview' : 'Show overview'}
    aria-label={minimap ? 'Hide overview' : 'Show overview'}
    aria-pressed={minimap}
    onclick={ontoggleminimap}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <rect x="8" y="5" width="4" height="3" rx="0.5" fill="currentColor" />
    </svg>
  </button>
  <span class="sep" aria-hidden="true"></span>
  <button type="button" title="Zoom out (Ctrl + scroll)" aria-label="Zoom out" onclick={() => onzoom(1 / 1.2)}>
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
  </button>
  <button type="button" class="pct" title="Reset to 100%" onclick={onreset}>{Math.round(zoom * 100)}%</button>
  <button type="button" title="Zoom in (Ctrl + scroll)" aria-label="Zoom in" onclick={() => onzoom(1.2)}>
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
  </button>
  <button type="button" title="Fit all modules in view" aria-label="Fit all modules in view" onclick={onfit}>
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</div>

<style>
  .zoom {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    z-index: 150000;
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--surface-bar);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
  }
  button {
    display: grid;
    place-items: center;
    min-width: 28px;
    height: 26px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  button:hover {
    background: var(--surface-control);
    color: var(--text-strong);
  }
  button.on {
    color: var(--signal-audio-soft);
  }
  .sep {
    width: 1px;
    margin: 4px 2px;
    background: var(--border-default);
  }
  /* A quiet slider: dark track, filled part a little lighter, soft grey knob. */
  .opacity {
    -webkit-appearance: none;
    appearance: none;
    width: 72px;
    height: 4px;
    margin: 0 6px 0 2px;
    align-self: center;
    border-radius: 2px;
    background: linear-gradient(to right, var(--gray-550) var(--fill), var(--gray-700) var(--fill));
    cursor: pointer;
  }
  .opacity::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--gray-400);
    border: 0;
  }
  .opacity::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--gray-400);
    border: 0;
  }
  .opacity:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .pct {
    min-width: 48px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
</style>
