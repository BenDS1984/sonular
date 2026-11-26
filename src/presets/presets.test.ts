import { describe, expect, it, vi } from 'vitest';

// Module panels read live meters from the audio engine, which needs a browser; the presets only
// need the module definitions (ports and parameters).
vi.mock('../engine/engine.svelte', () => ({
  engineState: { beat: 0, playing: false },
  meterValue: () => 0,
}));
import { getDefinition } from '../modules/registry';
import { parsePatchFile } from '../patch/fileFormat';
import welcome from './welcome.sonular?raw';

describe('built-in presets', () => {
  it('the Welcome! starter patch loads completely, without warnings', () => {
    const { patch, warnings, samples } = parsePatchFile(welcome, getDefinition, 'Welcome!');
    expect(warnings).toEqual([]);
    expect(patch.name).toBe('Welcome!');
    expect(patch.modules).toHaveLength(21);
    expect(patch.cables).toHaveLength(33);
    // Every sample a module uses comes with the file.
    const used = patch.modules.flatMap((m) => (m.sample ? [m.sample] : []));
    expect(used.length).toBeGreaterThan(0);
    for (const hash of used) expect(samples.map((s) => s.hash)).toContain(hash);
  });
});
