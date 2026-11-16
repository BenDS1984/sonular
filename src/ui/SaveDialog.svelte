<!-- "Save patch" dialog: asks for a name before the first save of an untitled patch. -->
<script lang="ts">
  import { saveAs } from '../patch/fileActions';
  import { FILE_EXTENSION, fileNameFor } from '../patch/fileFormat';
  import { dialogs } from './dialogs.svelte';

  let name = $state('');
  let input: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (!dialogs.save) return;
    name = '';
    queueMicrotask(() => input?.focus());
  });

  function close() {
    dialogs.save = false;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) {
      input?.focus();
      return;
    }
    close();
    saveAs(name);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    // Keep app shortcuts (Space, Delete, Ctrl+Z, ...) away from the dialog.
    e.stopPropagation();
  }
</script>

{#if dialogs.save}
  <div class="backdrop" role="presentation" onpointerdown={close}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="save-title" tabindex="-1" {onkeydown}>
  <form onsubmit={submit}>
    <h2 id="save-title">Save patch</h2>
    <label for="save-name">Name</label>
    <input
      id="save-name"
      bind:this={input}
      bind:value={name}
      placeholder="Night drone"
      maxlength="80"
      autocomplete="off"
      spellcheck="false"
    />
    <p class="hint">
      {#if name.trim()}
        Saves <strong>{fileNameFor(name)}</strong> to your downloads.
      {:else}
        Give your patch a name. It's saved as a {FILE_EXTENSION} file in your downloads.
      {/if}
    </p>
    <div class="actions">
      <button type="button" class="btn" onclick={close}>Cancel</button>
      <button type="submit" class="btn primary" disabled={!name.trim()}>Save</button>
    </div>
  </form>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 290000;
    background: rgb(0 0 0 / 0.45);
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 22%;
    transform: translateX(-50%);
    z-index: 290001;
    width: min(380px, calc(100vw - 32px));
    padding: var(--space-5);
    background: var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.55);
  }
  h2 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-lg);
    font-weight: var(--weight-medium);
    color: var(--text-strong);
  }
  label {
    display: block;
    margin-bottom: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }
  input {
    width: 100%;
    height: 36px;
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
  .hint {
    min-height: 2.8em;
    margin: var(--space-2) 0 var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.4;
  }
  .hint strong {
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .btn {
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-control);
    color: var(--text-default);
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: var(--surface-control-hover);
  }
  .btn.primary {
    background: var(--signal-audio);
    border-color: var(--signal-audio);
    color: var(--text-on-accent);
    font-weight: var(--weight-bold);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
