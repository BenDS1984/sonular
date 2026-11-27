import type { ModuleDefinition } from '../types';
import CvMixPanel from './CvMixPanel.svelte';

export const cvmix: ModuleDefinition = {
  type: 'cvmix',
  version: 1,
  title: 'CV Mix',
  category: 'Utilities',
  description:
    'Adds three signals together, each with its own level knob from −100% to +100% (negative flips the signal, so you can subtract). Use it to put several modulation sources, such as two LFOs and an Envelope, on one input. Unipolar squeezes the sum into 0…1.',
  summary: 'Adds three signals, each with its own level.',
  signal: 'cv',
  width: 204,
  inputs: [
    { id: 'in1', label: 'in 1', signal: 'cv' },
    { id: 'in2', label: 'in 2', signal: 'cv' },
    { id: 'in3', label: 'in 3', signal: 'cv' },
  ],
  outputs: [{ id: 'mix', label: 'mix', signal: 'cv' }],
  params: [
    { id: 'level1', label: 'Level 1', min: -1, max: 1, default: 0, bipolar: true, format: 'percent' },
    { id: 'level2', label: 'Level 2', min: -1, max: 1, default: 0, bipolar: true, format: 'percent' },
    { id: 'level3', label: 'Level 3', min: -1, max: 1, default: 0, bipolar: true, format: 'percent' },
    { id: 'polarity', label: 'Polarity', min: 0, max: 1, default: 0, step: 1, format: 'choice', choices: ['Bipolar', 'Unipolar'] },
  ],
  panel: CvMixPanel,
  engine: 'native:cvmix',
};
