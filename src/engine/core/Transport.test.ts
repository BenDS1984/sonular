import { describe, expect, it } from 'vitest';
import { Clock, clockRatio } from '../modules/Clock';
import { Transport } from './Transport';

const SR = 48000;
const BLOCK = 128;

/** Run the transport for `blocks` blocks, collecting the position of every sample. */
function positions(t: Transport, blocks: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < blocks; b++) {
    t.beginBlock();
    for (let i = 0; i < BLOCK; i++) out.push(t.beatAt(i));
    t.endBlock(BLOCK);
  }
  return out;
}

describe('transport', () => {
  it('starts at the playhead', () => {
    const t = new Transport(SR);
    t.rewind(8);
    const p = positions(t, 1);
    expect(p[0]).toBe(8);
    expect(p[100]).toBeCloseTo(8 + (100 * 2) / SR, 12); // 120 BPM = 2 beats per second
  });

  it('jumps from the loop end to the loop start on the exact sample', () => {
    const t = new Transport(SR);
    t.setLoop(true, 4, 8);
    t.rewind(7.99);
    const p = positions(t, 20);
    const jump = p.findIndex((b, i) => i > 0 && b < p[i - 1]!);
    // 0.01 beats at 2 beats per second is 240 samples.
    expect(jump).toBe(240);
    expect(p[jump]).toBeCloseTo(4, 9);
    expect(Math.max(...p)).toBeLessThan(8);
    // Evenly spaced on both sides of the jump.
    expect(p[jump + 1]! - p[jump]!).toBeCloseTo(p[jump - 1]! - p[jump - 2]!, 12);
  });

  it('keeps looping exactly, without drift', () => {
    const t = new Transport(SR);
    t.setLoop(true, 0, 1); // one beat = 24000 samples
    const p = positions(t, Math.ceil((24000 * 50) / BLOCK) + 1);
    const jumps = p.flatMap((b, i) => (i > 0 && b < p[i - 1]! ? [i] : []));
    expect(jumps.length).toBe(50);
    jumps.forEach((j, k) => expect(j).toBe(24000 * (k + 1)));
  });

  it('runs on without looping when started past the loop end', () => {
    const t = new Transport(SR);
    t.setLoop(true, 0, 4);
    t.rewind(6);
    const p = positions(t, 10);
    expect(p.every((b, i) => i === 0 || b > p[i - 1]!)).toBe(true);
  });

  it('ignores a loop without length', () => {
    const t = new Transport(SR);
    t.setLoop(true, 4, 4);
    t.rewind(3.99);
    const p = positions(t, 10);
    expect(p.every((b, i) => i === 0 || b > p[i - 1]!)).toBe(true);
  });

  it('keeps clock pulses in place across the loop jump', () => {
    const t = new Transport(SR);
    t.setLoop(true, 0, 2);
    const clock = new Clock(t);
    clock.setParam('ratio1', clockRatio('1/4')); // a pulse every beat
    const outs = Array.from({ length: 4 }, () => new Float32Array(BLOCK));
    const rises: number[] = [];
    let last = 0;
    let n = 0;
    for (let b = 0; b < Math.ceil((24000 * 6) / BLOCK); b++) {
      t.beginBlock();
      clock.process([], [], outs, BLOCK);
      t.endBlock(BLOCK);
      for (let i = 0; i < BLOCK; i++, n++) {
        const v = outs[0]![i]!;
        if (v > 0.5 && last <= 0.5) rises.push(n);
        last = v;
      }
    }
    // One pulse per beat, every 24000 samples, also where the loop jumps back.
    expect(rises.slice(0, 6)).toEqual([0, 24000, 48000, 72000, 96000, 120000]);
  });
});
