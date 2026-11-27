<!-- The right-click menu on a module's header. Lives outside the zoomed canvas so it keeps its size. -->
<script lang="ts">
  import { duplicateModules, selectedModuleIds } from '../../patch/patch.svelte';
  import { placeMenu } from '../placeMenu';
  import { moduleMenu } from './menuState.svelte';

  const close = () => (moduleMenu.open = null);

  function duplicate() {
    duplicateModules(selectedModuleIds());
    close();
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && moduleMenu.open && close()} />

{#if moduleMenu.open}
  {@const at = moduleMenu.open}
  <div class="backdrop" role="presentation" onpointerdown={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}></div>
  <div class="menu" role="menu" use:placeMenu={{ x: at.x, y: at.y }}>
    <button type="button" role="menuitem" onclick={duplicate}>Duplicate</button>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 260000;
  }
  .menu {
    position: fixed;
    z-index: 260001;
    min-width: 150px;
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
</style>
