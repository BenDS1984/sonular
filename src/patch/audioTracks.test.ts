import { describe, expect, it } from 'vitest';
import {
  addAudioClip,
  addAudioTrack,
  audioFades,
  audioGain,
  setAudioGain,
  gainToLinePosition,
  linePositionToGain,
  formatGainDb,
  MAX_CLIP_GAIN,
  carveAudio,
  setAudioFade,
  placeAudioClip,
  splitAudioClip,
  AUDIO_TRACK_HEIGHT,
  audioTrackHeight,
  setAudioTrackHeight,
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
  it('can be made taller, within limits, and the standard height is not stored', () => {
    const t = addAudioTrack(emptyProject('x', 120));
    expect(audioTrackHeight(t)).toBe(AUDIO_TRACK_HEIGHT);
    setAudioTrackHeight(t, 150);
    expect(audioTrackHeight(t)).toBe(150);
    setAudioTrackHeight(t, 20);
    expect(t.height).toBeUndefined();
    setAudioTrackHeight(t, 99999);
    expect(audioTrackHeight(t)).toBeLessThanOrEqual(400);
  });

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

describe('splitting and replacing', () => {
  /** A track with one clip of a 4 s sample from beat 0 to 8 at 120 BPM. */
  function setup() {
    const t = addAudioTrack(emptyProject('x', 120));
    const clip = addAudioClip(t, sample('s1', 4), 0, 120)!;
    return { t, clip };
  }
  const spans = (t: { clips: { start: number; length: number; offset: number }[] }) =>
    [...t.clips].sort((a, b) => a.start - b.start).map((c) => [c.start, c.start + c.length, c.offset]);

  it('splits a clip in two that play on seamlessly', () => {
    const { t, clip } = setup();
    const second = splitAudioClip(t, clip.id, 3, 120)!;
    expect(spans(t)).toEqual([[0, 3, 0], [3, 8, 1.5]]); // 3 beats = 1.5 s into the sample
    expect(second.id).not.toBe(clip.id);
    expect(splitAudioClip(t, clip.id, 0, 120)).toBeNull(); // not inside
    expect(splitAudioClip(t, clip.id, 2.5, 120)).not.toBeNull();
    expect(splitAudioClip(t, 'nope', 3, 120)).toBeNull();
  });

  it('does not leave a piece shorter than the shortest clip', () => {
    const { t, clip } = setup();
    expect(splitAudioClip(t, clip.id, 0.1, 120)).toBeNull();
    expect(splitAudioClip(t, clip.id, 7.9, 120)).toBeNull();
  });

  it('replaces the part under a new clip: cut at the end, cut at the start, split, removed', () => {
    const { t } = setup(); // 0–8
    carveAudio(t, 6, 10, [], 120); // overlaps the end
    expect(spans(t)).toEqual([[0, 6, 0]]);
    carveAudio(t, -2, 2, [], 120); // overlaps the start: the sound stays where it was
    expect(spans(t)).toEqual([[2, 6, 1]]);
    carveAudio(t, 3, 4, [], 120); // inside: two pieces
    expect(spans(t)).toEqual([[2, 3, 1], [4, 6, 2]]);
    carveAudio(t, 0, 20, [], 120); // covers everything
    expect(t.clips).toEqual([]);
  });

  it('keeps the clips it is told to keep, and drops leftovers that are too short', () => {
    const { t, clip } = setup();
    carveAudio(t, 2, 4, [clip.id], 120);
    expect(spans(t)).toEqual([[0, 8, 0]]); // kept as it is
    carveAudio(t, 0.1, 9, [], 120);
    expect(t.clips).toEqual([]); // a 0.1 beat leftover is not a clip
  });

  it('places a sample exactly where it is put and replaces what is there', () => {
    const { t } = setup(); // 0–8
    const placed = placeAudioClip(t, sample('s2', 1), 3, 120)!; // 2 beats at 3–5
    expect(placed.start).toBe(3);
    expect(spans(t)).toEqual([[0, 3, 0], [3, 5, 0], [5, 8, 2.5]]);
    expect(t.clips.find((c) => c.sample === 's2')).toBe(placed);
    expect(new Set(t.clips.map((c) => c.id)).size).toBe(t.clips.length); // every clip has an id of its own
    expect(placeAudioClip(t, sample('s3', 1e6), 0, 120)).toBeNull();
  });
});

describe('fades', () => {
  function setup() {
    const t = addAudioTrack(emptyProject('x', 120));
    const clip = addAudioClip(t, sample('s1', 4), 0, 120)!; // 0–8
    return { t, clip };
  }

  it('fit in the clip next to each other, and a fade of zero is not stored', () => {
    const { clip } = setup();
    setAudioFade(clip, 'in', 3);
    setAudioFade(clip, 'out', 99);
    expect(audioFades(clip)).toEqual({ fadeIn: 3, fadeOut: 5 });
    setAudioFade(clip, 'in', 0);
    expect(clip.fadeIn).toBeUndefined();
  });

  it('come back when a shortened clip is made longer again', () => {
    const { clip } = setup();
    setAudioFade(clip, 'in', 6);
    clip.length = 2;
    expect(audioFades(clip).fadeIn).toBe(2);
    clip.length = 8;
    expect(audioFades(clip).fadeIn).toBe(6);
  });

  it('stay on the outer edges when a clip is split, not on the cut', () => {
    const { t, clip } = setup();
    setAudioFade(clip, 'in', 1);
    setAudioFade(clip, 'out', 2);
    const second = splitAudioClip(t, clip.id, 4, 120)!;
    expect(audioFades(clip)).toEqual({ fadeIn: 1, fadeOut: 0 });
    expect(audioFades(second)).toEqual({ fadeIn: 0, fadeOut: 2 });
  });

  it('are dropped on edges cut by a clip placed over them', () => {
    const { t, clip } = setup();
    setAudioFade(clip, 'in', 1);
    setAudioFade(clip, 'out', 2);
    placeAudioClip(t, sample('s2', 1), 3, 120); // 3–5, inside
    const [left, , right] = [...t.clips].sort((a, b) => a.start - b.start);
    expect(audioFades(left!)).toEqual({ fadeIn: 1, fadeOut: 0 });
    expect(audioFades(right!)).toEqual({ fadeIn: 0, fadeOut: 2 });
    carveAudio(t, 0, 1, [], 120); // cut the front off the left part
    expect(t.clips.find((c) => c.start === 1)?.fadeIn).toBeUndefined();
  });
});

describe('clip volume', () => {
  it('stays between silent and +12 dB, and 0 dB is not stored', () => {
    const t = addAudioTrack(emptyProject('x', 120));
    const clip = addAudioClip(t, sample('s1', 4), 0, 120)!;
    expect(audioGain(clip)).toBe(1);
    setAudioGain(clip, 100);
    expect(audioGain(clip)).toBeCloseTo(MAX_CLIP_GAIN);
    setAudioGain(clip, -1);
    expect(clip.gain).toBe(0);
    setAudioGain(clip, 1);
    expect(clip.gain).toBeUndefined();
  });

  it('maps the line position to a volume and back, with 0 dB under two thirds up', () => {
    expect(linePositionToGain(0)).toBe(0);
    expect(linePositionToGain(1)).toBeCloseTo(MAX_CLIP_GAIN);
    expect(gainToLinePosition(1)).toBeGreaterThan(0.6);
    expect(gainToLinePosition(1)).toBeLessThan(0.67);
    expect(linePositionToGain(gainToLinePosition(0.3))).toBeCloseTo(0.3);
  });

  it('is shown in dB', () => {
    expect(formatGainDb(1)).toBe('0 dB');
    expect(formatGainDb(0.5)).toBe('-6.0 dB');
    expect(formatGainDb(2)).toBe('+6.0 dB');
    expect(formatGainDb(0)).toBe('-inf dB');
  });

  it('goes with both parts when a clip is split or a clip is placed inside it', () => {
    const t = addAudioTrack(emptyProject('x', 120));
    const clip = addAudioClip(t, sample('s1', 4), 0, 120)!; // 0–8
    setAudioGain(clip, 0.5);
    const second = splitAudioClip(t, clip.id, 4, 120)!;
    expect(audioGain(second)).toBe(0.5);
    placeAudioClip(t, sample('s2', 0.5), 1, 120); // 1–2, inside the first part
    expect(t.clips.filter((c) => c.sample === 's1').map(audioGain)).toEqual([0.5, 0.5, 0.5]);
  });
});
