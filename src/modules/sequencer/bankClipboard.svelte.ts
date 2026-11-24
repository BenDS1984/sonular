/**
 * The bank clipboard: one copied Sequencer bank, shared by all sequencers in the patch, so a bank
 * can be pasted into another bank or another sequencer. Not saved and not part of undo.
 */
export const bankClipboard = $state({ steps: null as Record<string, number> | null, from: 0 });

/**
 * Tint of each pattern, used on the module's pattern buttons.
 * Hues are spread so neighbouring banks are easy to tell apart.
 */
const BANK_HUES = [205, 150, 42, 12, 330, 275, 235, 95];

export function bankColor(bank: number, lightness = 58, alpha = 1): string {
  const hue = BANK_HUES[((bank % BANK_HUES.length) + BANK_HUES.length) % BANK_HUES.length]!;
  return `hsl(${hue} 55% ${lightness}% / ${alpha})`;
}
