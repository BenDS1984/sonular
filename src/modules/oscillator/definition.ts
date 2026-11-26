import type { ModuleDefinition } from '../types';
import OscillatorPanel from './OscillatorPanel.svelte';

export const oscillator: ModuleDefinition = {
  type: 'osc',
  version: 1,
  title: 'Oscillator',
  category: 'Sources',
  description:
    'Basic waveforms: sine, triangle, sawtooth and square. The square has a pulse width. Modulation inputs move tune, level and pulse width (an LFO, an Envelope); the fm input bends the pitch with another oscillator, and sync restarts the wave on every rising edge of another oscillator (hard sync).',
  signal: 'audio',
  width: 276,
  inputs: [
    { id: 'pitch', label: 'pitch', signal: 'pitch' },
    { id: 'tune', label: 'tune', signal: 'cv' },
    { id: 'level', label: 'level', signal: 'cv' },
    { id: 'pwm', label: 'width', signal: 'cv' },
    { id: 'fm', label: 'fm', signal: 'audio' },
    { id: 'sync', label: 'sync', signal: 'audio' },
  ],
  outputs: [{ id: 'out', label: 'out', signal: 'audio' }],
  params: [
    { id: 'wave', label: 'Wave', min: 0, max: 3, default: 2, step: 1, format: 'choice', choices: ['Sine', 'Triangle', 'Saw', 'Square'] },
    { id: 'tune', label: 'Tune', min: -24, max: 24, default: 0, step: 1, bipolar: true, format: 'semitones' },
    { id: 'fine', label: 'Fine', min: -100, max: 100, default: 0, bipolar: true, format: 'cents' },
    { id: 'pw', label: 'Width', min: 0.05, max: 0.95, default: 0.5, format: 'percent' },
    { id: 'fm', label: 'FM', min: 0, max: 4, default: 0, format: 'octaves' },
    { id: 'level', label: 'Level', min: 0, max: 1, default: 0.7, format: 'gain-db' },
  ],
  panel: OscillatorPanel,
  engine: 'faust:osc',
};
