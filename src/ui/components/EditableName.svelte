<!--
  A name with a small pencil button after it. The pencil, a double-click on the name or F2 (when
  focused) turn it into a text field. An owner that grabs
  the pointer (a draggable module header) gets the double-click itself and calls `start()`. Enter or clicking
  away keeps the new name, Escape cancels. An empty name is passed on as '' (the owner decides
  what that means, e.g. back to the default name).
-->
<script lang="ts">
  interface Props {
    /** The name shown. */
    text: string;
    /** What the field starts with (the user's own name, '' when there is none). */
    value?: string;
    /** Shown in the empty field. */
    placeholder?: string;
    label: string;
    title?: string;
    onrename: (name: string) => void;
  }

  let { text, value = text, placeholder = '', label, title = '', onrename }: Props = $props();

  let editing = $state(false);
  let draft = $state('');
  let input: HTMLInputElement | undefined = $state();

  /** Open the text field (also called by an owner whose double-click lands elsewhere). */
  export function start() {
    draft = value;
    editing = true;
    queueMicrotask(() => input?.select());
  }

  function finish(save: boolean) {
    if (!editing) return;
    editing = false;
    if (save) onrename(draft.trim());
  }
</script>

{#if editing}
  <input
    class="name-input"
    bind:this={input}
    bind:value={draft}
    aria-label={label}
    {placeholder}
    maxlength="40"
    spellcheck="false"
    size={Math.max(6, draft.length + 1, placeholder.length)}
    onpointerdown={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    }}
    onblur={() => finish(true)}
  />
{:else}
  <span class="wrap">
  <!-- svelte-ignore a11y_no_static_element_interactions (double-click to rename; the pencil button is the accessible way) -->
  <span
    class="name"
    title={title ? `${title} — double-click to rename` : 'Double-click to rename'}
    ondblclick={(e) => {
      e.stopPropagation();
      start();
    }}
    onkeydown={(e) => {
      if (e.key === 'F2') start();
    }}>{text}</span
  >
  <button
    type="button"
    class="pencil"
    aria-label={`Rename ${text}`}
    title="Rename"
    onpointerdown={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    onclick={(e) => {
      e.stopPropagation();
      start();
    }}
  >
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path d="M11 2.5l2.5 2.5L6 12.5l-3.25.75L3.5 10 11 2.5z" />
    </svg>
  </button>
  </span>
{/if}

<style>
  .wrap {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }
  .pencil {
    flex: none;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    opacity: 0.55;
    cursor: pointer;
  }
  .pencil svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linejoin: round;
  }
  .wrap:hover .pencil {
    opacity: 0.85;
  }
  .pencil:hover {
    opacity: 1;
    background: rgb(255 255 255 / 0.12);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name-input {
    min-width: 0;
    max-width: 100%;
    height: 20px;
    padding: 0 4px;
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-sm);
    background: var(--bg-canvas);
    color: var(--text-strong);
    font-family: inherit;
    font-size: var(--text-sm);
  }
</style>
