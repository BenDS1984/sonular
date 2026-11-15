import type { ModuleDefinition } from '../types';
import OutputPanel from './OutputPanel.svelte';

export const output: ModuleDefinition = {
  type: 'output',
  title: 'Output',
  category: 'Output',
  description: 'Sends audio to your speakers or headphones, with volume and level meters.',
  signal: 'audio',
  width: 140,
  inputs: [
    { id: 'L', label: 'L', signal: 'audio' },
    { id: 'R', label: 'R', signal: 'audio' },
  ],
  outputs: [],
  params: [{ id: 'volume', label: 'Volume', min: 0, max: 1, default: 0.5, format: 'gain-db' }],
  panel: OutputPanel,
  engine: 'faust:output',
};
