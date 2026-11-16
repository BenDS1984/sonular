<script lang="ts">
  import { dismissToast, toasts } from './toast.svelte';
</script>

<div class="toasts" role="status" aria-live="polite">
  {#each toasts as t (t.id)}
    <button type="button" class="toast {t.kind}" title="Dismiss" onclick={() => dismissToast(t.id)}>
      {t.message}
    </button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: var(--space-5);
    transform: translateX(-50%);
    z-index: 300000;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    pointer-events: none;
  }
  .toast {
    max-width: min(520px, calc(100vw - 32px));
    padding: var(--space-2) var(--space-4);
    background: var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
    color: var(--text-default);
    font-size: var(--text-sm);
    text-align: left;
    pointer-events: auto;
    cursor: pointer;
  }
  .toast.warning {
    border-color: var(--meter-mid);
  }
  .toast.error {
    border-color: var(--danger);
  }
</style>
