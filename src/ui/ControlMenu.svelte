<!-- The right-click menu on a knob or fader: start, show or remove its automation. -->
<script lang="ts">
  import { automate, canAutomate, closeControlMenu, controlMenu, isAutomated, isOverridden, removeAutomation, showAutomation } from './automation.svelte';

  const automated = $derived(controlMenu.module ? isAutomated(controlMenu.module, controlMenu.param) : false);

  function run(action: () => void) {
    action();
    closeControlMenu();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && controlMenu.open && closeControlMenu()} />

{#if controlMenu.open && controlMenu.module}
  {@const m = controlMenu.module}
  {@const param = controlMenu.param}
  <div class="backdrop" role="presentation" onpointerdown={closeControlMenu} oncontextmenu={(e) => e.preventDefault()}></div>
  <div
    class="menu"
    role="menu"
    style:left={`${Math.min(controlMenu.x, innerWidth - 200)}px`}
    style:top={`${Math.min(controlMenu.y, innerHeight - 100)}px`}
  >
    <div class="caption">{controlMenu.label}</div>
    {#if automated}
      {#if isOverridden(m, param)}
        <div class="note">Paused: you turned this control. It follows its automation again at the next Play.</div>
      {/if}
      <button type="button" role="menuitem" onclick={() => run(() => showAutomation(m))}>Show automation</button>
      <button type="button" role="menuitem" class="danger" onclick={() => run(() => removeAutomation(m, param))}>Remove automation</button>
    {:else if canAutomate(m, param)}
      <button type="button" role="menuitem" onclick={() => run(() => automate(m, param))}>Automate</button>
    {:else}
      <div class="note">This control cannot be automated.</div>
    {/if}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 300000;
  }
  .menu {
    position: fixed;
    z-index: 300001;
    min-width: 170px;
    padding: 4px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-bar);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
  }
  .caption {
    padding: 4px 8px 6px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }
  button {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-default);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }
  button:hover {
    background: var(--surface-control-hover);
  }
  .note {
    max-width: 220px;
    padding: 2px 8px 6px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.4;
  }
  .danger {
    color: var(--danger);
  }
</style>
