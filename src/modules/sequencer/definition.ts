import type { ModuleDefinition, ParamSpec } from '../types';
import SequencerPanel from './SequencerPanel.svelte';

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8];

export const sequencer: ModuleDefinition = {
  type: 'sequencer',
  version: 1,
  title: 'Sequencer',
  category: 'Sequencing',
  description: 'Eight steps with a note and an on/off switch each, moved on by a clock.',
  signal: 'pitch',
  width: 420,
  inputs: [{ id: 'clock', label: 'clock', signal: 'gate' }],
  outputs: [
    { id: 'pitch', label: 'pitch', signal: 'pitch' },
    { id: 'gate', label: 'gate', signal: 'gate' },
  ],
  params: [
    ...STEPS.map(
      (n): ParamSpec => ({
        id: `pitch${n}`,
        label: String(n),
        min: -24,
        max: 24,
        default: 0,
        step: 1,
        bipolar: true,
        format: 'note',
      }),
    ),
    ...STEPS.map(
      (n): ParamSpec => ({ id: `on${n}`, label: `Step ${n}`, min: 0, max: 1, default: 1, step: 1, format: 'toggle' }),
    ),
  ],
  panel: SequencerPanel,
  engine: 'native:sequencer',
};
