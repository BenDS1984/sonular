import { describe, expect, it } from 'vitest';
import {
  addAudioClip,
  addAudioTrack,
  audioFreeRange,
  duplicateAudioClip,
  maxAudioLength,
  nearestFreeAudioStart,
  nextAudioTrackId,
  removeAudioTrack,
  trimAudioStart,
  usedSamples,
} from './audioTracks';
import { emptyProject } from './operations';

const sample = (id: string, duration: number) => ({ id, name: id, duration });

describe('audio tracks', () => {
  it('adds tracks with their own ids, names and colours, and never reuses an id', () => {
    const p = emptyProject('x', 120);
    const a = addAudioTrack(p);
    const b = addAudioTrack(p);
    expect([a.id, b.id]).toEqual(['a1', 'a2']);
    expect([a.name, b.name]).toEqual(['Audio 1', 'Audio 2']);
    expect(a.color).not.toBe(b.color);
    removeAudioTrack(p, 'a1');
    expect(nextAudioTrackId(p)).toBe('a3');
  });

  it('puts a whole sample on a track, its length following the tempo', () => {
    const t = addAudioTrack(emptyProject('x', 120));
    const clip = addAudioClip(t, sample('s1', 2), 4, 120)!;
    expect(clip).toMatchObject({ sample: 's1', start: 4, length: 4, offset: 0 });
    // At 60 BPM the same sample is half as long in beats.
    expect(addAudioClip(t, sample('s1', 2), 20, 60)!.length).toBe(2);
  });

  it('puts a sample at the nearest free place when the spot is taken', () => {
    const t = addAudioTrack(emptyProject('x', 120));
    addAudioClip(t, sample('s1', 2), 4, 120); // beats 4–8
    expect(addAudioClip(t, sample('s2', 1), 6, 120)!.start).toBe(8);
    expect(nearestFreeAudioStart(t, 3, 2)).toBe(2); // 2 beats fit before the first clip
    expect(nearestFreeAudioStart(t, 3, 5)).toBe(10); // 5 beats do not: after the last one
  });

  it('finds the free range around a clip', () => {
    const t = addAudioTrack(emptyProject('x', 120));
    const a = addAudioClip(t, sample('s1', 1), 0, 120)!; // 0–2
    const b = addAudioClip(t, sample('s2', 1), 4, 120)!; // 4–6
    expect(audioFreeRange(t, a.start, a.id)).toEqual({ lo: 0, hi: 4 });
    expect(audioFreeRange(t, b.start, b.id)).toEqual({ lo: 2, hi: 999 * 4 });
  });

  it('trims the start so the sound stays where it was', () => {
    const t = addAudioTrack(emptyProject('x', 120));
    const c = addAudioClip(t, sample('s1', 4), 8, 120)!; // 8–16, 8 beats
    trimAudioStart(c, 10, 120, 0);
    expect(c).toMatchObject({ start: 10, length: 6, offset: 1 });
    trimAudioStart(c, 0, 120, 0); // cannot go back past the start of the sample
    expect(c).toMatchObject({ start: 8, length: 8, offset: 0 });
    expect(maxAudioLength({ offset: 1 }, 4, 120)).toBe(6);
  });

  it('copies a clip after itself and lists the samples in use', () => {
    const p = emptyProject('x', 120);
    const t = addAudioTrack(p);
    const c = addAudioClip(t, sample('s1', 2), 0, 120)!;
    const copy = duplicateAudioClip(t, c.id)!;
    expect(copy).toMatchObject({ start: 4, sample: 's1' });
    expect(copy.id).not.toBe(c.id);
    expect([...usedSamples(p)]).toEqual(['s1']);
  });
});
