import { mount } from 'svelte';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { startPatchSync } from './engine/engine.svelte';
import { getDefinition } from './modules/registry';
import { restoreAutosave, startAutosave } from './patch/autosave.svelte';
import { addModule, patch } from './patch/patch.svelte';
import { addDefaultOutput, ensureOutput, foldAllFamilies } from './patch/fileActions';
import { startHistory } from './patch/history.svelte';
import { startPwa } from './platform/pwa.svelte';
import { isUnsupportedDevice } from './platform/device';
import UnsupportedDevice from './ui/UnsupportedDevice.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Sonular: #app element not found');

/**
 * Development aid: `?sandbox=sampler,clock` opens an empty patch with just those modules side by side,
 * in view, and touches nothing the user has saved (no restore, no autosave). Never in a build.
 */
function sandboxTypes(): string[] | null {
  if (!import.meta.env.DEV) return null;
  const list = new URLSearchParams(location.search).get('sandbox');
  return list ? list.split(',').filter(Boolean) : null;
}

function startSandbox(types: string[]) {
  let x = 20;
  for (const type of types) {
    addModule(type, x, 20);
    x += (getDefinition(type)?.width ?? 200) + 40;
  }
  patch.view = { x: 20, y: 20, zoom: 1 };
}

function startApp(el: HTMLElement) {
  const sandbox = sandboxTypes();
  if (sandbox) {
    startSandbox(sandbox);
    startHistory();
    startPatchSync();
    return mount(App, { target: el });
  }
  // Order matters: restore the saved patch first, so it becomes the start of the undo history.
  // Nothing saved (the first visit): start with an Output at the right, like every new patch.
  if (restoreAutosave()) ensureOutput();
  else {
    addDefaultOutput();
    foldAllFamilies();
  }
  startHistory();
  startAutosave();
  startPatchSync();
  startPwa();
  return mount(App, { target: el });
}

// Phones and tablets get a message instead of the app; nothing else is started.
export default isUnsupportedDevice() ? mount(UnsupportedDevice, { target }) : startApp(target);
