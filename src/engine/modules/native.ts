/**
 * Modules written in TypeScript instead of Faust: the ones that need the transport or are pure
 * control logic (clocks, sequencers, envelopes, scopes, recorders). Engine kinds are "native:<name>".
 */
import type { ModuleFactory } from '../core/types';
import { Clock } from './Clock';
import { Delay } from './Delay';
import { Envelope } from './Envelope';
import { Lfo } from './Lfo';
import { Recorder } from './Recorder';
import { Sampler } from './Sampler';
import { Scope } from './Scope';
import { Sequencer } from './Sequencer';
import { Spectrum } from './Spectrum';
import { Vca } from './Vca';

export const NATIVE_MODULES: Readonly<Record<string, ModuleFactory>> = {
  'native:clock': (_sr, transport) => new Clock(transport),
  'native:sequencer': () => new Sequencer(),
  'native:delay': (sr, transport) => new Delay(sr, transport),
  'native:envelope': (sr) => new Envelope(sr),
  'native:lfo': (sr) => new Lfo(sr),
  'native:sampler': (sr) => new Sampler(sr),
  'native:scope': (sr) => new Scope(sr),
  'native:spectrum': (sr) => new Spectrum(sr),
  'native:vca': (sr) => new Vca(sr),
  'native:recorder': () => new Recorder(),
};
