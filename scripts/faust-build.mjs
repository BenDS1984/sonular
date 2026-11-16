// Compiles every Faust program in src/dsp/*.dsp to WebAssembly.
//
// For each `name.dsp` this writes `src/dsp/generated/name.wasm` and `name.json` (Faust metadata:
// memory size, channel counts, parameters). Up-to-date outputs are skipped.
//
// Used by the Vite plugin in vite.config.ts (dev + build) and runnable on its own:
//   node scripts/faust-build.mjs [--force]

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DSP_DIR = join(ROOT, 'src', 'dsp');
export const OUT_DIR = join(DSP_DIR, 'generated');
const FAUST_CLI = join(ROOT, 'node_modules', '@grame', 'faustwasm', 'scripts', 'faust2wasm.js');

function isUpToDate(dspPath, name) {
  const wasm = join(OUT_DIR, `${name}.wasm`);
  const json = join(OUT_DIR, `${name}.json`);
  if (!existsSync(wasm) || !existsSync(json)) return false;
  const src = statSync(dspPath).mtimeMs;
  return statSync(wasm).mtimeMs >= src && statSync(json).mtimeMs >= src;
}

/** Compile one .dsp file. Throws with the compiler output on failure. */
export function compileDsp(dspPath) {
  const name = basename(dspPath, '.dsp');
  const tmp = mkdtempSync(join(tmpdir(), 'sonular-faust-'));
  try {
    execFileSync(process.execPath, [FAUST_CLI, dspPath, tmp, '-no-template'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    mkdirSync(OUT_DIR, { recursive: true });
    copyFileSync(join(tmp, 'dsp-module.wasm'), join(OUT_DIR, `${name}.wasm`));
    copyFileSync(join(tmp, 'dsp-meta.json'), join(OUT_DIR, `${name}.json`));
  } catch (err) {
    const out = [err.stdout, err.stderr].filter(Boolean).map(String).join('\n').trim();
    throw new Error(`Faust compilation failed for ${name}.dsp\n${out || err.message}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return name;
}

/** Compile all .dsp files that changed. Returns the names that were (re)built. */
export function buildAll({ force = false, log = console.log } = {}) {
  const files = readdirSync(DSP_DIR).filter((f) => f.endsWith('.dsp'));
  const built = [];
  for (const file of files) {
    const path = join(DSP_DIR, file);
    const name = basename(file, '.dsp');
    if (!force && isUpToDate(path, name)) continue;
    compileDsp(path);
    built.push(name);
  }
  if (built.length) log(`[faust] compiled ${built.join(', ')}`);
  return built;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildAll({ force: process.argv.includes('--force') });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
