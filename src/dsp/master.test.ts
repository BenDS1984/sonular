/**
 * The master fader on a pure sine, through the real engine: dragging it must sound as clean as a
 * Channel fader. (A straight ramp per fader message used to stop abruptly at every value; dragged,
 * those corners crackled at about -42 dB.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/core/Engine';
import { BLOCK_SIZE, type ModuleFactory } from '../engine/core/types';
import { declaredSink, FaustDsp, type FaustMeta } from '../engine/faust/FaustDsp';
import { FaustSink } from '../engine/faust/FaustSink';
import { Master } from '../engine/modules/Master';

const SR = 48000;

function engine() {
  const factories: Record<string, ModuleFactory> = { master: () => new Master() };
  for (const name of ['osc', 'channel']) {
    const path = (ext: string) => fileURLToPath(new URL(`./generated/${name}.${ext}`, import.meta.url));
    const module = new WebAssembly.Module(readFileSync(path('wasm')));
    const meta = JSON.parse(readFileSync(path('json'), 'utf8')) as FaustMeta;
    const sink = declaredSink(meta);
    factories[`faust:${name}`] = (sr) => {
      const dsp = new FaustDsp(module, meta, sr);
      return sink ? new FaustSink(dsp) : dsp;
    };
  }
  const e = new Engine(SR, factories);
  e.setPatch({
    nodes: [
      { id: 'osc', kind: 'faust:osc', params: { wave: 0, level: 0.7 } },
      { id: 'ch', kind: 'faust:channel', params: { level: 0.5 }, active: true },
    ],
    connections: [
      { from: { node: 'osc', port: 0 }, to: { node: 'ch', port: 0 } },
      { from: { node: 'osc', port: 0 }, to: { node: 'ch', port: 1 } },
    ],
  });
  return e;
}

/** A hand on a fader: a gain from -30 dB to -6 dB and back, sent every `ms`. */
function render(which: 'master' | 'channel', ms: number) {
  const e = engine();
  const total = Math.round((4 * SR) / BLOCK_SIZE);
  const out = new Float32Array(total * BLOCK_SIZE);
  const L = new Float32Array(BLOCK_SIZE);
  const R = new Float32Array(BLOCK_SIZE);
  let next = 0;
  for (let b = 0; b < total; b++) {
    const t = (b * BLOCK_SIZE) / SR;
    if (t >= 1 && t >= next) {
      const g = Math.pow(10, (-30 + 24 * Math.abs(Math.sin((t - 1) * 2))) / 20);
      if (which === 'master') e.setMasterLevel(g);
      else e.setParam('ch', 'level', g);
      next = t + ms / 1000;
    }
    e.renderBlock(L, R, BLOCK_SIZE);
    out.set(L, b * BLOCK_SIZE);
  }
  return out.subarray(SR);
}

function highpass(x: Float32Array, hz: number): Float32Array {
  const w = (2 * Math.PI * hz) / SR;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, a1 = (-2 * c) / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]!; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
/** Worst 2 ms above 2 kHz relative to the signal level (dB): the 262 Hz sine itself is filtered out. */
function hf(x: Float32Array): number {
  const h = highpass(highpass(highpass(highpass(x, 2000), 2000), 2000), 2000);
  const n = Math.round(SR * 0.002);
  let worst = -Infinity;
  for (let i = n * 10; i + n <= x.length; i += n) worst = Math.max(worst, 20 * Math.log10(rms(h.subarray(i, i + n)) / rms(x.subarray(i, i + n))));
  return worst;
}

describe('master fader', () => {
  it('glides as cleanly as a Channel fader while dragged', () => {
    for (const ms of [16, 4, 1]) {
      const master = hf(render('master', ms));
      expect(master, `new value every ${ms} ms`).toBeLessThan(-80);
      expect(master).toBeLessThan(hf(render('channel', ms)) + 3);
    }
  }, 60_000);
});
