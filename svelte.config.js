import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // Enables TypeScript (and other preprocessors) inside .svelte files
  preprocess: vitePreprocess(),
};
