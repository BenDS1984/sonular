/**
 * The Sequencer's eight patterns, shown to the user as "Pattern A".."Pattern H" (internally and in
 * patch files they are banks 0..7). Bank 1 keeps the parameter ids it had before banks existed
 * ("pitch1".."pitch8", "on1".."on8"), so older patches open with their pattern in bank 1; banks
 * 2..8 use "b2pitch1", "b2on1", and so on. The parameter "bank" is the bank chosen on the module
 * (0-based): the one being edited, and the one that plays when the sequencer has no timeline blocks.
 * Every step starts switched off; patch files store each switch, so older patches keep theirs.
 */
export const SEQUENCER_BANKS = 8;
export const SEQUENCER_STEPS = 8;

/** Parameter id of one step's pitch or on/off switch in a bank (bank 0-based, step 1-based). */
export function stepParam(bank: number, kind: 'pitch' | 'on', step: number): string {
  return bank === 0 ? `${kind}${step}` : `b${bank + 1}${kind}${step}`;
}

/** Which bank, kind and step a parameter id belongs to (all 0-based), or null for other ids. */
export function parseStepParam(id: string): { bank: number; kind: 'pitch' | 'on'; step: number } | null {
  const m = /^(?:b(\d+))?(pitch|on)(\d+)$/.exec(id);
  if (!m) return null;
  const bank = m[1] ? Number(m[1]) - 1 : 0;
  const step = Number(m[3]) - 1;
  if (m[1] && bank < 1) return null; // bank 1 has no prefix
  if (bank >= SEQUENCER_BANKS || step < 0 || step >= SEQUENCER_STEPS) return null;
  return { bank, kind: m[2] as 'pitch' | 'on', step };
}

/** All parameter ids of one bank, pitches then switches. */
export function bankParams(bank: number): string[] {
  const ids: string[] = [];
  for (const kind of ['pitch', 'on'] as const) for (let s = 1; s <= SEQUENCER_STEPS; s++) ids.push(stepParam(bank, kind, s));
  return ids;
}

/** Copy one bank's steps into another bank of the same module (in place). */
export function copyBankValues(params: Record<string, number>, from: Record<string, number>, to: number): void {
  for (const kind of ['pitch', 'on'] as const) {
    for (let s = 1; s <= SEQUENCER_STEPS; s++) {
      const v = from[`${kind}${s}`];
      if (v !== undefined) params[stepParam(to, kind, s)] = v;
    }
  }
}

/** One bank's steps under bank-1 ids, the form `copyBankValues` takes (a bank clipboard). */
export function readBank(params: Record<string, number>, bank: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const kind of ['pitch', 'on'] as const) {
    for (let s = 1; s <= SEQUENCER_STEPS; s++) {
      const v = params[stepParam(bank, kind, s)];
      if (v !== undefined) out[`${kind}${s}`] = v;
    }
  }
  return out;
}

/** The letter a bank is shown with: A for bank 0, B for bank 1, ... */
export const bankLetter = (bank: number): string => String.fromCharCode(65 + bank);
