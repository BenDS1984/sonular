import type { ModuleDefinition } from '../types';
import SamplerPanel from './SamplerPanel.svelte';

export const sampler: ModuleDefinition = {
  type: 'sampler',
  version: 1,
  title: 'Sampler',
  category: 'Sources',
  description:
    'Plays one sample from your library when a gate comes in, for example from the Sequencer. Tune changes its pitch, Start where it begins. The sample is saved inside the patch file.',
  signal: 'audio',
  width: 264,
  inputs: [{ id: 'gate', label: 'gate', signal: 'gate' }],
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [
    { id: 'tune', label: 'Tune', min: -24, max: 24, default: 0, step: 1, bipolar: true, format: 'semitones' },
    { id: 'start', label: 'Start', min: 0, max: 1, default: 0, format: 'percent' },
    { id: 'level', label: 'Level', min: 0, max: 1, default: 0.8, format: 'gain-db' },
  ],
  panel: SamplerPanel,
  engine: 'native:sampler',
};
