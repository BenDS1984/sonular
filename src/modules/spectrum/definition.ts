import type { ModuleDefinition } from '../types';
import SpectrumPanel from './SpectrumPanel.svelte';

export const spectrum: ModuleDefinition = {
  type: 'spectrum',
  version: 1,
  title: 'Spectrum',
  category: 'Utilities',
  description:
    'Spectrum analyser: shows which frequencies are in the sound (low on the left, high on the right) and how loud. Signals pass through unchanged, so it can sit between two modules.',
  signal: 'audio',
  width: 400,
  inputs: [
    { id: 'l', label: 'L', signal: 'audio' },
    { id: 'r', label: 'R', signal: 'audio' },
  ],
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [
    { id: 'decay', label: 'Decay', min: 0, max: 1, default: 0.5, format: 'percent' },
    { id: 'range', label: 'Range', min: 0, max: 2, default: 1, step: 1, format: 'choice', choices: ['60 dB', '90 dB', '120 dB'] },
    { id: 'peak', label: 'Peak', min: 0, max: 1, default: 1, step: 1, format: 'toggle' },
    { id: 'scale', label: 'Scale', min: 0, max: 1, default: 0, step: 1, format: 'choice', choices: ['Log', 'Lin'] },
  ],
  panel: SpectrumPanel,
  engine: 'native:spectrum',
};
