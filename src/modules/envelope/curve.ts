/**
 * The shape of the Envelope as the panel draws it. The curves are the engine's own (see
 * src/engine/modules/Envelope.ts), written as formulas over the part of the stage that has passed
 * (t from 0 to 1), so the drawing is what you hear.
 */
import { ENVELOPE_ATTACK_TARGET as TARGET, ENVELOPE_LN_1000 as LN_1000 } from '../../engine/modules/Envelope';

/** Attack: charges towards TARGET, stops at 1 after the attack time. */
export const attackLevel = (t: number): number => TARGET * (1 - Math.pow((TARGET - 1) / TARGET, t));
/** Where in the attack (0..1) the envelope is at `level`. */
export const attackTime = (level: number): number => {
  const y = Math.min(0.999, Math.max(0, level));
  return Math.min(1, Math.max(0, Math.log(1 - y / TARGET) / Math.log((TARGET - 1) / TARGET)));
};

/** Decay: from 1 down to the sustain level; the time is the fall by 60 dB of the distance. */
export const decayLevel = (t: number, sustain: number): number => sustain + (1 - sustain) * Math.exp(-LN_1000 * t);
export const decayTime = (level: number, sustain: number): number => {
  if (sustain >= 0.999) return 1;
  const r = (level - sustain) / (1 - sustain);
  return r <= 1e-3 ? 1 : Math.min(1, Math.max(0, -Math.log(r) / LN_1000));
};

/** Release: from `from` down to 0 (−60 dB after the release time). */
export const releaseLevel = (t: number, from: number): number => from * Math.exp(-LN_1000 * t);
export const releaseTime = (level: number, from: number): number => {
  if (from <= 1e-6) return 1;
  const r = level / from;
  return r >= 1 ? 0 : r <= 1e-3 ? 1 : Math.min(1, Math.max(0, -Math.log(r) / LN_1000));
};

/** The time of the Sustain part, as a weight beside the three timed stages. */
const SUSTAIN_WEIGHT = 0.5;
const MIN_WEIGHT = 0.14;

/** How much room a stage of `seconds` (1 ms … 10 s) gets on the screen: logarithmic, never below a minimum. */
export const stageWeight = (seconds: number): number => MIN_WEIGHT + (1 - MIN_WEIGHT) * Math.min(1, Math.max(0, Math.log10(Math.max(seconds, 0.001) / 0.001) / 4));

export interface Layout {
  /** The x (0..1) where attack, decay, sustain and release start, and the end. */
  x: [number, number, number, number, number];
}

/** The four stages side by side over the width 0..1. */
export function layout(attack: number, decay: number, release: number): Layout {
  const w = [stageWeight(attack), stageWeight(decay), SUSTAIN_WEIGHT, stageWeight(release)];
  const total = w[0]! + w[1]! + w[2]! + w[3]!;
  const x: number[] = [0];
  for (const part of w) x.push(x[x.length - 1]! + part / total);
  return { x: x as Layout['x'] };
}

/** The envelope drawn as points (x, y in 0..1, y up), `steps` per curved stage. */
export function shape(attack: number, decay: number, sustain: number, release: number, steps = 28): [number, number][] {
  const { x } = layout(attack, decay, release);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([x[0]! + (x[1]! - x[0]!) * t, Math.min(1, attackLevel(t))]);
  }
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push([x[1]! + (x[2]! - x[1]!) * t, decayLevel(t, sustain)]);
  }
  pts.push([x[3]!, sustain]);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pts.push([x[3]! + (x[4]! - x[3]!) * t, releaseLevel(t, sustain)]);
  }
  return pts;
}

/**
 * Where the live dot goes: the stage the engine is in and the level it has. Idle gives null. In decay,
 * once the level has reached the sustain level, the dot rests in the middle of the sustain part.
 */
export function dotAt(stage: number, level: number, attack: number, decay: number, sustain: number, release: number): [number, number] | null {
  if (stage < 1 || stage > 3) return null;
  const { x } = layout(attack, decay, release);
  const y = Math.min(1, Math.max(0, level));
  if (stage === 1) return [x[0]! + (x[1]! - x[0]!) * attackTime(y), y];
  if (stage === 2) {
    const t = decayTime(y, sustain);
    return t >= 1 ? [(x[2]! + x[3]!) / 2, y] : [x[1]! + (x[2]! - x[1]!) * t, y];
  }
  return [x[3]! + (x[4]! - x[3]!) * releaseTime(y, sustain), y];
}
