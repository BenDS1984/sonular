import type { DspModule } from '../core/types';

/** A clock input counts as high above this level and as low again below the lower one. */
const HIGH = 0.6;
const LOW = 0.4;

/** Waveforms, indexed by the "wave" parameter (the panel shows the same list). */
export const LFO_WAVES = ['Sine', 'Triangle', 'Saw', 'Square', 'Random', 'Smooth'] as const;

/**
 * How many LFO cycles fit in one clock pulse, indexed by the "sync" parameter, slowest first so that
 * turning the knob up speeds the LFO up: /32 is one cycle every 32 pulses, x8 eight cycles per pulse. Used only while a clock is patched in.
 */
export const LFO_SYNC: readonly { label: string; cycles: number }[] = [
  { label: '÷32', cycles: 1 / 32 },
  { label: '÷16', cycles: 1 / 16 },
  { label: '÷8', cycles: 1 / 8 },
  { label: '÷4', cycles: 1 / 4 },
  { label: '÷2', cycles: 1 / 2 },
  { label: '×1', cycles: 1 },
  { label: '×2', cycles: 2 },
  { label: '×4', cycles: 4 },
  { label: '×8', cycles: 8 },
];
export const LFO_SYNC_DEFAULT = 3;

/** "No cycle drawn yet" for the random values (far from any real cycle number). */
const NO_CYCLE = -1e9;

/** The amount glides over ~20 ms, so turning the knob never jumps the output. */
const AMOUNT_GLIDE_SECONDS = 0.02;

/** A fresh random seed: a whole number below 2^24, so it also passes exactly through a meter. */
function newSeed(): number {
  return Math.floor(Math.random() * 16777216);
}

/**
 * A random number in -1..1 for cycle number `n` of the pattern belonging to `seed`: the same seed
 * and cycle always give the same value, nothing has to be stepped. Each LFO draws a new seed at
 * every Play, so every LFO and every Play gets its own pattern.
 */
export function lfoRandom(seed: number, n: number): number {
  let x = ((n | 0) ^ Math.imul(seed | 0, 0x27d4eb2d)) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967295) * 2 - 1;
}

/**
 * LFO: a slow wave that moves other modules (a filter's cutoff, a pitch, a level).
 *
 * Input 0: clock (optional). Output 0: the wave, 0..1 or −1..+1, times Amount.
 *
 * With nothing patched into the clock input the LFO runs free at "rate" Hz. With a clock patched
 * in it follows that clock instead: "sync" says how many cycles fit in one clock pulse. It
 * measures the time between two pulses and counts pulses from the first one after Play, so it
 * stays locked to the clock without drifting; a tempo change is followed from the next pulse,
 * and when the clock stops it keeps running at the last tempo.
 *
 * Parameters: "wave" (index into LFO_WAVES), "rate" in Hz, "sync" (index into LFO_SYNC),
 * "amount" 0..1, "phase" in degrees (where each Play starts), "polarity" 0 bipolar / 1 unipolar.
 * Meters: "seed" (which random pattern is playing) and "phase": where in the cycle the wave is now, 0..1 (for Random and Smooth: where in a run of
 * four cycles, so the panel can draw the real pattern).
 */
export class Lfo implements DspModule {
  readonly numInputs = 1;
  readonly numOutputs = 1;
  readonly tailSeconds = Infinity;
  readonly meterNames = ['phase', 'seed'] as const;

  private readonly sampleRate: number;
  private readonly amountCoef: number;

  private wave = 0;
  private rate = 1;
  private cycles = LFO_SYNC[LFO_SYNC_DEFAULT]!.cycles;
  private amount = 1;
  private offset = 0;
  private unipolar = false;

  private amountNow = 1;
  /** Free running: cycles completed so far (a fraction while inside one). */
  private freeCycles = 0;
  private clockConnected = false;
  private clockHigh = false;
  /** Pulses since the first one after Play (−1 before it). */
  private pulseIndex = -1;
  private sinceEdge = 0;
  /** Samples between the last two pulses (0 until there have been two). */
  private period = 0;
  /** The cycle the random values below belong to. */
  private cycleOfRandom = NO_CYCLE;
  private randomA = 0;
  private randomB = 0;
  /** Which random pattern this LFO plays; drawn anew at every Play. */
  private seed = newSeed();
  private phaseNow = 0;
  /** What the panel shows: the place in the cycle, or for the random waves in a run of four cycles. */
  private position = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.amountCoef = Math.exp(-1 / (AMOUNT_GLIDE_SECONDS * sampleRate));
    this.offset = 0;
  }

  setParam(name: string, value: number): void {
    switch (name) {
      case 'wave':
        this.wave = Math.max(0, Math.min(LFO_WAVES.length - 1, Math.round(value)));
        break;
      case 'rate':
        this.rate = Math.max(0, value);
        break;
      case 'sync':
        this.cycles = LFO_SYNC[Math.max(0, Math.min(LFO_SYNC.length - 1, Math.round(value)))]!.cycles;
        break;
      case 'amount':
        this.amount = Math.max(0, Math.min(1, value));
        break;
      case 'phase':
        this.offset = (((value / 360) % 1) + 1) % 1;
        break;
      case 'polarity':
        this.unipolar = value >= 0.5;
        break;
    }
  }

  onConnectionsChanged(inputsConnected: readonly boolean[]): void {
    const connected = !!inputsConnected[0];
    if (connected !== this.clockConnected) {
      // A clock patched in (or out) mid-play starts counting afresh.
      this.pulseIndex = -1;
      this.period = 0;
      this.sinceEdge = 0;
      this.clockHigh = false;
    }
    this.clockConnected = connected;
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const out = outputs[0]!;
    const clock = inputs[0]!;
    const synced = this.clockConnected;
    const wave = this.wave;
    const offset = this.offset;
    const unipolar = this.unipolar;
    const amount = this.amount;
    const coef = this.amountCoef;
    const freePerSample = this.rate / this.sampleRate;
    const cycles = this.cycles;
    let amountNow = this.amountNow;
    let freeCycles = this.freeCycles;
    let high = this.clockHigh;
    let pulseIndex = this.pulseIndex;
    let sinceEdge = this.sinceEdge;
    let period = this.period;
    let cycleOfRandom = this.cycleOfRandom;
    let randomA = this.randomA;
    let randomB = this.randomB;
    const seed = this.seed;
    let p = this.phaseNow;
    let freeOrSyncTotal = 0;

    for (let i = 0; i < frames; i++) {
      let t: number;
      if (synced) {
        const c = clock[i]!;
        if (!high && c > HIGH) {
          high = true;
          if (pulseIndex < 0) {
            pulseIndex = 0;
          } else {
            period = Math.max(1, sinceEdge);
            pulseIndex++;
          }
          sinceEdge = 0;
        } else if (high && c < LOW) {
          high = false;
        }
        // Before the first pulse there is nothing to follow yet: the wave waits at its start.
        const frac = period > 0 ? sinceEdge / period : 0;
        t = pulseIndex < 0 ? 0 : (pulseIndex + frac) * cycles;
        if (pulseIndex >= 0) sinceEdge++;
      } else {
        t = freeCycles;
        freeCycles += freePerSample;
      }

      const total = t + offset;
      freeOrSyncTotal = total;
      const cycle = Math.floor(total);
      p = total - cycle;

      let v: number;
      if (wave === 0) {
        v = Math.sin(6.283185307179586 * p);
      } else if (wave === 1) {
        v = p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      } else if (wave === 2) {
        v = 2 * p - 1;
      } else if (wave === 3) {
        v = p < 0.5 ? 1 : -1;
      } else {
        if (cycle !== cycleOfRandom) {
          // Moving on to the next cycle reuses the value already drawn for it.
          randomA = cycle === cycleOfRandom + 1 ? randomB : lfoRandom(seed, cycle);
          randomB = lfoRandom(seed, cycle + 1);
          cycleOfRandom = cycle;
        }
        v = wave === 4 ? randomA : randomA + (randomB - randomA) * (0.5 - 0.5 * Math.cos(3.141592653589793 * p));
      }

      amountNow = amount + (amountNow - amount) * coef;
      out[i] = (unipolar ? 0.5 * v + 0.5 : v) * amountNow;
    }

    this.amountNow = Math.abs(amountNow - amount) < 1e-6 ? amount : amountNow;
    this.freeCycles = freeCycles;
    this.clockHigh = high;
    this.pulseIndex = pulseIndex;
    this.sinceEdge = sinceEdge;
    this.period = period;
    this.cycleOfRandom = cycleOfRandom;
    this.randomA = randomA;
    this.randomB = randomB;
    this.phaseNow = p;
    this.position = wave >= 4 ? ((((Math.floor(freeOrSyncTotal) % 4) + 4) % 4) + p) / 4 : p;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.position;
    out[offset + 1] = this.seed;
  }

  /** Play starts again from the top: the same phase, a new random pattern, counting afresh. */
  reset(): void {
    this.seed = newSeed();
    this.freeCycles = 0;
    this.clockHigh = false;
    this.pulseIndex = -1;
    this.sinceEdge = 0;
    this.period = 0;
    this.cycleOfRandom = NO_CYCLE;
    this.randomA = 0;
    this.randomB = 0;
    this.phaseNow = this.offset;
    this.position = this.offset;
    this.amountNow = this.amount;
  }
}
