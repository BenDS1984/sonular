import type { ModuleDefinition, ParamSpec } from '../types';
import { SEQUENCER_BANKS, SEQUENCER_STEPS, lenParam, stepParam } from './banks';
import SequencerPanel from './SequencerPanel.svelte';

const STEPS = Array.from({ length: SEQUENCER_STEPS }, (_, i) => i + 1);
const BANKS = Array.from({ length: SEQUENCER_BANKS }, (_, i) => i);

export const sequencer: ModuleDefinition = {
  type: 'sequencer',
  version: 1,
  title: 'Sequencer',
  category: 'Sequencing',
  description: 'Up to eight steps with a note and an on/off switch each, moved on by a clock, in eight patterns (A–H) that each have their own length. A modulation signal on the pattern input switches between the patterns.',
  signal: 'pitch',
  width: 464,
  inputs: [
    { id: 'clock', label: 'clock', signal: 'gate' },
    { id: 'pattern', label: 'pattern', signal: 'cv' },
  ],
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
      // A new sequencer starts silent: the user switches on the steps they want.
      ...STEPS.map(
        (n): ParamSpec => ({
          id: stepParam(b, 'on', n),
          label: `Step ${n}`,
          min: 0,
          max: 1,
          default: 0,
          step: 1,
          format: 'toggle',
        }),
      ),
      // How many steps of this pattern play before it starts over.
      { id: lenParam(b), label: 'Length', min: 1, max: SEQUENCER_STEPS, default: SEQUENCER_STEPS, step: 1 } as ParamSpec,
    ]),
    // How many patterns the pattern input spans, counted from the chosen one.
    { id: 'range', label: 'Pattern mod range', min: 1, max: SEQUENCER_BANKS, default: SEQUENCER_BANKS, step: 1 },
    // The pattern that plays (and is shown on the panel).
    { id: 'bank', label: 'Pattern', min: 0, max: SEQUENCER_BANKS - 1, default: 0, step: 1 },
  ],
  panel: SequencerPanel,
  engine: 'native:sequencer',
};
