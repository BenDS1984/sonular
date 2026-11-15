<!-- Zoom buttons in the bottom-right corner of the canvas. -->
<script lang="ts">
  interface Props {
    zoom: number;
    onzoom: (factor: number) => void;
    onreset: () => void;
    onfit: () => void;
  }

  let { zoom, onzoom, onreset, onfit }: Props = $props();
</script>

<div class="zoom" role="toolbar" aria-label="Zoom">
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
  .pct {
    min-width: 48px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }
</style>
