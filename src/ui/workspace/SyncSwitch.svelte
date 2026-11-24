<!--
  Bottom-left of the patch canvas: does this patch follow the timeline (Sync) or ignore it (Free)?
  The same setting as the Free button on the timeline and in the tab menu.
-->
<script lang="ts">
  import { activePatch } from '../../patch/patch.svelte';

  const p = $derived(activePatch());

  function set(free: boolean) {
    if (free) p.free = true;
    else delete p.free;
  }
</script>

<div class="sync" role="radiogroup" aria-label="Timeline">
  <button
    type="button"
    role="radio"
    class:on={!p.free}
    aria-checked={!p.free}
    title="Sync timeline: the sequencers play their blocks on the timeline"
    onclick={() => set(false)}>Sync timeline</button
  >
  <button
    type="button"
    role="radio"
    class="free"
    class:on={!!p.free}
    aria-checked={!!p.free}
    title="Free: the sequencers ignore the timeline and play the pattern chosen on the module"
    onclick={() => set(true)}>Free</button
  >
</div>

<style>
  .sync {
    position: absolute;
    left: var(--space-3);
    bottom: var(--space-3);
    z-index: 150000;
    display: flex;
    padding: 2px;
    gap: 2px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-bar);
  }
  button {
    height: 22px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    cursor: pointer;
  }
  button:hover:not(.on) {
    background: var(--surface-control-hover);
    color: var(--text-default);
  }
  button.on {
    background: var(--surface-control);
    color: var(--text-strong);
  }
  button.free.on {
    background: var(--amber-500);
    color: var(--text-on-accent);
  }
</style>
