import { describe, expect, it, vi } from 'vitest';

// The panel reads live meters from the audio engine, which needs a browser.
vi.mock('../../engine/engine.svelte', () => ({ engineState: { beat: 0, playing: false }, meterValue: () => 0 }));
import { bankParams, copyBankValues, parseStepParam, readBank, stepParam } from './banks';
import { getDefinition } from '../registry';

const sequencer = getDefinition('sequencer')!;

describe('sequencer banks', () => {
  it('keeps the old ids for bank 1, so older patches open with their pattern in bank 1', () => {
    expect(stepParam(0, 'pitch', 3)).toBe('pitch3');
    expect(stepParam(0, 'on', 8)).toBe('on8');
    expect(stepParam(4, 'pitch', 1)).toBe('b5pitch1');
    expect(parseStepParam('pitch3')).toEqual({ bank: 0, kind: 'pitch', step: 2 });
    expect(parseStepParam('b8on8')).toEqual({ bank: 7, kind: 'on', step: 7 });
    for (const bad of ['b1pitch1', 'b9pitch1', 'pitch9', 'on0', 'bank', 'rate']) expect(parseStepParam(bad)).toBeNull();
  });

  it('defines every step of every bank and the chosen bank', () => {
    const ids = sequencer.params.map((p) => p.id);
    expect(ids).toHaveLength(8 * 16 + 1);
    for (let b = 0; b < 8; b++) for (const id of bankParams(b)) expect(ids).toContain(id);
    expect(ids).toContain('bank');
    expect(sequencer.banks).toBe(8);
  });

  it('copies one bank into another', () => {
    const params: Record<string, number> = {};
    for (const id of bankParams(0)) params[id] = 0;
    for (const id of bankParams(2)) params[id] = 1;
    params['pitch4'] = 7;
    params['on2'] = 0;
    copyBankValues(params, readBank(params, 0), 2);
    expect(params['b3pitch4']).toBe(7);
    expect(params['b3on2']).toBe(0);
    expect(params['b3pitch1']).toBe(0);
    expect(params['pitch4']).toBe(7); // the source stays
  });
});
