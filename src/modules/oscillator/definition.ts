import type { ModuleDefinition } from '../types';
import OscillatorPanel from './OscillatorPanel.svelte';

export const oscillator: ModuleDefinition = {
  type: 'osc',
  title: 'Oscillator',
  category: 'Sources',
  description: 'Basic waveforms: sine, triangle, sawtooth and square.',
  signal: 'audio',
  width: 204,
  inputs: [{ id: 'pitch', label: 'pitch', signal: 'pitch' }],
  outputs: [{ id: 'out', label: 'out', signal: 'audio' }],
  params: [
    { id: 'wave', label: 'Wave', min: 0, max: 3, default: 2, step: 1, format: 'choice', choices: ['Sine', 'Triangle', 'Saw', 'Square'] },
    { id: 'tune', label: 'Tune', min: -24, max: 24, default: 0, step: 1, bipolar: true, format: 'semitones' },
    { id: 'fine', label: 'Fine', min: -100, max: 100, default: 0, bipolar: true, format: 'cents' },
    { id: 'level', label: 'Level', min: 0, max: 1, default: 0.7, format: 'gain-db' },
  ],
  panel: OscillatorPanel,
  engine: 'faust:osc',
};
