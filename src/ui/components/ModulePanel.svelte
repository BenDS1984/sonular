<!--
  The frame every module sits in: a header coloured by the module's family, a body for
  controls, and a footer strip for its ports.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { SignalType } from '../signals';
  import type { ModuleDefinition } from '../../modules/types';
  import EditableName from './EditableName.svelte';

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
    /** Right-click on the header. */
    onheadercontextmenu?: (e: MouseEvent) => void;
    onremove?: () => void;
    /** When given, the title can be renamed by double-clicking it. */
    rename?: { value: string; placeholder: string; tooltip: string; onrename: (name: string) => void };
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
    onheadercontextmenu,
    onremove,
    rename,
  }: Props = $props();

  let nameField: EditableName | undefined = $state();

  // Heights come in steps of GRID, so modules fall into a few sizes: the module grows to the next
  // step and the extra room goes between its controls and its jacks. The natural height is the
  // header, the controls, the jacks and the frame, measured on the parts that do not stretch.
  const GRID = 40;
  let header: HTMLElement | undefined = $state();
  let content: HTMLElement | undefined = $state();
  let footer: HTMLElement | undefined = $state();
  let minHeight = $state(0);
  // The room the step adds on top of the natural height is shared: half goes above the controls,
  // the rest stays below them, so the controls sit centred between the header and the jacks.
  let topSpace = $state(0);

  $effect(() => {
    if (!header || !content) return;
    const body = content.parentElement!;
    const measure = () => {
      const pad = parseFloat(getComputedStyle(body).paddingTop) + parseFloat(getComputedStyle(body).paddingBottom);
      const natural = header!.offsetHeight + content!.offsetHeight + pad + (footer?.offsetHeight ?? 0) + 2;
      minHeight = Math.ceil(natural / GRID) * GRID;
      topSpace = Math.floor((minHeight - natural) / 2);
    };
    const observer = new ResizeObserver(measure);
    for (const el of [header, content, footer]) if (el) observer.observe(el);
    measure();
    return () => observer.disconnect();
  });
</script>

<section
  class="module"
  class:selected
  style:width={`${width}px`}
  style:min-height={minHeight ? `${minHeight}px` : undefined}
  style:--module-accent={`var(--signal-${signal})`}
  style:--module-family={`var(--family-${family.toLowerCase()})`}
>
  <!-- svelte-ignore a11y_no_static_element_interactions (dragging by the header is a mouse affordance; keyboard moving comes later) -->
  <!-- The header grabs the pointer for dragging, so a double-click on the name arrives here; only one that lands on the name counts. -->
  <header class="header" bind:this={header} onpointerdown={onheaderpointerdown} oncontextmenu={onheadercontextmenu} ondblclick={rename ? (e) => nameField?.isAt(e.clientX, e.clientY) && nameField.start() : undefined}>
    <h3 class="title">
      {#if rename}
        <EditableName
          bind:this={nameField}
          text={title}
          value={rename.value}
          placeholder={rename.placeholder}
          label="Module name"
          title={rename.tooltip}
          onrename={rename.onrename}
        />
      {:else}
        {title}
      {/if}
    </h3>
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
    <div class="content" bind:this={content} style:margin-top={topSpace ? `${topSpace}px` : undefined}>
      {@render children()}
    </div>
  </div>
  {#if ports}
    <footer class="ports" bind:this={footer}>
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
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    overflow: hidden;
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
