/**
 * All Faust programs compiled from src/dsp/*.dsp, picked up automatically at build time.
 * Adding a new .dsp file is enough to make it available to the engine as `faust:<name>`.
 *
 * Both the .wasm and its .json metadata are fetched at runtime from the same build. The metadata
 * holds the memory address of every parameter, so it must always match the exact .wasm it
 * describes — bundling the JSON as a module could serve a stale copy after a recompile.
 */
import type { FaustMeta } from './faust/FaustDsp';

const wasmUrls = import.meta.glob<string>('../dsp/generated/*.wasm', {
  query: '?url',
  import: 'default',
  eager: true,
});
const metaUrls = import.meta.glob<string>('../dsp/generated/*.json', {
  query: '?url',
  import: 'default',
  eager: true,
});

export interface FaustProgramSource {
  name: string;
  wasmUrl: string;
  metaUrl: string;
}

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.\w+$/, '');

export const FAUST_PROGRAMS: FaustProgramSource[] = Object.entries(wasmUrls).flatMap(([path, wasmUrl]) => {
  const metaUrl = metaUrls[path.replace(/\.wasm$/, '.json')];
  return metaUrl ? [{ name: baseName(path), wasmUrl, metaUrl }] : [];
});

// During development the files change on disk while their URLs stay the same.
const fetchOptions: RequestInit = import.meta.env.DEV ? { cache: 'no-store' } : {};

/** Fetch and compile all programs (compilation happens off the audio thread). */
export async function compileFaustPrograms() {
  return Promise.all(
    FAUST_PROGRAMS.map(async ({ name, wasmUrl, metaUrl }) => {
      const [wasmRes, metaRes] = await Promise.all([fetch(wasmUrl, fetchOptions), fetch(metaUrl, fetchOptions)]);
      if (!wasmRes.ok) throw new Error(`Could not load ${name}.wasm (${wasmRes.status})`);
      if (!metaRes.ok) throw new Error(`Could not load ${name}.json (${metaRes.status})`);
      const [module, meta] = await Promise.all([
        WebAssembly.compile(await wasmRes.arrayBuffer()),
        metaRes.json() as Promise<FaustMeta>,
      ]);
      return { name, module, meta };
    }),
  );
}
