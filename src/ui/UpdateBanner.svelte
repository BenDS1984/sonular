<!-- Offers a downloaded new version; the user decides when to reload. -->
<script lang="ts">
  import { dismissUpdate, installUpdate, pwaState } from '../platform/pwa.svelte';
</script>

{#if pwaState.updateReady}
  <div class="banner" role="status">
    <span>A new version of Sonular is ready. Your patch is saved, so reloading is safe.</span>
    <button type="button" class="btn" onclick={dismissUpdate}>Later</button>
    <button type="button" class="btn primary" onclick={installUpdate}>Reload</button>
  </div>
{/if}

<style>
  .banner {
    position: fixed;
    left: 50%;
    bottom: var(--space-5);
    transform: translateX(-50%);
    z-index: 300001;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: calc(100vw - 32px);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    background: var(--surface-bar);
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-lg);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
    color: var(--text-default);
    font-size: var(--text-sm);
  }
  .btn {
    flex: none;
    height: 28px;
    padding: 0 var(--space-3);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-control);
    color: var(--text-default);
    cursor: pointer;
  }
  .btn.primary {
    background: var(--signal-audio);
    border-color: var(--signal-audio);
    color: var(--text-on-accent);
    font-weight: var(--weight-bold);
  }
</style>
