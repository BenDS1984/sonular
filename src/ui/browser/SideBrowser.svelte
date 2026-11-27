<!--
  The browser on the left of the patch, with two tabs:
  - Modules: a search field and the modules by family (each family can be folded)
  - Samples: the sample library on this computer (SamplesTab.svelte)
  - drag a module onto the canvas to put it where it is dropped
  - double-click a module (or choose it with ↑/↓ and press Enter in the search field) to add it
    where the canvas was double-clicked last, else in the middle of the view
  - drag the right edge to change the width; the B key or the button in the top bar hides it
-->
<script lang="ts">
  import { CATEGORY_ORDER, MODULES } from '../../modules/registry';
  import type { ModuleDefinition } from '../../modules/types';
  import { prefs } from '../prefs.svelte';
  import { endDragLook, startDragLook } from '../dragLook';
  import { placeModule } from '../workspace/placeModule';
  import { clampBrowserWidth, MODULE_DRAG_TYPE, sideBrowser } from './browserPanel.svelte';
  import SamplesTab from './SamplesTab.svelte';

  const tab = $derived(prefs.browserTab);

  let query = $state('');
  let activeIndex = $state(-1);
  let input: HTMLInputElement | undefined = $state();

  const searching = $derived(query.trim() !== '');

  const matches = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return MODULES.filter(
      (d) =>
        !q ||
        d.title.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q),
    ).sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.title.localeCompare(b.title),
    );
  });

  const groups = $derived(
    CATEGORY_ORDER.map((cat) => ({ cat, items: matches.filter((d) => d.category === cat) })).filter(
      (g) => g.items.length,
    ),
  );

  /** A family is folded unless the user is searching (then every match shows). */
  const isFolded = (cat: string) => !searching && prefs.browserFolded.includes(cat);

  /** The modules that can be chosen with the arrow keys: the ones shown. */
  const shown = $derived(groups.flatMap((g) => (isFolded(g.cat) ? [] : g.items)));

  function toggleFamily(cat: string) {
    prefs.browserFolded = prefs.browserFolded.includes(cat)
      ? prefs.browserFolded.filter((c) => c !== cat)
      : [...prefs.browserFolded, cat];
  }

  $effect(() => {
    void query;
    activeIndex = searching ? 0 : -1;
  });

  // A double-click on the canvas asks for the module search field.
  $effect(() => {
    if (sideBrowser.focusTick > 0) {
      prefs.browserTab = 'modules';
      input?.focus();
      input?.select();
    }
  });

  function add(def: ModuleDefinition) {
    placeModule(def, sideBrowser.place);
    sideBrowser.place = null;
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      activeIndex = Math.min(shown.length - 1, activeIndex + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      activeIndex = Math.max(0, activeIndex - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const def = shown[activeIndex];
      if (def) {
        add(def);
        query = ''; // ready for the next search
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      query = '';
      sideBrowser.place = null;
      input?.blur();
      e.preventDefault();
    }
    e.stopPropagation();
  }

  function ondragstart(e: DragEvent, def: ModuleDefinition) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData(MODULE_DRAG_TYPE, def.type);
    e.dataTransfer.effectAllowed = 'copy';
  }

  // ---------- Width: drag the right edge ----------
  let resizing: { x0: number; w0: number } | null = $state(null);

  function onresizedown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizing = { x0: e.clientX, w0: prefs.browserWidth };
    startDragLook('ew-resize');
  }

  function onresizemove(e: PointerEvent) {
    if (resizing) prefs.browserWidth = clampBrowserWidth(resizing.w0 + e.clientX - resizing.x0);
  }

  function onresizeend() {
    if (resizing) endDragLook();
    resizing = null;
  }
</script>

<aside class="side-browser" style:width={`${clampBrowserWidth(prefs.browserWidth)}px`} aria-label="Browser">
  <div class="tabs" role="tablist" aria-label="Browser">
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'modules'}
      class:on={tab === 'modules'}
      onclick={() => (prefs.browserTab = 'modules')}>Modules</button
    >
    <button
      type="button"
      role="tab"
      aria-selected={tab === 'samples'}
      class:on={tab === 'samples'}
      onclick={() => (prefs.browserTab = 'samples')}>Samples</button
    >
  </div>
  {#if tab === 'samples'}
    <SamplesTab />
  {:else}
  <section class="section" aria-label="Modules">
    <input
      bind:this={input}
      bind:value={query}
      type="search"
      placeholder={sideBrowser.place ? 'Search a module to add here' : 'Search modules'}
      aria-label="Search modules"
      {onkeydown}
      onblur={() => {
        if (!query) activeIndex = -1;
      }}
    />
    <div class="list" role="listbox" aria-label="Modules">
      {#each groups as g (g.cat)}
        {@const folded = isFolded(g.cat)}
        <button
          type="button"
          class="family"
          aria-expanded={!folded}
          style:--item-accent={`var(--family-${g.cat.toLowerCase()})`}
          onclick={() => toggleFamily(g.cat)}
        >
          <span class="chevron" class:folded aria-hidden="true">▾</span>
          {g.cat}
          <span class="count">{g.items.length}</span>
        </button>
        {#if !folded}
          {#each g.items as def (def.type)}
            {@const index = shown.indexOf(def)}
            <div
              class="item"
              class:active={index === activeIndex}
              role="option"
              tabindex="-1"
              aria-selected={index === activeIndex}
              title={`${def.title}: ${def.description}\nDrag onto the canvas, or double-click to add.`}
              draggable="true"
              style:--item-accent={`var(--family-${def.category.toLowerCase()})`}
              ondragstart={(e) => ondragstart(e, def)}
              ondblclick={() => add(def)}
              onclick={() => (activeIndex = index)}
              onkeydown={(e) => {
                if (e.key === 'Enter') add(def);
              }}
            >
              <span class="text">
                <span class="name">{def.title}</span>
                <span class="desc">{def.description}</span>
              </span>
            </div>
          {/each}
        {/if}
      {:else}
        <div class="empty">No modules match “{query}”.</div>
      {/each}
    </div>
  </section>
  {/if}
  <div
    class="resize"
    class:active={!!resizing}
    role="separator"
    aria-orientation="vertical"
    aria-label="Browser width"
    title="Drag to change the width"
    onpointerdown={onresizedown}
    onpointermove={onresizemove}
    onpointerup={onresizeend}
    onpointercancel={onresizeend}
  ></div>
</aside>

<style>
  .side-browser {
    /* Floats over the left edge of the patch, so showing or hiding it never moves the patch. */
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 20;
    box-shadow: 2px 0 12px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface-bar);
    border-right: 1px solid var(--border-default);
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin: var(--space-2) var(--space-2) 0;
    padding: 2px;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
  }
  .tabs button {
    flex: 1;
    height: 26px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    font-weight: var(--weight-medium);
    cursor: pointer;
  }
  .tabs button:hover {
    color: var(--text-strong);
  }
  .tabs button.on {
    background: var(--surface-control);
    color: var(--text-strong);
  }
  .section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  input {
    margin: var(--space-2);
    height: 30px;
    padding: 0 var(--space-3);
    background: var(--surface-inset);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-default);
    font: inherit;
    outline: none;
  }
  input:focus {
    border-color: var(--border-focus);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 0 var(--space-1) var(--space-2);
  }
  /* Family headers in the family's colour, like module headers on the canvas. */
  .family {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin-top: var(--space-2);
    padding: 5px var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--sheen-header), var(--item-accent);
    box-shadow: 0 1px 0 rgb(255 255 255 / 0.15) inset;
    color: var(--text-strong);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: left;
    cursor: pointer;
  }
  .family:hover {
    filter: brightness(1.12);
  }
  .chevron {
    display: inline-block;
    width: 10px;
    transition: transform 100ms;
  }
  .chevron.folded {
    transform: rotate(-90deg);
  }
  .count {
    margin-left: auto;
    color: rgb(255 255 255 / 0.7);
    font-weight: normal;
  }
  /* A thin stripe in the family's colour on the left of each module. */
  .item {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin-top: 2px;
    padding: var(--space-2) var(--space-2) var(--space-2) calc(var(--space-2) + 2px);
    border-left: 3px solid var(--item-accent);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    cursor: grab;
    user-select: none;
  }
  .item:hover,
  .item.active {
    background: var(--surface-control);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }
  .name {
    color: var(--text-strong);
    font-weight: var(--weight-medium);
  }
  .desc {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.35;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .empty {
    padding: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .resize {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -3px;
    width: 6px;
    z-index: 2;
    cursor: ew-resize;
  }
  .resize:hover,
  .resize.active {
    background: linear-gradient(to right, transparent 2px, var(--border-focus) 2px, var(--border-focus) 4px, transparent 4px);
  }
</style>
