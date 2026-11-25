import type { ModuleDefinition } from '../types';
import VcaPanel from './VcaPanel.svelte';

export const vca: ModuleDefinition = {
  type: 'vca',
  version: 1,
  title: 'VCA',
  category: 'Shaping',
  description:
    'Sets the volume of the audio passing through. Patch an Envelope into cv and the sound follows it; Level is a steady base volume that is always open.',
  signal: 'audio',
  width: 204,
  inputs: [
    { id: 'in', label: 'in', signal: 'audio' },
    { id: 'cv', label: 'cv', signal: 'cv' },
  ],
  outputs: [{ id: 'out', label: 'out', signal: 'audio' }],
  params: [{ id: 'level', label: 'Level', min: 0, max: 1, default: 0, format: 'percent' }],
  panel: VcaPanel,
  engine: 'native:vca',
};
