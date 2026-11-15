/** The kinds of signal a port or cable can carry. Each one has its own colour token. */
export type SignalType = 'audio' | 'cv' | 'gate' | 'pitch';

export const SIGNAL_TYPES: readonly SignalType[] = ['audio', 'cv', 'gate', 'pitch'];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  audio: 'Audio',
  cv: 'Modulation',
  gate: 'Gate / trigger',
  pitch: 'Pitch',
};

/** CSS custom property holding the main colour of a signal type. */
export function signalColor(type: SignalType): string {
  return `var(--signal-${type})`;
}
