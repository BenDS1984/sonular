/**
 * The one place an Engine is put together with every kind of module Sonular has. Used by the
 * AudioWorklet (playing) and by the export worker (rendering a song to a file), so an export always
 * sounds exactly like playback.
 */
import { Engine } from './core/Engine';
import type { SampleBank } from './core/SampleBank';
import type { ModuleFactory } from './core/types';
import { FaustDsp, declaredSink } from './faust/FaustDsp';
import { FaustSink } from './faust/FaustSink';
import { AudioTrack } from './modules/AudioTrack';
import { Master } from './modules/Master';
import { NATIVE_MODULES } from './modules/native';
import type { FaustProgram } from './protocol';

/** An engine at `sampleRate` with the native modules, the compiled Faust programs and audio tracks playing from `samples`. */
export function createEngine(sampleRate: number, faust: readonly FaustProgram[], samples: SampleBank): Engine {
  const factories: Record<string, ModuleFactory> = {
    master: () => new Master(),
    ...NATIVE_MODULES,
    'native:audiotrack': (sr, transport) => new AudioTrack(sr, transport, samples),
  };
  for (const prog of faust) {
    const sink = declaredSink(prog.meta);
    factories[`faust:${prog.name}`] = (sr) => {
      const dsp = new FaustDsp(prog.module, prog.meta, sr);
      return sink ? new FaustSink(dsp) : dsp;
    };
  }
  return new Engine(sampleRate, factories);
}
