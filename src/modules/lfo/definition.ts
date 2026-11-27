import { LFO_SYNC, LFO_SYNC_DEFAULT, LFO_WAVES } from '../../engine/modules/Lfo';
import type { ModuleDefinition } from '../types';
import LfoPanel from './LfoPanel.svelte';

export const lfo: ModuleDefinition = {
  type: 'lfo',
  version: 1,
  title: 'LFO',
  category: 'Modulation',
  description:
    'A slow wave that moves other modules, like a filter cutoff. Runs free at Rate (Hz); with a Clock patched into clock it follows the clock instead, Sync cycles per pulse.',
  summary: 'Slow wave that moves other modules.',
  signal: 'cv',
  width: 204,
  inputs: [{ id: 'clock', label: 'clock', signal: 'gate' }],
  outputs: [{ id: 'out', label: 'out', signal: 'cv' }],
  params: [
    { id: 'wave', label: 'Wave', min: 0, max: LFO_WAVES.length - 1, default: 0, step: 1, format: 'choice', choices: [...LFO_WAVES] },
    { id: 'rate', label: 'Rate', min: 0.01, max: 50, default: 1, scale: 'log', format: 'hz' },
    {
      id: 'sync',
      label: 'Sync',
      min: 0,
      max: LFO_SYNC.length - 1,
      default: LFO_SYNC_DEFAULT,
      step: 1,
      format: 'choice',
      choices: LFO_SYNC.map((s) => s.label),
    },
    { id: 'amount', label: 'Amount', min: 0, max: 1, default: 1, format: 'percent' },
    { id: 'phase', label: 'Phase', min: 0, max: 360, default: 0, step: 1, format: 'degrees' },
    { id: 'polarity', label: 'Polarity', min: 0, max: 1, default: 0, step: 1, format: 'choice', choices: ['Bipolar', 'Unipolar'] },
  ],
  panel: LfoPanel,
  engine: 'native:lfo',
};
