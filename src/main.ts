import { mount } from 'svelte';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './App.svelte';
import { startPatchSync } from './engine/engine.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Modulab: #app element not found');

startPatchSync();

export default mount(App, { target });
