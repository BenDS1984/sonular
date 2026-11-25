import type { DspModule } from '../core/types';

/** A gate input counts as high above this level and as low again below the lower one. */
const HIGH = 0.6;
const LOW = 0.4;

/**
 * The attack charges towards this level and stops at 1, like an analog envelope: the curve
 * starts fast and rounds off at the top.
 */
export const ENVELOPE_ATTACK_TARGET = 1.3;
const ATTACK_TARGET = ENVELOPE_ATTACK_TARGET;
/** Decay and release times are the time to fall by 60 dB (to 0.1% of the way). */
export const ENVELOPE_LN_1000 = Math.log(1000);
const LN_1000 = ENVELOPE_LN_1000;
/** Below this the release snaps to zero (−120 dB), so the module can go to sleep. */
const FLOOR = 1e-6;
/** Sustain level changes glide over ~20 ms, so turning the knob never clicks. */
const SUSTAIN_GLIDE_SECONDS = 0.02;

// Stages (plain numbers: the hot loop compares small integers). The panel reads them from the meter "stage".
const IDLE = 0;
const ATTACK = 1;
const DECAY = 2;
const RELEASE = 3;

/**
 * ADSR envelope shaped by the gate input.
 *
 * Input 0:  gate.
 * Output 0: the envelope (0..1), to modulate other modules, e.g. a VCA's cv input.
 *
 * A new gate during release or decay restarts the attack from the current level (no jump to
 * zero, so retriggering never clicks).
 *
 * Parameters: "attack", "decay", "release" in seconds; "sustain" 0..1.
 * Meters (for the panel's drawing): "level", the envelope now, and "stage": 0 idle, 1 attack, 2 decay
 * (and then sustain), 3 release.
 */
export class Envelope implements DspModule {
  readonly numInputs = 1;
  readonly numOutputs = 1;
  /** The engine also waits for the output to fall silent, which covers the release. */
  readonly tailSeconds = 0;
  readonly meterNames = ['level', 'stage'] as const;

  private readonly sampleRate: number;
  private attackCoef = 0;
  private decayCoef = 0;
  private releaseCoef = 0;
  private sustain = 0.5;
  private sustainNow = 0.5;
  private readonly sustainCoef: number;

  private stage: number = IDLE;
  private level = 0;
  private gateHigh = false;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.sustainCoef = Math.exp(-1 / (SUSTAIN_GLIDE_SECONDS * sampleRate));
    this.setParam('attack', 0.005);
    this.setParam('decay', 0.3);
    this.setParam('release', 0.4);
  }

  setParam(name: string, value: number): void {
    const samples = Math.max(1, value * this.sampleRate);
    switch (name) {
      case 'attack':
        // From 0 to 1 in exactly the attack time while charging towards ATTACK_TARGET.
        this.attackCoef = Math.pow((ATTACK_TARGET - 1) / ATTACK_TARGET, 1 / samples);
        break;
      case 'decay':
        this.decayCoef = Math.exp(-LN_1000 / samples);
        break;
      case 'release':
        this.releaseCoef = Math.exp(-LN_1000 / samples);
        break;
      case 'sustain':
        this.sustain = Math.min(1, Math.max(0, value));
        break;
    }
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const gate = inputs[0]!;
    const env = outputs[0]!;

    let stage = this.stage;
    let level = this.level;
    let high = this.gateHigh;
    let sus = this.sustainNow;
    const susTarget = this.sustain;
    const susCoef = this.sustainCoef;
    const ac = this.attackCoef;
    const dc = this.decayCoef;
    const rc = this.releaseCoef;

    for (let i = 0; i < frames; i++) {
      const g = gate[i]!;
      if (!high && g > HIGH) {
        high = true;
        stage = ATTACK;
      } else if (high && g < LOW) {
        high = false;
        if (stage !== IDLE) stage = RELEASE;
      }

      sus = susTarget + (sus - susTarget) * susCoef;
      switch (stage) {
        case ATTACK:
          level = ATTACK_TARGET + (level - ATTACK_TARGET) * ac;
          if (level >= 1) {
            level = 1;
            stage = DECAY;
          }
          break;
        case DECAY:
          level = sus + (level - sus) * dc;
          break;
        case RELEASE:
          level *= rc;
          if (level < FLOOR) {
            level = 0;
            stage = IDLE;
          }
          break;
        default:
          level = 0;
      }
      env[i] = level;
    }

    this.stage = stage;
    this.level = level;
    this.gateHigh = high;
    this.sustainNow = sus;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.level;
    out[offset + 1] = this.stage;
  }

  reset(): void {
    this.stage = IDLE;
    this.level = 0;
    this.gateHigh = false;
    this.sustainNow = this.sustain;
  }
}
