/**
 * All Faust programs compiled from src/dsp/*.dsp, picked up automatically at build time.
 * Adding a new .dsp file is enough to make it available to the engine as `faust:<name>`.
 */
import type { FaustMeta } from './faust/FaustDsp';

const wasmUrls = import.meta.glob<string>('../dsp/generated/*.wasm', {
  query: '?url',
  import: 'default',
  eager: true,
});
const metas = import.meta.glob<FaustMeta>('../dsp/generated/*.json', {
  import: 'default',
  eager: true,
});

export interface FaustProgramSource {
  name: string;
  wasmUrl: string;
  meta: FaustMeta;
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.\w+$/, '');

export const FAUST_PROGRAMS: FaustProgramSource[] = Object.entries(wasmUrls).flatMap(([path, wasmUrl]) => {
  const name = baseName(path);
  const meta = metas[path.replace(/\.wasm$/, '.json')];
  return meta ? [{ name, wasmUrl, meta }] : [];
});

/** Fetch and compile all programs (compilation happens off the audio thread). */
export async function compileFaustPrograms() {
  return Promise.all(
    FAUST_PROGRAMS.map(async ({ name, wasmUrl, meta }) => {
      const res = await fetch(wasmUrl);
      if (!res.ok) throw new Error(`Could not load ${name}.wasm (${res.status})`);
      const module = await WebAssembly.compile(await res.arrayBuffer());
      return { name, module, meta };
    }),
  );
}
