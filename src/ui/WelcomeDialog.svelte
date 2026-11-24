<!--
  Welcome window: shown on the first visit, and again from the "About" button in the top bar.
  Explains what Sonular is and that it is an early-stage hobby project.
-->
<script lang="ts">
  import { loadStarterPatch } from '../patch/fileActions';
  import { patch } from '../patch/patch.svelte';
  import { dialogs } from './dialogs.svelte';
  import { prefs } from './prefs.svelte';

  const SOURCE_URL = 'https://github.com/BenDS1984/sonular';

  let dialog: HTMLDivElement | undefined = $state();

  // Whether the canvas was empty when the window opened: then it offers a way to start.
  let emptyAtOpen = $state(true);

  $effect(() => {
    if (!dialogs.welcome) return;
    emptyAtOpen = patch.modules.length === 0;
    queueMicrotask(() => dialog?.focus());
  });

  function close() {
    dialogs.welcome = false;
    prefs.welcomed = true;
  }

  function starter() {
    close();
    loadStarterPatch();
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

{#if dialogs.welcome}
  <div class="backdrop" role="presentation" onpointerdown={close}></div>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="welcome-title"
    tabindex="-1"
    bind:this={dialog}
    {onkeydown}
  >
    <h2 id="welcome-title">Welcome to Sonular</h2>

    <p>
      Sonular is a modular environment for making music in your browser. Add modules such as
      oscillators, sequencers, envelopes and effects, connect them with cables, and shape your own
      sound.
    </p>
    <p>
      This is a hobby project. It also started as a way to explore what building software together
      with AI can do: Sonular is designed and tested by a person and written with the help of
      Claude, an AI assistant.
    </p>
    <p class="note">
      <strong>Early stage:</strong> Sonular has only just started. There are few modules yet, things
      will change, and patches may not always open in later versions. Save your work as a file now
      and then.
    </p>
    <p class="note">
      <strong>Saving your sound:</strong> add a <strong>Recorder</strong> module, press Rec and
      then Play, and save the take as a WAV file.
    </p>
    <p class="small">
      Sonular is free and open source (GPL-3.0).
      <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Source on GitHub</a>
    </p>

    <div class="actions">
      {#if emptyAtOpen}
        <button type="button" class="btn" onclick={close}>Start with an empty patch</button>
        <button type="button" class="btn primary" onclick={starter}>Load a starter patch</button>
      {:else}
        <button type="button" class="btn primary" onclick={close}>Close</button>
      {/if}
    </div>

    <div class="brand" aria-hidden="true">
      <img src="/favicon.svg" alt="" width="44" height="44" />
      <span>SONULAR</span>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 290000;
    background: rgb(0 0 0 / 0.55);
  }
  .dialog {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 290001;
    width: min(580px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: var(--space-6) var(--space-6) var(--space-5);
    background: var(--sheen-module), var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.6);
    outline: none;
  }
  h2 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-xl);
    font-weight: var(--weight-bold);
    color: var(--text-strong);
  }
  p {
    margin: 0 0 var(--space-3);
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .note {
    padding: var(--space-2) var(--space-3);
    border-left: 3px solid var(--signal-audio);
    background: var(--signal-audio-bg);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    color: var(--text-default);
  }
  .note strong {
    color: var(--signal-audio-soft);
    font-weight: var(--weight-bold);
  }
  .small {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
  a {
    color: var(--signal-audio-soft);
  }
  .actions {
    display: flex;
    justify-content: center;
    gap: var(--space-3);
    margin-top: var(--space-5);
  }
  .btn {
    width: 210px;
    height: 36px;
    padding: 0 var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-control);
    color: var(--text-default);
    cursor: pointer;
  }
  .btn:hover {
    background: var(--surface-control-hover);
  }
  .btn.primary {
    background: var(--signal-audio);
    border-color: var(--signal-audio);
    color: var(--text-on-accent);
    font-weight: var(--weight-bold);
  }
  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border-subtle);
  }
  .brand img {
    border-radius: 10px;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.45);
  }
  .brand span {
    font-size: 26px;
    font-weight: var(--weight-bold);
    letter-spacing: 0.14em;
    color: var(--text-strong);
  }
</style>
