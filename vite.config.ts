import { fileURLToPath } from 'node:url';
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
