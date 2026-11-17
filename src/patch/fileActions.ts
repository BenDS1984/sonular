/**
 * New / open / save for patches. Saving downloads a .sonular file; opening reads one chosen by
 * the user (file picker or drag and drop). Both are undoable like any other edit.
 */
import { DEFAULT_TEMPO } from '../engine/core/Transport';
import { getDefinition } from '../modules/registry';
import { dialogs } from '../ui/dialogs.svelte';
import { showToast } from '../ui/toast.svelte';
import { FILE_EXTENSION, PatchFileError, fileNameFor, parsePatchFile, serializePatch } from './fileFormat';
import { canvasState, DEFAULT_PATCH_NAME, fitAll, patch } from './patch.svelte';
import type { Patch } from './types';
import welcomePreset from '../presets/welcome.sonular?raw';

/**
 * Save, asking for a name first while the patch is still untitled. The browser doesn't tell us
 * which file name the user picks in its own save dialog, so the name is chosen here instead.
 */
export function requestSave() {
  if (patch.name.trim() === '' || patch.name === DEFAULT_PATCH_NAME) dialogs.save = true;
  else savePatchFile();
}

/** Give the patch a name and save it (used by the "Save patch" dialog). */
export function saveAs(name: string) {
  patch.name = name.trim() || DEFAULT_PATCH_NAME;
  savePatchFile();
}

export function savePatchFile() {
  const blob = new Blob([serializePatch(patch)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(patch.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showToast(`Saved “${a.download}” to your downloads`);
}

export async function openPatchFile(file: File) {
  try {
    const fallbackName = file.name.replace(/\.[^.]+$/, '') || DEFAULT_PATCH_NAME;
    const { patch: loaded, warnings } = parsePatchFile(await file.text(), getDefinition, fallbackName);
    applyPatch(loaded);
    showToast(`Opened “${loaded.name}”`);
    for (const w of warnings) showToast(w, 'warning');
  } catch (err) {
    const message = err instanceof PatchFileError ? err.message : 'This file could not be opened.';
    showToast(message, 'error');
  }
}

function applyPatch(loaded: Patch) {
  canvasState.selection = null;
  patch.name = loaded.name;
  patch.tempo = loaded.tempo;
  patch.modules = loaded.modules;
  patch.cables = loaded.cables;
  patch.view = loaded.view;
}

/**
 * The starter patch ("Welcome!", from src/presets): Clock -> Sequencer -> Oscillator ->
 * Envelope -> Reverb -> Mixer -> Output. Built into the app, so it also works offline.
 * Zooms to fit once the modules have been drawn and measured.
 */
export function loadStarterPatch() {
  const { patch: loaded } = parsePatchFile(welcomePreset, getDefinition, 'Welcome!');
  applyPatch(loaded);
  requestAnimationFrame(() => requestAnimationFrame(fitAll));
}

/** Let the user pick a .sonular file. */
export function choosePatchFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${FILE_EXTENSION},application/json`;
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void openPatchFile(file);
  };
  input.click();
}

export function newPatch() {
  canvasState.selection = null;
  patch.name = DEFAULT_PATCH_NAME;
  patch.tempo = DEFAULT_TEMPO;
  patch.modules = [];
  patch.cables = [];
  patch.view = { x: 0, y: 0, zoom: 1 };
}
