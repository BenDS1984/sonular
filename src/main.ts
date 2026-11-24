import { mount } from 'svelte';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { startPatchSync } from './engine/engine.svelte';
import { restoreAutosave, startAutosave } from './patch/autosave.svelte';
import { addDefaultOutput, foldAllFamilies } from './patch/fileActions';
import { startHistory } from './patch/history.svelte';
import { startPwa } from './platform/pwa.svelte';
import { isUnsupportedDevice } from './platform/device';
import UnsupportedDevice from './ui/UnsupportedDevice.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Sonular: #app element not found');

function startApp(el: HTMLElement) {
  // Order matters: restore the saved patch first, so it becomes the start of the undo history.
  // Nothing saved (the first visit): start with an Output at the right, like every new patch.
  if (!restoreAutosave()) {
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
