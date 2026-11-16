import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { buildAll, compileDsp } from './scripts/faust-build.mjs';

/** Compiles src/dsp/*.dsp to WebAssembly before dev/build and recompiles on change. */
function faust(): Plugin {
  return {
    name: 'modulab-faust',
    buildStart() {
      buildAll();
    },
    configureServer(server) {
      server.watcher.add('src/dsp/*.dsp');
      const rebuild = (file: string) => {
        if (!file.endsWith('.dsp')) return;
        try {
          compileDsp(file);
          server.config.logger.info(`[faust] compiled ${file}`);
          // The list of programs is collected with import.meta.glob; make sure it is re-evaluated.
          for (const mod of server.moduleGraph.getModulesByFile(
            fileURLToPath(new URL('./src/engine/faustPrograms.ts', import.meta.url)),
          ) ?? []) {
            server.moduleGraph.invalidateModule(mod);
          }
          server.ws.send({ type: 'full-reload' });
        } catch (err) {
          server.config.logger.error((err as Error).message);
        }
      };
      server.watcher.on('add', rebuild);
      server.watcher.on('change', rebuild);
    },
  };
}

/**
 * Installable, offline-capable app. Every built file (code, Faust .wasm/.json, fonts, icons) is
 * precached by a service worker on first visit. New versions wait until the user chooses to
 * reload ('prompt'), so nothing changes in the middle of a session.
 */
const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
  manifest: {
    name: 'Modulab',
    short_name: 'Modulab',
    description: 'A modular DAW in your browser, online and offline.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#121418',
    theme_color: '#121418',
    icons: [
      { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,wasm,json,woff2,svg,png,ico}'],
    navigateFallback: '/index.html',
    cleanupOutdatedCaches: true,
  },
});

export default defineConfig({
  plugins: [faust(), svelte(), pwa],
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
