import type { ModuleDefinition } from '../types';
import VcaPanel from './VcaPanel.svelte';

export const vca: ModuleDefinition = {
  type: 'vca',
  version: 1,
  title: 'VCA',
  category: 'Shaping',
  description:
    'Level × cv: turns a sound down or up. Patch an Envelope into cv and the sound follows it; with nothing on cv, Level is a plain amount knob, also for modulation such as an LFO.',
  signal: 'audio',
  width: 204,
  inputs: [
    { id: 'in', label: 'in', signal: 'audio' },
    { id: 'cv', label: 'cv', signal: 'cv' },
  ],
  outputs: [{ id: 'out', label: 'out', signal: 'audio' }],
  params: [{ id: 'level', label: 'Level', min: 0, max: 1, default: 1, format: 'percent' }],
  panel: VcaPanel,
  engine: 'native:vca',
};
