/**
 * What modules are called: their title with a number ("Oscillator 2"), or a name of the user's own.
 */
import type { ModuleDefinition } from '../modules/types';

/** Longest name the user can give a module. */
const MAX_NAME = 40;

/**
 * A module's title with its number: "Oscillator 2". The number comes from the module id
 * (osc2), so it stays the same when other modules of that type are added or removed.
 */
export function defaultTitle(def: ModuleDefinition | undefined, module: { id: string; type: string }): string {
  const title = def?.title ?? module.type;
  const n = /(\d+)$/.exec(module.id);
  return n ? `${title} ${n[1]}` : title;
}

/** What a module is called: the user's name, else its title with its number. */
export function moduleLabel(def: ModuleDefinition | undefined, module: { id: string; type: string; name?: string }): string {
  return module.name || defaultTitle(def, module);
}

/** Tooltip for a module with its own name: "Bass (Oscillator 2)". */
export function moduleTooltip(def: ModuleDefinition | undefined, module: { id: string; type: string; name?: string }): string {
  const base = defaultTitle(def, module);
  return module.name ? `${module.name} (${base})` : base;
}

/** Give a module its own name; an empty name goes back to the title with its number. */
export function renameModule(module: { name?: string }, name: string): void {
  const n = name.trim().slice(0, MAX_NAME);
  if (n) module.name = n;
  else delete module.name;
}
