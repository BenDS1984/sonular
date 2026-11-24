<!-- "Export audio" dialog: render the whole song or the loop to a WAV file in the downloads. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    cancelExport,
    exportFileName,
    exportState,
    freePatchNames,
    loopExportable,
    MAX_TAIL_SECONDS,
    startExport,
    type ExportOptions,
  } from '../engine/exportSong.svelte';
  import { project } from '../patch/patch.svelte';
  import { songEnd } from '../patch/timeline';
  import { dialogs } from './dialogs.svelte';
  import { formatLength } from './timeline/timelineGeometry';

  let what: ExportOptions['what'] = $state('song');
  let tail = $state(true);
  let sampleRate: ExportOptions['sampleRate'] = $state(48000);

  const busy = $derived(exportState.phase === 'preparing' || exportState.phase === 'rendering');
  const canLoop = $derived(loopExportable());
  const loop = $derived(project.timeline.loop);
  const free = $derived(freePatchNames());

  $effect(() => {
    if (!dialogs.export) return;
    // A fresh start each time the dialog opens (unless an export is still running); only on
    // opening, so the result of an export stays shown.
    untrack(() => {
      if (!busy) exportState.phase = 'idle';
      if (what === 'loop' && !canLoop) what = 'song';
    });
  });

  function close() {
    if (busy) cancelExport();
    dialogs.export = false;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    void startExport({ what, tail, sampleRate });
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    // Keep app shortcuts (Space, Delete, Ctrl+Z, ...) away from the dialog.
    e.stopPropagation();
  }

  const seconds = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} min`);
</script>

{#if dialogs.export}
  <div class="backdrop" role="presentation" onpointerdown={busy ? undefined : close}></div>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" tabindex="-1" {onkeydown}>
    <form onsubmit={submit}>
      <h2 id="export-title">Export audio</h2>

      {#if exportState.phase === 'idle' || exportState.phase === 'error'}
        <fieldset>
          <legend>What</legend>
          <label class="choice">
            <input type="radio" name="what" value="song" bind:group={what} />
            The whole song <span class="muted">(start to End, {formatLength(songEnd(project))})</span>
          </label>
          <label class="choice" class:off={!canLoop}>
            <input type="radio" name="what" value="loop" bind:group={what} disabled={!canLoop} />
            The loop <span class="muted">({canLoop ? formatLength(loop.end - loop.start) : 'not set'})</span>
          </label>
        </fieldset>
        {#if free.length > 0}
          <p class="note">
            Only what plays from the timeline is exported. Left out (Free): {free.join(', ')}.
          </p>
        {/if}

        <label class="choice" class:off={what !== 'song'}>
          <input type="checkbox" bind:checked={tail} disabled={what !== 'song'} />
          Let it ring out after End <span class="muted">(reverb, delay; up to {MAX_TAIL_SECONDS} s)</span>
        </label>

        <fieldset>
          <legend>Quality</legend>
          <label class="choice">
            <input type="radio" name="rate" value={48000} bind:group={sampleRate} />
            48 kHz, 24-bit
          </label>
          <label class="choice">
            <input type="radio" name="rate" value={44100} bind:group={sampleRate} />
            44.1 kHz, 24-bit <span class="muted">(CD, streaming)</span>
          </label>
        </fieldset>

        {#if exportState.phase === 'error'}
          <p class="message error">The export did not work: {exportState.error}</p>
        {:else}
          <p class="message">Saves <strong>{exportFileName(project.name, what)}</strong> to your downloads.</p>
        {/if}

        <div class="actions">
          <button type="button" class="btn" onclick={close}>Cancel</button>
          <button type="submit" class="btn primary">Export</button>
        </div>
      {:else if busy}
        <p class="message">{exportState.phase === 'preparing' ? 'Getting ready…' : 'Rendering…'}</p>
        <div class="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exportState.progress * 100)}>
          <div class="fill" style:width={`${exportState.progress * 100}%`}></div>
        </div>
        <div class="actions">
          <button type="button" class="btn" onclick={cancelExport}>Cancel</button>
        </div>
      {:else}
        <p class="message">
          Saved <strong>{exportState.fileName}</strong> ({seconds(exportState.seconds)}) to your downloads.
        </p>
        {#if exportState.clipped}
          <p class="message error">
            The sound went over 0 dB somewhere, so it is clipped there. Turn the master down or switch the limiter on,
            and export again.
          </p>
        {/if}
        <div class="actions">
          <button type="button" class="btn primary" onclick={close}>Close</button>
        </div>
      {/if}
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
    top: 18%;
    transform: translateX(-50%);
    z-index: 290001;
    width: min(400px, calc(100vw - 32px));
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
  fieldset {
    margin: 0 0 var(--space-3);
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: var(--space-1);
    padding: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }
  .choice {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 3px 0;
    font-size: var(--text-sm);
    color: var(--text-default);
    cursor: pointer;
  }
  .choice.off {
    opacity: 0.5;
    cursor: default;
  }
  .choice input {
    accent-color: var(--signal-audio);
  }
  .muted {
    color: var(--text-muted);
  }
  .note {
    margin: calc(-1 * var(--space-2)) 0 var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.4;
  }
  .message {
    margin: var(--space-3) 0 var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-muted);
    line-height: 1.4;
  }
  .message strong {
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
  }
  .message.error {
    color: var(--red-500);
  }
  .bar {
    height: 8px;
    margin-bottom: var(--space-4);
    border-radius: 4px;
    background: var(--surface-inset);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--signal-audio);
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
</style>
