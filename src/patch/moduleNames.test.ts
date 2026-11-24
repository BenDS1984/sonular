import { describe, expect, it } from 'vitest';
import type { ModuleDefinition } from '../modules/types';
import { defaultTitle, moduleLabel, moduleTooltip, renameModule } from './moduleNames';

const osc = { type: 'osc', title: 'Oscillator' } as ModuleDefinition;

describe('module names', () => {
  it('numbers a module by its id, so the number never moves to another one', () => {
    expect(defaultTitle(osc, { id: 'osc3', type: 'osc' })).toBe('Oscillator 3');
    expect(defaultTitle(undefined, { id: 'x', type: 'gone' })).toBe('gone');
  });

  it("shows the user's own name, and goes back to the number when it is cleared", () => {
    const m: { id: string; type: string; name?: string } = { id: 'osc2', type: 'osc' };
    renameModule(m, '  Bass ');
    expect(moduleLabel(osc, m)).toBe('Bass');
    expect(moduleTooltip(osc, m)).toBe('Bass (Oscillator 2)');
    renameModule(m, '   ');
    expect(m).toEqual({ id: 'osc2', type: 'osc' });
    expect(moduleLabel(osc, m)).toBe('Oscillator 2');
  });
});
