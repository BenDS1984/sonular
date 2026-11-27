import type { ModuleDefinition } from '../types';
import ScopePanel from './ScopePanel.svelte';

export const scope: ModuleDefinition = {
  type: 'scope',
  version: 1,
  title: 'Scope',
  category: 'Utilities',
  description:
    'Two-channel oscilloscope: shows any signal as a moving line. Signals pass through unchanged, so it can sit between two modules.',
  summary: 'Two-channel oscilloscope.',
  signal: 'audio',
  width: 252,
  inputs: [
    { id: 'a', label: 'A', signal: 'audio' },
    { id: 'b', label: 'B', signal: 'audio' },
  ],
  outputs: [
    { id: 'outA', label: 'A', signal: 'audio' },
    { id: 'outB', label: 'B', signal: 'audio' },
  ],
  params: [
    { id: 'time', label: 'Time', min: 0.001, max: 2, default: 0.02, scale: 'log', format: 'seconds' },
    { id: 'scale', label: 'Scale', min: 0.1, max: 10, default: 1, scale: 'log', format: 'times' },
    { id: 'trigger', label: 'Trigger', min: 0, max: 1, default: 0, step: 1, format: 'choice', choices: ['Auto', 'Free'] },
  ],
  panel: ScopePanel,
  engine: 'native:scope',
};
