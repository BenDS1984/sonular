import { mount } from 'svelte';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { startPatchSync } from './engine/engine.svelte';
import { restoreAutosave, startAutosave } from './patch/autosave.svelte';
import { startHistory } from './patch/history.svelte';
import { startPwa } from './platform/pwa.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Modulab: #app element not found');

// Order matters: restore the saved patch first, so it becomes the start of the undo history.
restoreAutosave();
startHistory();
startAutosave();
startPatchSync();
startPwa();

export default mount(App, { target });
