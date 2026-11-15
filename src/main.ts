import { mount } from 'svelte';
import './styles/base.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Modulab: #app element not found');

export default mount(App, { target });
