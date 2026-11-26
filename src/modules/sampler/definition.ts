import type { ModuleDefinition } from '../types';
import SamplerPanel from './SamplerPanel.svelte';

export const sampler: ModuleDefinition = {
  type: 'sampler',
  version: 1,
  title: 'Sampler',
  category: 'Sources',
  description:
    'Plays one sample from your library when a gate comes in, for example from the Sequencer. Tune changes its pitch, Start where it begins. Attack fades the sound in; Decay fades it out and stops it (at its minimum, Off, the sample plays to its end). The tune, level and decay inputs move those knobs from a modulation signal; use a CV Mix or VCA to make it weaker. The sample is saved inside the patch file.',
  signal: 'audio',
  width: 252,
  inputs: [
    { id: 'gate', label: 'gate', signal: 'gate' },
    { id: 'tune', label: 'tune', signal: 'cv' },
    { id: 'level', label: 'level', signal: 'cv' },
    { id: 'decay', label: 'decay', signal: 'cv' },
  ],
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [
    { id: 'tune', label: 'Tune', min: -24, max: 24, default: 0, step: 1, bipolar: true, format: 'semitones' },
    { id: 'start', label: 'Start', min: 0, max: 1, default: 0, format: 'percent' },
    { id: 'attack', label: 'Attack', min: 0.001, max: 2, default: 0.001, scale: 'log', format: 'seconds' },
    { id: 'decay', label: 'Decay', min: 0.005, max: 2, default: 0.005, scale: 'log', format: 'seconds-off' },
    { id: 'level', label: 'Level', min: 0, max: 1, default: 0.8, format: 'gain-db' },
  ],
  panel: SamplerPanel,
  engine: 'native:sampler',
};
