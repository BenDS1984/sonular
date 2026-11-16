/**
 * CPU cost per module. Skipped in normal test runs; run it with `npm run bench`.
 *
 * Each module renders 128-frame blocks (2.67 ms of audio at 48 kHz) with a busy input. The
 * time per block divided by 2.67 ms is the share of one CPU core the module takes while
 * playing. Node runs the same WebAssembly as the browser's audio thread, but the browser adds
 * its own overhead, so treat these as best-case figures for comparing modules.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { BLOCK_SIZE } from '../engine/core/types';
import { FaustDsp, type FaustMeta } from '../engine/faust/FaustDsp';

const SR = 48000;
const BLOCK_MS = (BLOCK_SIZE / SR) * 1000;

function load(name: string, params: Record<string, number> = {}) {
  const path = (ext: string) => fileURLToPath(new URL(`./generated/${name}.${ext}`, import.meta.url));
  const dsp = new FaustDsp(
    new WebAssembly.Module(readFileSync(path('wasm'))),
    JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta,
    SR,
  );
  dsp.onConnectionsChanged(Array.from({ length: dsp.numInputs }, () => true));
  for (const [k, v] of Object.entries(params)) dsp.setParam(k, v);
  return dsp;
}

/** Median time per block in ms, over several rounds of 10 seconds of audio each. */
function msPerBlock(dsp: FaustDsp): number {
  const inputs = Array.from({ length: dsp.numInputs }, (_, c) =>
    Float32Array.from({ length: BLOCK_SIZE }, (_, i) => 0.3 * Math.sin(i * (0.1 + 0.07 * c))),
  );
  const silent = inputs.map(() => false);
  const outputs = Array.from({ length: dsp.numOutputs }, () => new Float32Array(BLOCK_SIZE));
  const blocks = Math.round((10 * SR) / BLOCK_SIZE);
  const rounds: number[] = [];
  for (let r = 0; r < 7; r++) {
    const t0 = performance.now();
    for (let b = 0; b < blocks; b++) dsp.process(inputs, silent, outputs, BLOCK_SIZE);
    rounds.push((performance.now() - t0) / blocks);
  }
  rounds.sort((a, b) => a - b);
  return rounds[3]!;
}

describe.skipIf(import.meta.env.MODE !== 'bench')('CPU cost per module', () => {
  it('measures each module', () => {
    const modules: [string, FaustDsp][] = [
      ['Oscillator (saw)', load('osc', { wave: 2 })],
      ['Mixer (4 channels)', load('mixer')],
      ['Reverb', load('reverb')],
      ['Output', load('output')],
    ];
    const rows = modules.map(([name, dsp]) => {
      const ms = msPerBlock(dsp);
      const pct = (ms / BLOCK_MS) * 100;
      return `${name.padEnd(20)} ${(ms * 1000).toFixed(1).padStart(7)} µs/block  ${pct.toFixed(2).padStart(6)} % of one core  ~${Math.floor(100 / pct)} fit`;
    });
    console.log(['', `One block = ${BLOCK_MS.toFixed(2)} ms of audio at 48 kHz`, ...rows, ''].join('\n'));
  });
});
