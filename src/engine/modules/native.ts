/**
 * Modules written in TypeScript instead of Faust: the ones that need the transport or are pure
 * control logic (clocks, sequencers, envelopes). Engine kinds are "native:<name>".
 */
import type { ModuleFactory } from '../core/types';
import { Clock } from './Clock';
import { Envelope } from './Envelope';
import { Sequencer } from './Sequencer';

export const NATIVE_MODULES: Readonly<Record<string, ModuleFactory>> = {
  'native:clock': (_sr, transport) => new Clock(transport),
  'native:sequencer': () => new Sequencer(),
  'native:envelope': (sr) => new Envelope(sr),
};
