import { describe, expect, it, vi } from 'vitest';

// Module panels read live meters from the audio engine, which needs a browser; the presets only
// need the module definitions (ports and parameters).
vi.mock('../engine/engine.svelte', () => ({
  engineState: { beat: 0, playing: false },
  meterValue: () => 0,
}));
import { getDefinition } from '../modules/registry';
import { parseProjectFile } from '../patch/fileFormat';
import welcome from './welcome.sonular?raw';

describe('built-in presets', () => {
  it('the Welcome! starter patch loads completely, without warnings', () => {
    const { project, warnings } = parseProjectFile(welcome, getDefinition, 'Welcome!');
    expect(warnings).toEqual([]);
    expect(project.name).toBe('Welcome!');
    expect(project.patches).toHaveLength(1);
    const patch = project.patches[0]!;
    expect(patch.modules).toHaveLength(7);
    expect(patch.cables).toHaveLength(9);
  });
});
