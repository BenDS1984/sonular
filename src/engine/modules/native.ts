/**
 * Modules written in TypeScript instead of Faust: the ones that need the transport or are pure
 * control logic (clocks, sequencers, envelopes, scopes, recorders). Engine kinds are "native:<name>".
 */
import type { ModuleFactory } from '../core/types';
import { Clock } from './Clock';
import { Envelope } from './Envelope';
import { Recorder } from './Recorder';
import { Scope } from './Scope';
import { Sequencer } from './Sequencer';
import { Spectrum } from './Spectrum';

export const NATIVE_MODULES: Readonly<Record<string, ModuleFactory>> = {
  'native:clock': (_sr, transport) => new Clock(transport),
  'native:sequencer': () => new Sequencer(),
  'native:envelope': (sr) => new Envelope(sr),
  'native:scope': (sr) => new Scope(sr),
  'native:spectrum': (sr) => new Spectrum(sr),
  'native:recorder': () => new Recorder(),
};
