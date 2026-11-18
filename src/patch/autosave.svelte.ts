/**
 * Keeps a copy of the open project in browser storage and restores it on start-up, so closing or
 * reloading Sonular never loses work.
 */
import { getDefinition } from '../modules/registry';
import { browserStore, type KeyValueStore } from '../platform/storage';
import { parseProjectFile, serializeProject } from './fileFormat';
import { project, replaceProject } from './patch.svelte';

const KEY = 'sonular.autosave';
const SAVE_DELAY_MS = 400;

/** Restore the autosaved project, if any. Returns true when something was restored. */
export function restoreAutosave(store: KeyValueStore = browserStore): boolean {
  const text = store.get(KEY);
  if (!text) return false;
  try {
    replaceProject(parseProjectFile(text, getDefinition).project);
    return true;
  } catch {
    // A broken copy must never block start-up.
    return false;
  }
}

/** Save shortly after every change (including panning and zooming). */
export function startAutosave(store: KeyValueStore = browserStore): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    store.set(KEY, serializeProject(project));
  };
  // Write a pending change immediately when the page is hidden or closed.
  const flushNow = () => {
    if (!timer) return;
    clearTimeout(timer);
    save();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushNow();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flushNow);

  const stop = $effect.root(() => {
    $effect(() => {
      JSON.stringify(project); // deep dependency on everything in the project
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    });
  });

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flushNow);
  };
}
