import type { DspModule } from '../core/types';
import type { Transport } from '../core/Transport';

/**
 * Step lengths offered by each Clock output, as note values (as in other DAWs: a sequencer on
 * 1/16 steps in sixteenth notes; "T" is a triplet), with their pulses per beat (quarter note).
 * Indexed by the output's "ratio" parameter; the UI shows the same list. Patches store indexes.
 */
export const CLOCK_RATIOS: readonly { label: string; perBeat: number }[] = [
  { label: '1/32', perBeat: 8 },
  { label: '1/16T', perBeat: 6 },
  { label: '1/16', perBeat: 4 },
  { label: '1/8T', perBeat: 3 },
  { label: '1/8', perBeat: 2 },
  { label: '1/4T', perBeat: 3 / 2 },
  { label: '1/4', perBeat: 1 },
  { label: '1/2', perBeat: 1 / 2 },
  { label: '1 bar', perBeat: 1 / 4 },
  { label: '2 bars', perBeat: 1 / 8 },
  { label: '4 bars', perBeat: 1 / 16 },
];

/** Index in CLOCK_RATIOS of a note value, e.g. '1/16'. */
export const clockRatio = (label: string): number => CLOCK_RATIOS.findIndex((r) => r.label === label);

/** The note values a new Clock's four outputs start on. */
export const CLOCK_DEFAULTS: readonly number[] = ['1/16', '1/8', '1/4', '1 bar'].map(clockRatio);

export const CLOCK_OUTPUTS = 4;

/**
 * Clock: brings the master tempo into the patch. Each output pulses at its own ratio of the
 * beat. A pulse is a gate that is high for the first half of every period, so the rising edge
 * marks the tick and the same cable can also open an envelope directly.
 *
 * Timing comes straight from the transport position, sample by sample: no drift, and tempo
 * changes are followed at once. All outputs line up on beat 0, so "1 bar" starts every bar.
 */
export class Clock implements DspModule {
  readonly numInputs = 0;
  readonly numOutputs = CLOCK_OUTPUTS;
  readonly tailSeconds = Infinity;
  readonly keepsTime = true;

  private readonly transport: Transport;
  private readonly perBeat = new Float64Array(CLOCK_OUTPUTS);

  constructor(transport: Transport) {
    this.transport = transport;
    for (let o = 0; o < CLOCK_OUTPUTS; o++) this.perBeat[o] = CLOCK_RATIOS[CLOCK_DEFAULTS[o]!]!.perBeat;
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
    const wrapAt = this.transport.wrapAt;
    const loopLength = this.transport.loopLength;
    for (let o = 0; o < CLOCK_OUTPUTS; o++) {
      const out = outputs[o]!;
      const perBeat = this.perBeat[o]!;
      for (let i = 0; i < frames; i++) {
        // The tiny offset keeps a pulse that is due exactly on this sample from landing one
        // sample late through rounding (1e-9 beats is far below one sample at any tempo).
        let beat = start + i * step;
        if (beat >= wrapAt) beat -= loopLength;
        const pulses = beat * perBeat + 1e-9;
        out[i] = pulses - Math.floor(pulses) < 0.5 ? 1 : 0;
      }
    }
  }

  reset(): void {}
}
