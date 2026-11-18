import type { DspModule } from '../core/types';
import type { Transport } from '../core/Transport';

/**
 * Ratios offered by each Clock output, in pulses per beat (quarter note). Indexed by the
 * output's "ratio" parameter; the UI shows the same list. Never reorder: patches store indexes.
 */
export const CLOCK_RATIOS: readonly { label: string; perBeat: number }[] = [
  { label: '×4', perBeat: 4 },
  { label: '×2', perBeat: 2 },
  { label: '×1', perBeat: 1 },
  { label: '÷2', perBeat: 1 / 2 },
  { label: '÷3', perBeat: 1 / 3 },
  { label: '÷4', perBeat: 1 / 4 },
  { label: '÷8', perBeat: 1 / 8 },
  { label: '÷16', perBeat: 1 / 16 },
];

export const CLOCK_OUTPUTS = 4;

/**
 * Clock: brings the master tempo into the patch. Each output pulses at its own ratio of the
 * beat. A pulse is a gate that is high for the first half of every period, so the rising edge
 * marks the tick and the same cable can also open an envelope directly.
 *
 * Timing comes straight from the transport position, sample by sample: no drift, and tempo
 * changes are followed at once. All outputs line up on beat 0, so ÷4 starts every bar.
 *
 * Meters "tick1".."tick4": 1 while that output is high (for the panel's lights).
 */
export class Clock implements DspModule {
  readonly numInputs = 0;
  readonly numOutputs = CLOCK_OUTPUTS;
  readonly tailSeconds = Infinity;
  readonly keepsTime = true;
  readonly meterNames = ['tick1', 'tick2', 'tick3', 'tick4'] as const;

  private readonly transport: Transport;
  private readonly perBeat = new Float64Array(CLOCK_OUTPUTS);
  private readonly lastState = new Float32Array(CLOCK_OUTPUTS);

  constructor(transport: Transport) {
    this.transport = transport;
    const defaults = [0, 1, 2, 5]; // ×4, ×2, ×1, ÷4
    for (let o = 0; o < CLOCK_OUTPUTS; o++) this.perBeat[o] = CLOCK_RATIOS[defaults[o]!]!.perBeat;
  }

  setParam(name: string, value: number): void {
    // "ratio1".."ratio4"
    if (!name.startsWith('ratio')) return;
    const o = Number(name.slice(5)) - 1;
    const ratio = CLOCK_RATIOS[Math.round(value)];
    if (o >= 0 && o < CLOCK_OUTPUTS && ratio) this.perBeat[o] = ratio.perBeat;
  }

  process(_inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const start = this.transport.beat;
    const step = this.transport.beatsPerSample;
    for (let o = 0; o < CLOCK_OUTPUTS; o++) {
      const out = outputs[o]!;
      const perBeat = this.perBeat[o]!;
      let v = 0;
      for (let i = 0; i < frames; i++) {
        // The tiny offset keeps a pulse that is due exactly on this sample from landing one
        // sample late through rounding (1e-9 beats is far below one sample at any tempo).
        const pulses = (start + i * step) * perBeat + 1e-9;
        v = pulses - Math.floor(pulses) < 0.5 ? 1 : 0;
        out[i] = v;
      }
      this.lastState[o] = v;
    }
  }

  readMeters(out: Float32Array, offset: number): void {
    for (let o = 0; o < CLOCK_OUTPUTS; o++) out[offset + o] = this.lastState[o]!;
  }

  reset(): void {
    this.lastState.fill(0);
  }
}
