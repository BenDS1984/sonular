import type { ModuleDefinition } from '../types';
import FilterPanel from './FilterPanel.svelte';

export const filter: ModuleDefinition = {
  type: 'filter',
  version: 1,
  title: 'Filter',
  category: 'Shaping',
  description:
    'Stereo filter (12 dB per octave): low-pass, high-pass or band-pass. The mod input moves the cutoff (an LFO or an envelope); Resonance makes it ring.',
  signal: 'audio',
  width: 204,
  inputs: [
    { id: 'inL', label: 'L', signal: 'audio' },
    { id: 'inR', label: 'R', signal: 'audio' },
    { id: 'mod', label: 'mod', signal: 'cv' },
  ],
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [
    { id: 'type', label: 'Type', min: 0, max: 2, default: 0, step: 1, format: 'choice', choices: ['Low-pass', 'Band-pass', 'High-pass'] },
    { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, default: 1000, scale: 'log', format: 'hz' },
    { id: 'resonance', label: 'Resonance', min: 0, max: 1, default: 0, format: 'percent' },
    { id: 'mod', label: 'Mod', min: -4, max: 4, default: 0, bipolar: true, format: 'octaves' },
  ],
  panel: FilterPanel,
  engine: 'faust:filter',
};
