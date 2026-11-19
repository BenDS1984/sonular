/**
 * New / open / save for projects. Saving downloads a .sonular file; opening reads one chosen by
 * the user (file picker or drag and drop). Both are undoable like any other edit.
 */
import { DEFAULT_TEMPO } from '../engine/core/Transport';
import { getDefinition } from '../modules/registry';
import { dialogs } from '../ui/dialogs.svelte';
import { showToast } from '../ui/toast.svelte';
import { FILE_EXTENSION, ProjectFileError, fileNameFor, parseProjectFile, serializeProject } from './fileFormat';
import { DEFAULT_PROJECT_NAME, fitAll, patch, project, replaceProject } from './patch.svelte';
import { emptyProject } from './operations';
import welcomePreset from '../presets/welcome.sonular?raw';

/**
 * Save, asking for a name first while the project is still untitled. The browser doesn't tell us
 * which file name the user picks in its own save dialog, so the name is chosen here instead.
 */
export function requestSave() {
  if (project.name.trim() === '' || project.name === DEFAULT_PROJECT_NAME) dialogs.save = true;
  else saveProjectFile();
}

/** Give the project a name and save it (used by the "Save project" dialog). */
export function saveAs(name: string) {
  project.name = name.trim() || DEFAULT_PROJECT_NAME;
  saveProjectFile();
}

export function saveProjectFile() {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(project.name);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  showToast(`Saved “${a.download}” to your downloads`);
}

export async function openProjectFile(file: File) {
  try {
    const fallbackName = file.name.replace(/\.[^.]+$/, '') || DEFAULT_PROJECT_NAME;
    const { project: loaded, warnings } = parseProjectFile(await file.text(), getDefinition, fallbackName);
    replaceProject(loaded);
    showToast(`Opened “${loaded.name}”`);
    for (const w of warnings) showToast(w, 'warning');
  } catch (err) {
    const message = err instanceof ProjectFileError ? err.message : 'This file could not be opened.';
    showToast(message, 'error');
  }
}

/**
 * The starter patch ("Welcome!", from src/presets): Clock -> Sequencer -> Oscillator ->
 * Envelope -> Reverb -> Mixer -> Output. Built into the app, so it also works offline.
 * Zooms to fit once the modules have been drawn and measured.
 */
export function loadStarterPatch() {
  const starter = parseProjectFile(welcomePreset, getDefinition, 'Welcome!').project;
  if (project.patches.length === 1) {
    replaceProject(starter);
  } else {
    // Other patches exist: fill only the patch on screen, keeping its name and colour.
    const from = starter.patches[0]!;
    patch.modules = from.modules;
    patch.cables = from.cables;
  }
  requestAnimationFrame(() => requestAnimationFrame(fitAll));
}

/** Let the user pick a .sonular file. */
export function chooseProjectFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = `${FILE_EXTENSION},application/json`;
  input.onchange = () => {
    const file = input.files?.[0];
    if (file) void openProjectFile(file);
  };
  input.click();
}

export function newProject() {
  replaceProject(emptyProject(DEFAULT_PROJECT_NAME, DEFAULT_TEMPO));
}
