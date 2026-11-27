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
import { Transport } from '../engine/core/Transport';
import { BLOCK_SIZE, type DspModule } from '../engine/core/types';
import { Clock } from '../engine/modules/Clock';
import { CvMix } from '../engine/modules/CvMix';
import { Delay } from '../engine/modules/Delay';
import { Envelope } from '../engine/modules/Envelope';
import { Lfo } from '../engine/modules/Lfo';
import { Recorder } from '../engine/modules/Recorder';
import { Sampler } from '../engine/modules/Sampler';
import { Scope } from '../engine/modules/Scope';
import { Spectrum } from '../engine/modules/Spectrum';
import { Sequencer } from '../engine/modules/Sequencer';
import { Vca } from '../engine/modules/Vca';
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

/** An LFO of the given wave, running free. */
function lfo(wave: number): Lfo {
  const l = new Lfo(SR);
  l.onConnectionsChanged([false]);
  l.setParam('wave', wave);
  l.setParam('rate', 3);
  return l;
}

/** A Sampler playing a long looping-by-gate sample (a new gate every 0.5 s). */
function sampler(): Sampler {
  const s = new Sampler(SR);
  s.setSample({ left: Float32Array.from({ length: SR * 4 }, (_, i) => Math.sin(i * 0.05)), right: null, sampleRate: SR });
  const process = s.process.bind(s);
  let blocks = 0;
  s.process = (inputs, silent, outputs, n) => {
    inputs[0]!.fill(blocks % 188 < 2 ? 1 : 0); // about every 0.5 s a gate of a few ms
    blocks++;
    process(inputs, silent, outputs, n);
  };
  s.reset();
  return s;
}

/** A Dual Delay with feedback, filters, tape and sync on, in stereo or ping-pong. */
function dualDelay(routing: number): Delay {
  const t = new Transport(SR);
  const d = new Delay(SR, t);
  d.onConnectionsChanged([true, true]);
  d.setParam('feedback', 0.5);
  d.setParam('tape', 0.5);
  d.setParam('hp', 200);
  d.setParam('lp', 6000);
  d.setParam('routing', routing);
  d.reset();
  return d;
}

/** A spectrum analyser with both inputs connected (peak hold on). */
function spectrum(): Spectrum {
  const s = new Spectrum(SR);
  s.onConnectionsChanged([true, true]);
  s.setParam('peak', 1);
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
      ['Filter (low-pass, resonant)', load('filter', { cutoff: 800, resonance: 0.6 })],
      ['Output', load('output')],
      ['Clock', new Clock(transport)],
      ['Sequencer', new Sequencer()],
      ['Envelope', new Envelope(SR)],
      ['LFO (sine)', lfo(0)],
      ['LFO (smooth random)', lfo(5)],
      ['Sampler (playing)', sampler()],
      ['Dual Delay (stereo)', dualDelay(0)],
      ['Dual Delay (ping-pong)', dualDelay(1)],
      ['Scope (2 ms)', scope(0.002)],
      ['Scope (1 s)', scope(1)],
      ['Spectrum', spectrum()],
      ['VCA', new Vca(SR)],
      ['CV Mix', new CvMix(SR)],
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
