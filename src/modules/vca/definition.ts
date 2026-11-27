import type { ModuleDefinition } from '../types';
import VcaPanel from './VcaPanel.svelte';

export const vca: ModuleDefinition = {
  type: 'vca',
  version: 1,
  title: 'VCA',
  category: 'Shaping',
  description:
    'Amount × cv: turns a sound down. Patch an Envelope into cv and the sound follows it; with nothing on cv, Amount is a plain volume knob, also for modulation such as an LFO.',
  summary: 'Turns a sound down: Amount × cv.',
  signal: 'audio',
  width: 204,
  inputs: [
    { id: 'in', label: 'in', signal: 'audio' },
    { id: 'cv', label: 'cv', signal: 'cv' },
  ],
  outputs: [{ id: 'out', label: 'out', signal: 'audio' }],
  params: [{ id: 'level', label: 'Amount', min: 0, max: 1, default: 1, format: 'percent' }],
  panel: VcaPanel,
  engine: 'native:vca',
};
