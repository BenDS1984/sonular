import type { ModuleDefinition, ParamSpec } from '../types';
import { SEQUENCER_BANKS, SEQUENCER_STEPS, stepParam } from './banks';
import SequencerPanel from './SequencerPanel.svelte';

const STEPS = Array.from({ length: SEQUENCER_STEPS }, (_, i) => i + 1);
const BANKS = Array.from({ length: SEQUENCER_BANKS }, (_, i) => i);

export const sequencer: ModuleDefinition = {
  type: 'sequencer',
  version: 1,
  title: 'Sequencer',
  category: 'Sequencing',
  description: 'Eight steps with a note and an on/off switch each, moved on by a clock, in eight patterns (A–H).',
  signal: 'pitch',
  width: 420,
  inputs: [{ id: 'clock', label: 'clock', signal: 'gate' }],
  outputs: [
    { id: 'pitch', label: 'pitch', signal: 'pitch' },
    { id: 'gate', label: 'gate', signal: 'gate' },
  ],
  params: [
    ...BANKS.flatMap((b) => [
      ...STEPS.map(
        (n): ParamSpec => ({
          id: stepParam(b, 'pitch', n),
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
        (n): ParamSpec => ({
          id: stepParam(b, 'on', n),
          label: `Step ${n}`,
          min: 0,
          max: 1,
          // A new sequencer starts silent: the user switches on the steps they want.
          default: 0,
          step: 1,
          format: 'toggle',
        }),
      ),
    ]),
    { id: 'bank', label: 'Pattern', min: 0, max: SEQUENCER_BANKS - 1, default: 0, step: 1 },
  ],
  banks: SEQUENCER_BANKS,
  panel: SequencerPanel,
  engine: 'native:sequencer',
};
