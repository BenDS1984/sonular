/** Basic oscillator waveforms. */
export type Waveform = 'sine' | 'triangle' | 'saw' | 'square';

export const WAVEFORM_OPTIONS: { value: Waveform; label: string; title: string }[] = [
  { value: 'sine', label: 'sin', title: 'Sine' },
  { value: 'triangle', label: 'tri', title: 'Triangle' },
  { value: 'saw', label: 'saw', title: 'Sawtooth' },
  { value: 'square', label: 'sqr', title: 'Square' },
];
