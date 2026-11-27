import { CLOCK_DEFAULTS, CLOCK_RATIOS } from '../../engine/modules/Clock';
import type { ModuleDefinition, ParamSpec } from '../types';
import ClockPanel from './ClockPanel.svelte';

export const clock: ModuleDefinition = {
  type: 'clock',
  version: 1,
  title: 'Clock',
  category: 'Sequencing',
  description: 'Brings the tempo into the patch: four pulse outputs, each at its own note value (1/16, 1/8, …).',
  summary: 'Tempo as four pulse outputs at note values.',
  signal: 'gate',
  width: 252,
  inputs: [],
  outputs: [1, 2, 3, 4].map((n) => ({ id: `out${n}`, label: String(n), signal: 'gate' as const })),
  params: [1, 2, 3, 4].map(
    (n): ParamSpec => ({
      id: `ratio${n}`,
      label: `Out ${n}`,
      min: 0,
      max: CLOCK_RATIOS.length - 1,
      default: CLOCK_DEFAULTS[n - 1]!,
      step: 1,
      format: 'choice',
      choices: CLOCK_RATIOS.map((r) => r.label),
    }),
  ),
  panel: ClockPanel,
  engine: 'native:clock',
};
