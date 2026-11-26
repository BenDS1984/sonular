import type { DspModule, SampleData } from '../core/types';

/** A gate input counts as high above this level and as low again below the lower one. */
const HIGH = 0.6;
const LOW = 0.4;

/** When a new gate restarts the sample, the old playback fades out over this long, so it never clicks. */
const RETRIGGER_FADE_SECONDS = 0.003;
/** An Attack at or below this is "instant": the sample starts at full level, as before Attack existed. */
const ATTACK_INSTANT_SECONDS = 0.0011;
/** A Decay at or below this is "off" (the knob's minimum): the sample plays to its end. */
const DECAY_OFF_SECONDS = 0.0051;
/** The level glides over ~20 ms, so turning the knob never clicks. */
const LEVEL_GLIDE_SECONDS = 0.02;

/**
 * Sampler: plays one sample, started by a gate.
 *
 * Inputs 1..3: modulation of tune (±1 = ±24 semitones), level (added to the knob, then limited to
 *           0..1) and decay (±1 = about 3× longer / shorter; does nothing while Decay is off).
 *           An unpatched modulation input leaves its knob alone.
 * Input 0:  gate. Every rising edge starts the sample from "start"; a new gate while it plays
 *           restarts it (the old playback fades out in 3 ms). The sample always plays to its end,
 *           whatever the gate does afterwards.
 * Outputs: 0 L, 1 R (a mono sample comes out on both).
 *
 * Attack and Decay shape every playback like an AD envelope: the level rises over "attack", then
 * falls to zero over "decay" and the sample stops there (even if it is longer). Attack at its
 * minimum is instant, Decay at its minimum is off: then nothing changes.
 *
 * Parameters: "tune" in semitones (the sample plays faster or slower, so its pitch follows),
 * "start" 0..1 (where in the sample it begins), "level" 0..1, "attack" and "decay" in seconds.
 * Meters: "position" (how far the sample has played, 0..1) and "active" (1 while it plays).
 *
 * The audio arrives from the main thread through setSample, as plain arrays. Reading is linear
 * interpolation, at the speed of tune × (the sample's rate / the engine's rate). Costs nothing while
 * no sample plays.
 */
export class Sampler implements DspModule {
  readonly numInputs = 4;
  readonly numOutputs = 2;
  /** Samples play to their end on their own, so the module never goes to sleep. */
  readonly tailSeconds = Infinity;
  /** Its panel shows the playhead, so it keeps running even with nothing on its outputs. */
  readonly isObserver = true;
  readonly meterNames = ['position', 'active'] as const;

  private readonly sampleRate: number;
  private readonly fadeStep: number;
  private readonly levelCoef: number;
  /** The most the Attack/Decay level may move per sample (a full swing takes 2 ms). */
  private readonly envSlew: number;

  private data: SampleData | null = null;
  private tune = 0;
  private start = 0;
  private level = 0.7;
  private levelNow = 0.7;
  private attack = 0;
  private decay = Infinity;

  private gateHigh = false;
  // The voice that plays, and the one fading out after a retrigger.
  private pos = 0;
  /** Attack and Decay progress of the playing voice (0..1 each) and the level they give. */
  private attackLevel = 1;
  private decayT = 0;
  private envGain = 1;
  private active = false;
  private oldPos = 0;
  private oldSpeed = 1;
  private oldGain = 0;
  private oldActive = false;
  private position = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.envSlew = 1 / (0.002 * sampleRate);
    this.fadeStep = 1 / (RETRIGGER_FADE_SECONDS * sampleRate);
    this.levelCoef = Math.exp(-1 / (LEVEL_GLIDE_SECONDS * sampleRate));
  }

  setSample(data: SampleData | null): void {
    this.data = data && data.left.length > 1 ? data : null;
    this.active = false;
    this.oldActive = false;
    this.position = 0;
  }

  setParam(name: string, value: number): void {
    switch (name) {
      case 'tune':
        this.tune = Math.min(24, Math.max(-24, value));
        break;
      case 'start':
        this.start = Math.min(1, Math.max(0, value));
        break;
      case 'level':
        this.level = Math.min(1, Math.max(0, value));
        break;
      case 'attack':
        this.attack = value <= ATTACK_INSTANT_SECONDS ? 0 : value;
        break;
      case 'decay':
        this.decay = value <= DECAY_OFF_SECONDS ? Infinity : value;
        break;
    }
  }

  /** Samples to move through the sample per output sample, for the current tune. */
  private speedNow(data: SampleData): number {
    return Math.pow(2, this.tune / 12) * (data.sampleRate / this.sampleRate);
  }

  process(inputs: readonly Float32Array[], silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const gate = inputs[0]!;
    const tuneIn = inputs[1]!;
    const levelIn = inputs[2]!;
    const decayIn = inputs[3]!;
    // An input with nothing patched (silent) leaves its knob as it is.
    const tuneMod = !silent[1];
    const levelMod = !silent[2];
    const decayMod = !silent[3];
    const outL = outputs[0]!;
    const outR = outputs[1]!;
    const data = this.data;
    let high = this.gateHigh;

    if (!data) {
      // No sample: still follow the gate, so a sample chosen later starts on the next one.
      for (let i = 0; i < frames; i++) {
        const g = gate[i]!;
        if (!high && g > HIGH) high = true;
        else if (high && g < LOW) high = false;
      }
      this.gateHigh = high;
      outL.fill(0, 0, frames);
      outR.fill(0, 0, frames);
      return;
    }

    const left = data.left;
    const right = data.right ?? data.left;
    const length = left.length;
    const last = length - 1;
    const lc = this.levelCoef;
    const levelKnob = this.level;
    const tuneKnob = this.tune;
    const fadeStep = this.fadeStep;
    const speedNew = this.speedNow(data);
    const rateRatio = data.sampleRate / this.sampleRate;
    const startPos = this.start * last;
    let level = this.levelNow;
    let pos = this.pos;
    let attackLevel = this.attackLevel;
    let decayT = this.decayT;
    let envGain = this.envGain;
    // Progress per sample: turning Attack or Decay mid-play only changes the speed, never the level.
    const attackStep = this.attack > 0 ? 1 / (this.attack * this.sampleRate) : 1;
    const decayStep = this.decay === Infinity ? 0 : 1 / (this.decay * this.sampleRate);
    const slew = this.envSlew;
    // A change of tune is heard at once, also while the sample plays.
    let speed = speedNew;
    let active = this.active;
    let oPos = this.oldPos;
    let oSpeed = this.oldSpeed;
    let oGain = this.oldGain;
    let oActive = this.oldActive;

    for (let i = 0; i < frames; i++) {
      const g = gate[i]!;
      // Tune: a signal of ±1 moves it by ±24 semitones; it follows the signal at once.
      if (tuneMod) {
        const st = tuneKnob + 24 * Math.max(-1, Math.min(1, tuneIn[i]!));
        speed = Math.pow(2, Math.max(-48, Math.min(48, st)) / 12) * rateRatio;
      }
      if (!high && g > HIGH) {
        high = true;
        if (active) {
          // Move the playing voice to the fading one and begin again.
          oPos = pos;
          oSpeed = speed;
          oGain = envGain;
          oActive = true;
        }
        pos = startPos;
        attackLevel = attackStep >= 1 ? 1 : 0;
        decayT = 0;
        envGain = attackLevel;
        if (!tuneMod) speed = speedNew;
        active = true;
      } else if (high && g < LOW) {
        high = false;
      }
      const levelT = levelMod ? Math.max(0, Math.min(1, levelKnob + levelIn[i]!)) : levelKnob;
      level = levelT + (level - levelT) * lc;

      let l = 0;
      let r = 0;
      if (active) {
        const i0 = pos | 0;
        const f = pos - i0;
        const i1 = i0 < last ? i0 + 1 : last;
        l = left[i0]! + (left[i1]! - left[i0]!) * f;
        r = right[i0]! + (right[i1]! - right[i0]!) * f;
        pos += speed;
        if (pos >= last) active = false;
        // Attack and Decay: an AD envelope over this playback.
        let e = attackLevel;
        if (attackLevel < 1) attackLevel = Math.min(1, attackLevel + attackStep);
        else if (decayStep > 0) {
          if (decayT >= 1) {
            active = false;
            e = 0;
          } else e *= (1 - decayT) * (1 - decayT);
          // Decay: a signal of ±1 makes the time about 3× longer or shorter.
          decayT += decayMod ? decayStep / Math.pow(3, Math.max(-1, Math.min(1, decayIn[i]!))) : decayStep;
        }
        // Switching Decay on or off mid-play must not jump the level: limit how fast it may move.
        const d = e - envGain;
        envGain = d > slew ? envGain + slew : d < -slew ? envGain - slew : e;
        e = envGain;
        l *= e;
        r *= e;
      }
      if (oActive) {
        const i0 = oPos | 0;
        const f = oPos - i0;
        const i1 = i0 < last ? i0 + 1 : last;
        l += (left[i0]! + (left[i1]! - left[i0]!) * f) * oGain;
        r += (right[i0]! + (right[i1]! - right[i0]!) * f) * oGain;
        oPos += oSpeed;
        oGain -= fadeStep;
        if (oGain <= 0 || oPos >= last) oActive = false;
      }
      outL[i] = l * level;
      outR[i] = r * level;
    }

    this.levelNow = level;
    this.gateHigh = high;
    this.pos = pos;
    this.attackLevel = attackLevel;
    this.decayT = decayT;
    this.envGain = envGain;
    this.active = active;
    this.oldPos = oPos;
    this.oldSpeed = oSpeed;
    this.oldGain = oGain;
    this.oldActive = oActive;
    this.position = active ? pos / last : this.position;
  }

  readMeters(out: Float32Array, offset: number): void {
    out[offset] = this.active ? this.position : 0;
    out[offset + 1] = this.active ? 1 : 0;
  }

  reset(): void {
    this.gateHigh = false;
    this.active = false;
    this.oldActive = false;
    this.position = 0;
    this.levelNow = this.level;
  }
}
