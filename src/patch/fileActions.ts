/**
 * New / open / save for patches. Saving downloads a .sonular file; opening reads one chosen by
 * the user (file picker or drag and drop). Both are undoable like any other edit.
 */
import { DEFAULT_TEMPO } from '../engine/core/Transport';
import { getDefinition } from '../modules/registry';
import { dialogs } from '../ui/dialogs.svelte';
import { showToast } from '../ui/toast.svelte';
import { FILE_EXTENSION, PatchFileError, fileNameFor, parsePatchFile, serializePatch } from './fileFormat';
import { snap } from './geometry';
import * as ops from './operations';
import { prefs } from '../ui/prefs.svelte';
import { canvasState, DEFAULT_PATCH_NAME, fitAll, patch, setLimiter } from './patch.svelte';
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
  setLimiter(loaded.limiter !== false);
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
  setLimiter(true);
  patch.modules = [];
  patch.cables = [];
  patch.view = { x: 0, y: 0, zoom: 1 };
  addDefaultOutput();
}

/** Room kept between the Output and the right edge of the canvas, in canvas pixels. */
const OUTPUT_MARGIN = 56;
/** About how tall the Output panel is (measured), to put it in the vertical middle. */
const OUTPUT_HEIGHT = 340;

/**
 * Put an Output module at the right of the canvas, in the vertical middle, for a patch that starts
 * empty: nearly every patch ends in one. The canvas is measured when it is on screen; at start-up,
 * before it is drawn, its size is worked out from the window and the browser panel.
 */
export function addDefaultOutput() {
  const def = getDefinition('output');
  if (!def) return;
  const w = canvasState.viewport.w || Math.max(600, window.innerWidth - (prefs.browserOpen ? prefs.browserWidth : 0));
  const h = canvasState.viewport.h || Math.max(400, window.innerHeight - 56);
  const view = patch.view;
  // The canvas point at the right edge of the screen, with the view as it is.
  const right = (w - view.x) / view.zoom;
  const middle = (h / 2 - view.y) / view.zoom;
  ops.addModule(patch, def, snap(right - def.width - OUTPUT_MARGIN), snap(Math.max(24, middle - OUTPUT_HEIGHT / 2)));
}
