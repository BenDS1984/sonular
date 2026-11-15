import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
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
      server.watcher.on('change', (file) => {
        if (!file.endsWith('.dsp')) return;
        try {
          compileDsp(file);
          server.config.logger.info(`[faust] recompiled ${file}`);
          server.ws.send({ type: 'full-reload' });
        } catch (err) {
          server.config.logger.error((err as Error).message);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [faust(), svelte()],
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
