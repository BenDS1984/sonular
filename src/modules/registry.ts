/**
 * All available module types. Adding a module = writing its definition and listing it here.
 */
import { clock } from './clock/definition';
import { envelope } from './envelope/definition';
import { mixer } from './mixer/definition';
import { oscillator } from './oscillator/definition';
import { output } from './output/definition';
import { reverb } from './reverb/definition';
import { sequencer } from './sequencer/definition';
import type { ModuleDefinition } from './types';

export const MODULES: readonly ModuleDefinition[] = [oscillator, clock, sequencer, envelope, mixer, reverb, output];

const byType = new Map(MODULES.map((d) => [d.type, d]));

export function getDefinition(type: string): ModuleDefinition | undefined {
  return byType.get(type);
}

/** Display order of categories in the module browser. */
export const CATEGORY_ORDER: ModuleDefinition['category'][] = [
  'Sources',
  'Sequencing',
  'Shaping',
  'Modulation',
  'Effects',
  'Mixing',
  'Output',
  'Utilities',
];
