import { CLOCK_RATIOS } from '../../engine/modules/Clock';
import type { ModuleDefinition, ParamSpec } from '../types';
import ClockPanel from './ClockPanel.svelte';

const DEFAULT_RATIOS = [0, 1, 2, 5]; // ×4, ×2, ×1, ÷4

export const clock: ModuleDefinition = {
  type: 'clock',
  version: 1,
  title: 'Clock',
  category: 'Sequencing',
  description: 'Brings the tempo into the patch: four pulse outputs, each multiplied or divided.',
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
      default: DEFAULT_RATIOS[n - 1]!,
      step: 1,
      format: 'choice',
      choices: CLOCK_RATIOS.map((r) => r.label),
    }),
  ),
  panel: ClockPanel,
  engine: 'native:clock',
};
