/**
 * All available module types. Adding a module = writing its definition and listing it here.
 */
import { channel } from './channel/definition';
import { clock } from './clock/definition';
import { envelope } from './envelope/definition';
import { mixer } from './mixer/definition';
import { oscillator } from './oscillator/definition';
import { recorder } from './recorder/definition';
import { reverb } from './reverb/definition';
import { scope } from './scope/definition';
import { sequencer } from './sequencer/definition';
import type { ModuleDefinition } from './types';

export const MODULES: readonly ModuleDefinition[] = [oscillator, clock, sequencer, envelope, mixer, reverb, channel, recorder, scope];

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
