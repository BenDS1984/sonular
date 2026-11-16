import type { ModuleDefinition } from '../types';
import ReverbPanel from './ReverbPanel.svelte';

export const reverb: ModuleDefinition = {
  type: 'reverb',
  version: 1,
  title: 'Reverb',
  category: 'Effects',
  description: 'Stereo room and hall reverb (zita-rev1 design). Patch only L for a mono source.',
  signal: 'audio',
  width: 204,
  inputs: [
    { id: 'inL', label: 'L', signal: 'audio' },
    { id: 'inR', label: 'R', signal: 'audio' },
  ],
  outputs: [
    { id: 'outL', label: 'L', signal: 'audio' },
    { id: 'outR', label: 'R', signal: 'audio' },
  ],
  params: [
    { id: 'size', label: 'Size', min: 0.3, max: 12, default: 2.5, scale: 'log', format: 'seconds' },
    { id: 'predelay', label: 'Pre-delay', min: 0, max: 150, default: 10, format: 'ms' },
    { id: 'damping', label: 'Damping', min: 0, max: 1, default: 0.4, format: 'percent' },
    { id: 'mix', label: 'Mix', min: 0, max: 1, default: 0.3, format: 'percent' },
  ],
  panel: ReverbPanel,
  engine: 'faust:reverb',
};
