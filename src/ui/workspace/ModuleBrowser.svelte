<!--
  Popup for adding modules: search field plus modules grouped by category.
  Keyboard: type to filter, ↑/↓ to choose, Enter to add, Escape to close.
-->
<script lang="ts">
  import { CATEGORY_ORDER, MODULES } from '../../modules/registry';
  import type { ModuleDefinition } from '../../modules/types';

  interface Props {
    x: number;
    y: number;
    onpick: (def: ModuleDefinition) => void;
    onclose: () => void;
  }

  let { x, y, onpick, onclose }: Props = $props();

  let query = $state('');
  let activeIndex = $state(0);
  let input: HTMLInputElement | undefined = $state();

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

  $effect(() => {
    void query;
    activeIndex = 0;
  });

  $effect(() => {
    input?.focus();
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      activeIndex = Math.min(matches.length - 1, activeIndex + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      activeIndex = Math.max(0, activeIndex - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const def = matches[activeIndex];
      if (def) onpick(def);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      onclose();
      e.preventDefault();
    }
    e.stopPropagation();
  }
</script>

<div class="backdrop" role="presentation" onpointerdown={onclose}></div>
<div
  class="browser"
  style:left={`${x}px`}
  style:top={`${y}px`}
  role="dialog"
  aria-label="Add module"
  tabindex="-1"
  onpointerdown={(e) => e.stopPropagation()}
  ondblclick={(e) => e.stopPropagation()}
>
  <input
    bind:this={input}
    bind:value={query}
    type="search"
    placeholder="Search modules"
    aria-label="Search modules"
    {onkeydown}
  />
  <div class="list" role="listbox" aria-label="Modules">
    {#each groups as g (g.cat)}
      <div class="category">{g.cat}</div>
      {#each g.items as def (def.type)}
        {@const index = matches.indexOf(def)}
        <button
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          class:active={index === activeIndex}
          style:--item-accent={`var(--signal-${def.signal})`}
          onpointerenter={() => (activeIndex = index)}
          onclick={() => onpick(def)}
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="text">
            <span class="name">{def.title}</span>
            <span class="desc">{def.description}</span>
          </span>
        </button>
      {/each}
    {:else}
      <div class="empty">No modules match “{query}”.</div>
    {/each}
  </div>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 200000;
  }
  .browser {
    position: absolute;
    z-index: 200001;
    width: 300px;
    max-height: min(420px, calc(100% - 24px));
    display: flex;
    flex-direction: column;
    background: var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.5);
    overflow: hidden;
  }
  input {
    margin: var(--space-2);
    height: 32px;
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
    overflow-y: auto;
    padding: 0 var(--space-1) var(--space-2);
  }
  .category {
    padding: var(--space-2) var(--space-2) var(--space-1);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  button {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  button.active {
    background: var(--surface-control);
  }
  .dot {
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--item-accent);
    flex: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .name {
    color: var(--text-strong);
    font-weight: var(--weight-medium);
  }
  .desc {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.35;
  }
  .empty {
    padding: var(--space-3);
    color: var(--text-muted);
  }
</style>
