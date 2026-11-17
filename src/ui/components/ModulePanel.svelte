<!--
  The frame every module sits in: a header coloured by the module's family, a body for
  controls, and a footer strip for its ports.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SignalType } from '../signals';
  import type { ModuleDefinition } from '../../modules/types';

  interface Props {
    title: string;
    /** Accent colour of the module, usually the type of signal it produces (selection outline). */
    signal?: SignalType;
    /** Module family; sets the header colour. */
    family?: ModuleDefinition['category'];
    width?: number;
    selected?: boolean;
    children: Snippet;
    ports?: Snippet;
    onheaderpointerdown?: (e: PointerEvent) => void;
    onremove?: () => void;
  }

  let {
    title,
    signal = 'audio',
    family = 'Utilities',
    width = 200,
    selected = false,
    children,
    ports,
    onheaderpointerdown,
    onremove,
  }: Props = $props();
</script>

<section
  class="module"
  class:selected
  style:width={`${width}px`}
  style:--module-accent={`var(--signal-${signal})`}
  style:--module-family={`var(--family-${family.toLowerCase()})`}
>
  <!-- svelte-ignore a11y_no_static_element_interactions (dragging by the header is a mouse affordance; keyboard moving comes later) -->
  <header class="header" onpointerdown={onheaderpointerdown}>
    <h3 class="title">{title}</h3>
    {#if onremove}
      <button
        class="remove"
        type="button"
        title="Remove module (Delete)"
        aria-label={`Remove ${title}`}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={onremove}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    {/if}
  </header>
  <div class="body">
    {@render children()}
  </div>
  {#if ports}
    <footer class="ports">
      {@render ports()}
    </footer>
  {/if}
</section>

<style>
  .module {
    display: flex;
    flex-direction: column;
    background: var(--sheen-module), var(--surface-module);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-module);
    user-select: none;
    transition: border-color var(--duration-fast) var(--ease-out);
  }
  .module.selected {
    border-color: var(--module-accent);
    box-shadow:
      0 0 0 1px var(--module-accent),
      var(--shadow-module);
  }
  .header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-2) 0 var(--space-3);
    background: var(--sheen-header), var(--module-family);
    border-bottom: 1px solid rgb(0 0 0 / 0.25);
    box-shadow: 0 1px 0 rgb(255 255 255 / 0.15) inset;
    border-radius: calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0 0;
    cursor: grab;
    touch-action: none;
  }
  .header:active {
    cursor: grabbing;
  }
  .title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-strong);
    letter-spacing: 0.01em;
  }
  .title {
    flex: none;
  }
  .remove {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    margin-left: auto;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: rgb(255 255 255 / 0.75);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }
  .module:hover .remove,
  .module.selected .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .remove:hover {
    background: var(--danger-bg);
    color: var(--danger);
  }
  .body {
    flex: 1;
    padding: var(--space-3);
  }
  .ports {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-top: 1px solid var(--border-subtle);
  }
</style>
