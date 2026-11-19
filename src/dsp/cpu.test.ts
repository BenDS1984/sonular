/**
 * CPU cost per module. Skipped in normal test runs; run it with `npm run bench`.
 *
 * Each module renders 128-frame blocks (2.67 ms of audio at 48 kHz) with a busy input. The
 * time per block divided by 2.67 ms is the share of one CPU core the module takes while
 * playing. Node runs the same WebAssembly as the browser's audio thread, but the browser adds
 * its own overhead, so treat these as best-case figures for comparing modules.
 *
 * The second part plays whole projects: several copies of the Welcome! patch at once, through the
 * same engine as the browser (all patches in one graph, each into its Channel, then the master).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, vi } from 'vitest';

// Module panels read live meters from the audio engine, which needs a browser; the projects only
// need the module definitions (ports and parameters).
vi.mock('../engine/engine.svelte', () => ({
  engineState: { beat: 0, playing: false },
  meterValue: () => 0,
  meterValueIn: () => 0,
}));
import { Engine } from '../engine/core/Engine';
import { Transport } from '../engine/core/Transport';
import { BLOCK_SIZE, type DspModule, type ModuleFactory } from '../engine/core/types';
import { declaredSink } from '../engine/faust/FaustDsp';
import { FaustSink } from '../engine/faust/FaustSink';
import { Master } from '../engine/modules/Master';
import { NATIVE_MODULES } from '../engine/modules/native';
import { toEnginePatch } from '../engine/toEnginePatch';
import { getDefinition } from '../modules/registry';
import { parseProjectFile } from '../patch/fileFormat';
import { CHANNEL_TYPE, duplicatePatch } from '../patch/operations';
import welcome from '../presets/welcome.sonular?raw';
import { Clock } from '../engine/modules/Clock';
import { Envelope } from '../engine/modules/Envelope';
import { Recorder } from '../engine/modules/Recorder';
import { Scope } from '../engine/modules/Scope';
import { Sequencer } from '../engine/modules/Sequencer';
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
function msPerBlock(dsp: DspModule, transport?: Transport): number {
  const inputs = Array.from({ length: dsp.numInputs }, (_, c) =>
    Float32Array.from({ length: BLOCK_SIZE }, (_, i) => 0.3 * Math.sin(i * (0.1 + 0.07 * c))),
  );
  const silent = inputs.map(() => false);
  const outputs = Array.from({ length: dsp.numOutputs }, () => new Float32Array(BLOCK_SIZE));
  const blocks = Math.round((10 * SR) / BLOCK_SIZE);
  const rounds: number[] = [];
  for (let r = 0; r < 7; r++) {
    const t0 = performance.now();
    for (let b = 0; b < blocks; b++) {
      transport?.beginBlock();
      dsp.process(inputs, silent, outputs, BLOCK_SIZE);
      transport?.endBlock(BLOCK_SIZE);
    }
    rounds.push((performance.now() - t0) / blocks);
  }
  rounds.sort((a, b) => a - b);
  return rounds[3]!;
}

/** A scope with both inputs connected and a given time window. */
function scope(time: number): Scope {
  const s = new Scope(SR);
  s.onConnectionsChanged([true, true]);
  s.setParam('time', time);
  return s;
}

/** A recorder that is recording; its audio is handed over every 50 ms as in the engine. */
function recorder(): Recorder {
  const r = new Recorder();
  r.onConnectionsChanged([true, true]);
  r.setParam('armed', 1);
  const process = r.process.bind(r);
  let blocks = 0;
  r.process = (i, s, o, n) => {
    process(i, s, o, n);
    if (++blocks % 19 === 0) r.takeRecorded();
  };
  return r;
}

describe.skipIf(import.meta.env.MODE !== 'bench')('CPU cost per module', () => {
  it('measures each module', () => {
    const transport = new Transport(SR);
    const modules: [string, DspModule][] = [
      ['Oscillator (saw)', load('osc', { wave: 2 })],
      ['Mixer (4 channels)', load('mixer')],
      ['Reverb', load('reverb')],
      ['Channel', load('channel')],
      ['Clock', new Clock(transport)],
      ['Sequencer', new Sequencer()],
      ['Envelope', new Envelope(SR)],
      ['Scope (2 ms)', scope(0.002)],
      ['Scope (1 s)', scope(1)],
      ['Recorder (recording)', recorder()],
    ];
    const rows = modules.map(([name, dsp]) => {
      const ms = msPerBlock(dsp, dsp instanceof Clock ? transport : undefined);
      const pct = (ms / BLOCK_MS) * 100;
      return `${name.padEnd(20)} ${(ms * 1000).toFixed(1).padStart(7)} µs/block  ${pct.toFixed(2).padStart(6)} % of one core  ~${Math.floor(100 / pct)} fit`;
    });
    console.log(['', `One block = ${BLOCK_MS.toFixed(2)} ms of audio at 48 kHz`, ...rows, ''].join('\n'));
  });
});

/** The engine with every module kind, as the audio worklet builds it. */
function projectEngine(): Engine {
  const factories: Record<string, ModuleFactory> = { master: () => new Master(), ...NATIVE_MODULES };
  for (const name of ['osc', 'mixer', 'reverb', 'channel']) {
    const path = (ext: string) => fileURLToPath(new URL(`./generated/${name}.${ext}`, import.meta.url));
    const module = new WebAssembly.Module(readFileSync(path('wasm')));
    const meta = JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta;
    const sink = declaredSink(meta);
    factories[`faust:${name}`] = (sr) => {
      const dsp = new FaustDsp(module, meta, sr);
      return sink ? new FaustSink(dsp) : dsp;
    };
  }
  return new Engine(SR, factories);
}

/** A project of `count` copies of the Welcome! patch; `heard` of them play, the rest are muted. */
function welcomeProject(count: number, heard = count) {
  const { project } = parseProjectFile(welcome, getDefinition, 'Welcome!');
  while (project.patches.length < count) duplicatePatch(project, project.patches[0]!.id);
  project.patches.forEach((p, i) => {
    const ch = p.modules.find((m) => m.type === CHANNEL_TYPE)!;
    ch.params['mute'] = i < heard ? 0 : 1;
  });
  return project;
}

/** Median time per block in ms for a whole project, after a second to settle (fades, sleep). */
function projectMsPerBlock(count: number, heard = count): number {
  const engine = projectEngine();
  engine.setTempo(120);
  engine.setPatch(toEnginePatch(welcomeProject(count, heard), getDefinition));
  const L = new Float32Array(BLOCK_SIZE);
  const R = new Float32Array(BLOCK_SIZE);
  const blocks = Math.round((10 * SR) / BLOCK_SIZE);
  for (let b = 0; b < SR / BLOCK_SIZE; b++) engine.renderBlock(L, R, BLOCK_SIZE);
  const rounds: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    for (let b = 0; b < blocks; b++) engine.renderBlock(L, R, BLOCK_SIZE);
    rounds.push((performance.now() - t0) / blocks);
  }
  rounds.sort((a, b) => a - b);
  return rounds[2]!;
}

describe.skipIf(import.meta.env.MODE !== 'bench')('CPU cost of whole projects', () => {
  it('measures 1, 4 and 8 Welcome! patches playing together', () => {
    const cases: [string, number, number][] = [
      ['1 patch', 1, 1],
      ['4 patches', 4, 4],
      ['8 patches', 8, 8],
      ['8 patches, 7 muted', 8, 1],
    ];
    const rows = cases.map(([name, count, heard]) => {
      const ms = projectMsPerBlock(count, heard);
      const pct = (ms / BLOCK_MS) * 100;
      return `${name.padEnd(20)} ${(ms * 1000).toFixed(1).padStart(7)} µs/block  ${pct.toFixed(2).padStart(6)} % of one core`;
    });
    console.log(['', 'Welcome! patch: Clock, Sequencer, Oscillator, Envelope, Reverb, Mixer, Channel', ...rows, ''].join('\n'));
  }, 120_000);
});
