import type { ModuleDefinition } from '../types';
import EnvelopePanel from './EnvelopePanel.svelte';

export const envelope: ModuleDefinition = {
  type: 'envelope',
  version: 1,
  title: 'Envelope',
  category: 'Modulation',
  description: 'ADSR envelope with a built-in VCA: a gate shapes the volume of the audio passing through.',
  signal: 'cv',
  width: 204,
  inputs: [
    { id: 'gate', label: 'gate', signal: 'gate' },
    { id: 'in', label: 'in', signal: 'audio' },
  ],
  outputs: [
    { id: 'out', label: 'out', signal: 'audio' },
    { id: 'env', label: 'env', signal: 'cv' },
  ],
  params: [
    { id: 'attack', label: 'Attack', min: 0.001, max: 10, default: 0.005, scale: 'log', format: 'seconds' },
    { id: 'decay', label: 'Decay', min: 0.001, max: 10, default: 0.3, scale: 'log', format: 'seconds' },
    { id: 'sustain', label: 'Sustain', min: 0, max: 1, default: 0.5, format: 'percent' },
    { id: 'release', label: 'Release', min: 0.001, max: 10, default: 0.4, scale: 'log', format: 'seconds' },
  ],
  panel: EnvelopePanel,
  engine: 'native:envelope',
};
