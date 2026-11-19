<!--
  The bar of patch tabs under the top bar. Each tab shows a patch's colour and name.
  - click: show that patch; drag sideways: change the order (the tab follows the pointer and the
    others slide aside)
  - double-click the name: rename (the name also shows on the Channel and in the mixer)
  - the ⋯ button on the shown tab, or a right-click on any tab: rename, duplicate, delete
  - + adds a patch with only its Channel
  The Mixer and Timeline buttons on the far left open those views; clicking a tab goes back to
  that patch.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { addPatch, duplicatePatch, movePatch, project, removePatch, selectPatch } from '../patch/patch.svelte';
  import type { Patch } from '../patch/types';
  import { channelColor } from './channelColors';
  import { view } from './view.svelte';

  let bar: HTMLDivElement | undefined = $state();
  let strip: HTMLDivElement | undefined = $state();
  const tabEls: Record<string, HTMLElement> = {};

  // ---------- Rename ----------
  let editing = $state<string | null>(null);
  let draft = $state('');
  let input: HTMLInputElement | undefined = $state();

  function startRename(p: Patch) {
    closeMenu();
    draft = p.name;
    editing = p.id;
    queueMicrotask(() => input?.select());
  }

  function finishRename(save: boolean) {
    const p = project.patches.find((x) => x.id === editing);
    editing = null;
    const name = draft.trim();
    if (save && p && name) p.name = name;
  }

  // ---------- Menu (⋯ / right-click) and delete confirmation ----------
  let menu = $state<{ id: string; x: number; confirm: boolean } | null>(null);
  const menuPatch = $derived(menu ? project.patches.find((p) => p.id === menu!.id) : undefined);

  function openMenu(p: Patch) {
    const tab = tabEls[p.id];
    if (!tab || !bar) return;
    const x = tab.getBoundingClientRect().left - bar.getBoundingClientRect().left;
    menu = { id: p.id, x: Math.max(4, x), confirm: false };
  }

  function closeMenu() {
    menu = null;
  }

  /**
   * Place a popover at x (relative to the bar), shifted left when it would stick out past the
   * right edge of the window, so the last tabs' menu stays fully visible.
   */
  function keepInside(node: HTMLElement, x: number) {
    const place = (x: number) => {
      node.style.left = `${x}px`;
      const overflow = node.getBoundingClientRect().right - (window.innerWidth - 8);
      if (overflow > 0) node.style.left = `${Math.max(4, x - overflow)}px`;
    };
    place(x);
    return { update: place };
  }

  // ---------- Select and drag to reorder ----------
  /** grab: pointer distance from the tab's left edge when the drag started. */
  let drag: { id: string; startX: number; grab: number; moved: boolean; x: number } | null = null;
  let dragging = $state<string | null>(null);
  /** How far the dragged tab is shifted from its place in the row, to stay under the pointer. */
  let dx = $state(0);

  /** Left edge of a tab in its place in the row (on screen, ignoring any shift or animation). */
  function slotLeft(id: string): number {
    const el = tabEls[id];
    if (!el || !strip) return NaN;
    return strip.getBoundingClientRect().left + el.offsetLeft - strip.scrollLeft;
  }

  function ontabpointerdown(e: PointerEvent, p: Patch) {
    if (e.button !== 0 || editing === p.id) return;
    selectPatch(p.id);
    view.main = 'patch';
    drag = { id: p.id, startX: e.clientX, grab: e.clientX - slotLeft(p.id), moved: false, x: e.clientX };
    window.addEventListener('pointermove', ondragmove);
    window.addEventListener('pointerup', ondragend);
    window.addEventListener('pointercancel', ondragend);
  }

  function ondragmove(e: PointerEvent) {
    if (!drag) return;
    drag.x = e.clientX;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) < 5) return;
      drag.moved = true;
      dragging = drag.id;
      closeMenu();
    }
    // Swap with a neighbour once the dragged tab's middle passes the middle of its place.
    const id = drag.id;
    const centre = e.clientX - drag.grab + (tabEls[id]?.offsetWidth ?? 0) / 2;
    const mid = (k: number) => {
      const other = project.patches[k]!.id;
      return slotLeft(other) + (tabEls[other]?.offsetWidth ?? 0) / 2;
    };
    const from = project.patches.findIndex((p) => p.id === id);
    let to = from;
    while (to + 1 < project.patches.length && centre > mid(to + 1)) to++;
    if (to === from) while (to > 0 && centre < mid(to - 1)) to--;
    if (to !== from) movePatch(from, to);
    // The row changes on the next update; then keep the tab under the pointer.
    void tick().then(followPointer);
    followPointer();
  }

  function followPointer() {
    if (!drag?.moved) return;
    dx = drag.x - drag.grab - slotLeft(drag.id);
  }

  function ondragend() {
    drag = null;
    dragging = null;
    dx = 0;
    window.removeEventListener('pointermove', ondragmove);
    window.removeEventListener('pointerup', ondragend);
    window.removeEventListener('pointercancel', ondragend);
  }

  /** Slide tabs to their new place when the order changes, except the one being dragged. */
  function slide(node: Element, rects: { from: DOMRect; to: DOMRect }, params: { skip: boolean }) {
    return params.skip ? { duration: 0 } : flip(node, rects, { duration: 160 });
  }

  $effect(() => () => ondragend());

  // Keep the shown tab in view when it changes (new or duplicated patches land off-screen).
  $effect(() => {
    if (view.main !== 'patch') return;
    const el = tabEls[project.activePatch];
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  /** The mouse wheel scrolls the tabs sideways. */
  function onwheel(e: WheelEvent) {
    if (!strip || e.deltaY === 0 || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft += e.deltaY;
    e.preventDefault();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && menu) closeMenu();
  }
</script>

<svelte:window {onkeydown} />

<div class="tabbar" bind:this={bar}>
  <button
    class="view-button"
    class:on={view.main === 'mixer'}
    type="button"
    title="Mixer: the channels of all patches side by side"
    aria-pressed={view.main === 'mixer'}
    onclick={() => (view.main = view.main === 'mixer' ? 'patch' : 'mixer')}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 2v12M8 2v12M12 2v12" stroke="currentColor" stroke-width="1.3" fill="none" />
      <rect x="2.5" y="8.5" width="3" height="2" rx="0.6" fill="currentColor" />
      <rect x="6.5" y="4.5" width="3" height="2" rx="0.6" fill="currentColor" />
      <rect x="10.5" y="10" width="3" height="2" rx="0.6" fill="currentColor" />
    </svg>
    Mixer
  </button>
  <button
    class="view-button"
    class:on={view.main === 'timeline'}
    type="button"
    title="Timeline: arrange the song, one track per patch"
    aria-pressed={view.main === 'timeline'}
    onclick={() => (view.main = view.main === 'timeline' ? 'patch' : 'timeline')}
  >
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2 3.5h12M2 8h12M2 12.5h12" stroke="currentColor" stroke-width="1" opacity="0.45" fill="none" />
      <rect x="2.5" y="2" width="5" height="3" rx="0.8" fill="currentColor" />
      <rect x="6" y="6.5" width="7" height="3" rx="0.8" fill="currentColor" />
      <rect x="3.5" y="11" width="4" height="3" rx="0.8" fill="currentColor" />
    </svg>
    Timeline
  </button>
  <span class="sep" aria-hidden="true"></span>

  <div class="tabs" role="tablist" aria-label="Patches" bind:this={strip} {onwheel}>
    {#each project.patches as p (p.id)}
      {@const active = p.id === project.activePatch && view.main === 'patch'}
      <div
        class="tab"
        class:active
        class:dragging={dragging === p.id}
        style:--tab-color={channelColor(p.color)}
        style:transform={dragging === p.id ? `translateX(${dx}px)` : undefined}
        animate:slide={{ skip: dragging === p.id }}
        bind:this={tabEls[p.id]}
        role="tab"
        tabindex={active ? 0 : -1}
        aria-selected={active}
        title={editing === p.id ? undefined : `${p.name} — double-click to rename, drag to move`}
        onpointerdown={(e) => ontabpointerdown(e, p)}
        onkeydown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'F2') startRename(p);
        }}
        oncontextmenu={(e) => {
          e.preventDefault();
          selectPatch(p.id);
          view.main = 'patch';
          openMenu(p);
        }}
      >
        <span class="dot" aria-hidden="true"></span>
        {#if editing === p.id}
          <input
            class="name-input"
            bind:this={input}
            bind:value={draft}
            aria-label="Patch name"
            maxlength="40"
            spellcheck="false"
            size={Math.max(4, draft.length)}
            onpointerdown={(e) => e.stopPropagation()}
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') finishRename(true);
              else if (e.key === 'Escape') finishRename(false);
            }}
            onblur={() => finishRename(true)}
          />
        {:else}
          <!-- svelte-ignore a11y_no_static_element_interactions (rename is also in the ⋯ menu) -->
          <span class="name" ondblclick={() => startRename(p)}>{p.name}</span>
        {/if}
        {#if active && editing !== p.id}
          <button
            class="more"
            type="button"
            title="Patch options"
            aria-label={`Options for ${p.name}`}
            aria-expanded={menu?.id === p.id}
            onpointerdown={(e) => e.stopPropagation()}
            onclick={() => (menu?.id === p.id ? closeMenu() : openMenu(p))}
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
              <circle cx="8" cy="8" r="1.3" fill="currentColor" />
              <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
            </svg>
          </button>
        {/if}
      </div>
    {/each}
    <button class="add" type="button" title="New patch" aria-label="New patch" onclick={() => {
        addPatch();
        view.main = 'patch';
      }}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  {#if menu && menuPatch}
    <div class="backdrop" role="presentation" onpointerdown={closeMenu}></div>
    {#if menu.confirm}
      <div class="popover confirm" role="dialog" aria-label="Delete patch" use:keepInside={menu.x}>
        <p>Delete “{menuPatch.name}” with all its modules? You can undo this.</p>
        <div class="actions">
          <button type="button" class="pill" onclick={closeMenu}>Cancel</button>
          <button
            type="button"
            class="pill danger"
            onclick={() => {
              const id = menuPatch.id;
              closeMenu();
              removePatch(id);
            }}>Delete</button
          >
        </div>
      </div>
    {:else}
      <div class="popover menu" role="menu" aria-label={`Options for ${menuPatch.name}`} use:keepInside={menu.x}>
        <button type="button" role="menuitem" onclick={() => startRename(menuPatch)}>Rename</button>
        <button
          type="button"
          role="menuitem"
          onclick={() => {
            const id = menuPatch.id;
            closeMenu();
            duplicatePatch(id);
          }}>Duplicate</button
        >
        <button
          type="button"
          role="menuitem"
          class="delete"
          disabled={project.patches.length <= 1}
          title={project.patches.length <= 1 ? 'A project always has at least one patch' : undefined}
          onclick={() => (menu = { ...menu!, confirm: true })}>Delete…</button
        >
      </div>
    {/if}
  {/if}
</div>

<style>
  .tabbar {
    position: relative;
    z-index: 250001;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 8px;
    background: var(--surface-bar);
    border-bottom: 1px solid var(--border-subtle);
    flex: none;
  }
  .view-button {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .view-button:hover {
    background: var(--surface-control-hover);
  }
  .view-button.on {
    background: var(--signal-audio);
    border-color: var(--signal-audio);
    color: var(--text-on-accent);
  }
  .sep {
    flex: none;
    width: 1px;
    height: 20px;
    background: var(--border-subtle);
  }
  .tabs {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .tabs::-webkit-scrollbar {
    display: none;
  }
  .tab {
    flex: none;
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 26px;
    max-width: 220px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--text-muted);
    font-size: var(--text-sm);
    cursor: pointer;
    user-select: none;
    outline-offset: -2px;
  }
  .tab:hover {
    background: var(--surface-control);
    color: var(--text-default);
  }
  .tab.active {
    padding-right: 4px;
    background: var(--surface-control);
    border-color: var(--border-strong);
    color: var(--text-strong);
  }
  /* The patch colour as a bar along the bottom of the shown tab. */
  .tab.active::after {
    content: '';
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: -1px;
    height: 2px;
    border-radius: 1px;
    background: var(--tab-color);
  }
  /* Back into place after a drop; no transition while following the pointer. */
  .tab {
    transition: transform 140ms var(--ease-out);
  }
  .tab.dragging {
    z-index: 2;
    cursor: grabbing;
    transition: none;
    background: var(--surface-control-hover);
    border-color: var(--border-focus);
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.45);
  }
  .tab:focus-visible {
    outline: 2px solid var(--border-focus);
  }
  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--tab-color);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name-input {
    height: 20px;
    padding: 0 4px;
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-sm);
    background: var(--bg-canvas);
    color: var(--text-strong);
    font-family: inherit;
    font-size: var(--text-sm);
  }
  .more {
    flex: none;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .more:hover,
  .more[aria-expanded='true'] {
    background: var(--surface-control-hover);
    color: var(--text-strong);
  }
  .add {
    flex: none;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px dashed var(--border-strong);
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .add:hover {
    border-style: solid;
    color: var(--text-strong);
    background: var(--surface-control);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 1;
  }
  .popover {
    position: absolute;
    top: calc(100% + 4px);
    z-index: 2;
    background: var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.5);
  }
  .menu {
    display: flex;
    flex-direction: column;
    min-width: 150px;
    padding: 4px;
  }
  .menu button {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-default);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover:not(:disabled) {
    background: var(--surface-control);
  }
  .menu button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .menu .delete:not(:disabled) {
    color: var(--danger);
  }
  .confirm {
    width: 260px;
    padding: var(--space-3);
  }
  .confirm p {
    margin: 0 0 var(--space-3);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .pill {
    height: 28px;
    padding: 0 10px;
    background: var(--surface-control);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-default);
    font-size: 12px;
    cursor: pointer;
  }
  .pill:hover {
    border-color: var(--text-muted);
  }
  .pill.danger {
    background: var(--danger);
    border-color: var(--danger);
    color: #fff;
    font-weight: 600;
  }
</style>
