/**
 * Audio tracks on the timeline: tracks that play samples from the library. Plain functions that
 * mutate in place, like ./timeline. Times are in beats; a sample's own positions are in seconds.
 */
import type { SampleInfo } from '../platform/sampleStore';
import { MAX_BEATS, MIN_CLIP_LENGTH } from './timeline';
import { PATCH_COLOR_COUNT } from './operations';
import type { AudioClip, AudioTrack, Project } from './types';

/** Highest channel level of an audio track (+6 dB), like the patch channels. */
export const AUDIO_MAX_LEVEL = 2;

/** Standard (and smallest) height of an audio track on the timeline, in pixels. */
export const AUDIO_TRACK_HEIGHT = 56;
export const MAX_AUDIO_TRACK_HEIGHT = 400;

export const clampAudioHeight = (h: number) =>
  Math.round(Math.min(MAX_AUDIO_TRACK_HEIGHT, Math.max(AUDIO_TRACK_HEIGHT, Number.isFinite(h) ? h : AUDIO_TRACK_HEIGHT)));

/** Height of an audio track on the timeline, in pixels. */
export const audioTrackHeight = (track: Pick<AudioTrack, 'height'>) =>
  track.height === undefined ? AUDIO_TRACK_HEIGHT : clampAudioHeight(track.height);

/** Make a track taller (or back to the standard); the standard height is not stored. */
export function setAudioTrackHeight(track: Pick<AudioTrack, 'height'>, height: number): void {
  const h = clampAudioHeight(height);
  if (h === AUDIO_TRACK_HEIGHT) delete track.height;
  else track.height = h;
}

export const beatsToSeconds = (beats: number, tempo: number) => (beats * 60) / tempo;
export const secondsToBeats = (seconds: number, tempo: number) => (seconds * tempo) / 60;

/** Track ids a1, a2, ...: one past the highest in use, so a removed track's id is not reused. */
export function nextAudioTrackId(project: Pick<Project, 'audioTracks'>): string {
  let max = 0;
  for (const t of project.audioTracks) {
    const n = /^a(\d+)$/.exec(t.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `a${max + 1}`;
}

/** "Audio N" for the next track: N one past the number of tracks, skipping names in use. */
export function nextAudioTrackName(project: Pick<Project, 'audioTracks'>): string {
  let n = project.audioTracks.length + 1;
  while (project.audioTracks.some((t) => t.name === `Audio ${n}`)) n++;
  return `Audio ${n}`;
}

/** Add an audio track after the others. Its colour follows the last audio track's. */
export function addAudioTrack(project: Project): AudioTrack {
  const last = project.audioTracks[project.audioTracks.length - 1];
  const track: AudioTrack = {
    id: nextAudioTrackId(project),
    name: nextAudioTrackName(project),
    color: last ? (last.color + 1) % PATCH_COLOR_COUNT : 6,
    level: 1,
    pan: 0,
    send1: 0,
    send2: 0,
    mute: false,
    solo: false,
    clips: [],
  };
  project.audioTracks.push(track);
  return track;
}

export function removeAudioTrack(project: Project, id: string): void {
  const i = project.audioTracks.findIndex((t) => t.id === id);
  if (i >= 0) project.audioTracks.splice(i, 1);
}

export function renameAudioTrack(track: Pick<AudioTrack, 'name'>, name: string): void {
  const n = name.trim().slice(0, 40);
  if (n) track.name = n;
}

/** Clip ids c1, c2, ...: one past the highest in use on the track. */
export function nextAudioClipId(track: Pick<AudioTrack, 'clips'>): string {
  let max = 0;
  for (const c of track.clips) {
    const n = /^c(\d+)$/.exec(c.id);
    if (n) max = Math.max(max, Number(n[1]));
  }
  return `c${max + 1}`;
}

/** Whether `start` for `length` beats would overlap another clip of the track. */
export function audioOverlaps(track: Pick<AudioTrack, 'clips'>, start: number, length: number, ignore?: string): boolean {
  return track.clips.some((c) => c.id !== ignore && start < c.start + c.length && c.start < start + length);
}

/**
 * Where a clip of `length` beats goes when it is dragged to `want`: there if it is free, else the
 * nearest place (left or right) where it fits between the track's other clips.
 */
export function nearestFreeAudioStart(
  track: Pick<AudioTrack, 'clips'>,
  want: number,
  length: number,
  ignore?: string,
): number {
  const others = track.clips.filter((c) => c.id !== ignore).sort((a, b) => a.start - b.start);
  let best = Math.max(0, want);
  let bestDist = Infinity;
  let from = 0;
  const gaps: [number, number][] = [];
  for (const c of others) {
    gaps.push([from, c.start]);
    from = Math.max(from, c.start + c.length);
  }
  gaps.push([from, MAX_BEATS]);
  for (const [a, b] of gaps) {
    if (b - a < length) continue;
    const s = Math.min(b - length, Math.max(a, want));
    const d = Math.abs(s - want);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/**
 * Put a whole sample on a track, at `want` or the nearest free place. Its length follows the tempo
 * (the sample plays at its own speed). Returns the clip, or null when the sample is too short to
 * make a clip or there is no room.
 */
export function addAudioClip(
  track: AudioTrack,
  sample: Pick<SampleInfo, 'id' | 'name' | 'duration'>,
  want: number,
  tempo: number,
): AudioClip | null {
  const length = secondsToBeats(sample.duration, tempo);
  if (!(length >= MIN_CLIP_LENGTH) || length > MAX_BEATS) return null;
  const start = nearestFreeAudioStart(track, want, length);
  if (start + length > MAX_BEATS + 1e-9 || audioOverlaps(track, start, length)) return null;
  const clip: AudioClip = { id: nextAudioClipId(track), sample: sample.id, name: sample.name, start, length, offset: 0 };
  track.clips.push(clip);
  return clip;
}

/**
 * The free space on a track around a clip: from the end of the clip before it to the start of the
 * one after it. A clip being resized stays inside this range.
 */
export function audioFreeRange(track: Pick<AudioTrack, 'clips'>, at: number, ignore?: string) {
  let lo = 0;
  let hi = MAX_BEATS;
  for (const c of track.clips) {
    if (c.id === ignore) continue;
    const end = c.start + c.length;
    if (end <= at) lo = Math.max(lo, end);
    else if (c.start >= at) hi = Math.min(hi, c.start);
  }
  return { lo, hi };
}

/** The longest a clip can be before it runs past the end of its sample, in beats. */
export function maxAudioLength(clip: Pick<AudioClip, 'offset'>, duration: number, tempo: number): number {
  return secondsToBeats(Math.max(0, duration - clip.offset), tempo);
}

/**
 * Cut the start of a clip to beat `start` (later: shorter; earlier: longer, as far as the sample
 * goes back). The sound stays where it was: the offset moves with the start.
 */
export function trimAudioStart(clip: AudioClip, start: number, tempo: number, minStart: number): void {
  const end = clip.start + clip.length;
  const back = secondsToBeats(clip.offset, tempo); // beats of sample before the clip
  const s = Math.min(end - MIN_CLIP_LENGTH, Math.max(minStart, clip.start - back, start));
  clip.offset = Math.max(0, clip.offset + beatsToSeconds(s - clip.start, tempo));
  clip.start = s;
  clip.length = end - s;
}

/** Copy a clip to the first free place after it. Returns the copy, or null when there is no room. */
export function duplicateAudioClip(track: AudioTrack, id: string): AudioClip | null {
  const clip = track.clips.find((c) => c.id === id);
  if (!clip) return null;
  const start = nearestFreeAudioStart(track, clip.start + clip.length, clip.length);
  if (start + clip.length > MAX_BEATS + 1e-9 || audioOverlaps(track, start, clip.length)) return null;
  const copy: AudioClip = { ...clip, id: nextAudioClipId(track), start };
  track.clips.push(copy);
  return copy;
}

// ---------- Fades ----------

/** Fades shorter than this (beats) count as none. */
const MIN_FADE = 1e-4;

/**
 * The fades that apply to a clip, in beats: the fade in fits in the clip, the fade out in what is
 * left after it. A clip made shorter keeps its fades, so making it longer again brings them back.
 */
export function audioFades(clip: Pick<AudioClip, 'length' | 'fadeIn' | 'fadeOut'>): { fadeIn: number; fadeOut: number } {
  const fadeIn = Math.min(Math.max(0, clip.fadeIn ?? 0), clip.length);
  const fadeOut = Math.min(Math.max(0, clip.fadeOut ?? 0), clip.length - fadeIn);
  return { fadeIn, fadeOut };
}

/** Set a clip's fade in or fade out, in beats, as far as there is room next to the other fade. */
export function setAudioFade(clip: AudioClip, which: 'in' | 'out', beats: number): void {
  const other = which === 'in' ? audioFades(clip).fadeOut : audioFades(clip).fadeIn;
  const v = Math.min(Math.max(0, Number.isFinite(beats) ? beats : 0), clip.length - other);
  const key = which === 'in' ? 'fadeIn' : 'fadeOut';
  if (v < MIN_FADE) delete clip[key];
  else clip[key] = v;
}

// ---------- Clip volume ----------

/** Loudest a clip's own volume goes: +12 dB. */
export const MAX_CLIP_GAIN = 10 ** (12 / 20);

export const clampClipGain = (g: number) => Math.min(MAX_CLIP_GAIN, Math.max(0, Number.isFinite(g) ? g : 1));

/** A clip's own volume as a factor (1 = 0 dB). */
export const audioGain = (clip: Pick<AudioClip, 'gain'>) => (clip.gain === undefined ? 1 : clampClipGain(clip.gain));

/** Set a clip's own volume (a factor); 0 dB is not stored. */
export function setAudioGain(clip: AudioClip, gain: number): void {
  const g = clampClipGain(gain);
  if (g === 1) delete clip.gain;
  else clip.gain = g;
}

/**
 * Where the volume line sits in a clip, 0 (bottom: silent) to 1 (top: +12 dB), and back. Like a
 * fader: the position cubed, so 0 dB is a bit under two thirds of the way up and -6 dB about halfway.
 */
const GAIN_CURVE_TOP = Math.cbrt(MAX_CLIP_GAIN);
export const gainToLinePosition = (gain: number) => Math.cbrt(clampClipGain(gain)) / GAIN_CURVE_TOP;
export const linePositionToGain = (pos: number) => clampClipGain((Math.min(1, Math.max(0, pos)) * GAIN_CURVE_TOP) ** 3);

/** A clip volume as text: "+3.5 dB", "-6.0 dB", "0 dB" or "-inf dB". */
export function formatGainDb(gain: number): string {
  if (!(gain > 1e-5)) return '-inf dB';
  const db = Math.round(20 * Math.log10(gain) * 10) / 10;
  if (db === 0) return '0 dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export function removeAudioClip(track: AudioTrack, id: string): void {
  const i = track.clips.findIndex((c) => c.id === id);
  if (i >= 0) track.clips.splice(i, 1);
}

/** Ids of the samples used by the project's audio clips. */
export function usedSamples(project: Pick<Project, 'audioTracks'>): Set<string> {
  const ids = new Set<string>();
  for (const t of project.audioTracks) for (const c of t.clips) ids.add(c.sample);
  return ids;
}

// ---------- Splitting and replacing ----------

/**
 * Cut a clip in two at beat `at`: the first part keeps the clip, the second is a new clip that plays
 * on from the same place in the sample. The first part keeps the fade in, the second the fade out;
 * the cut itself gets no fade (only the engine's few milliseconds against clicks). Returns the new
 * clip, or null when `at` is not inside the clip or would leave a part shorter than the shortest clip.
 */
export function splitAudioClip(track: AudioTrack, id: string, at: number, tempo: number): AudioClip | null {
  const clip = track.clips.find((c) => c.id === id);
  if (!clip) return null;
  const end = clip.start + clip.length;
  if (!(at - clip.start >= MIN_CLIP_LENGTH) || !(end - at >= MIN_CLIP_LENGTH)) return null;
  const { fadeIn, fadeOut } = audioFades(clip);
  const second: AudioClip = {
    id: nextAudioClipId(track),
    sample: clip.sample,
    name: clip.name,
    start: at,
    length: end - at,
    offset: clip.offset + beatsToSeconds(at - clip.start, tempo),
    ...(clip.gain !== undefined ? { gain: clip.gain } : {}),
  };
  clip.length = at - clip.start;
  delete clip.fadeOut;
  setAudioFade(clip, 'in', fadeIn);
  setAudioFade(second, 'out', fadeOut);
  track.clips.push(second);
  return second;
}

/**
 * Make room on a track for something placed from `start` to `end`: clips under it are removed, cut
 * short at the start or the end (the sound stays where it was), or, when it lies inside a clip, the
 * clip is split in two around it. Clips in `keep` (the ones just placed) are left alone. Leftovers
 * shorter than the shortest clip are dropped.
 */
export function carveAudio(track: AudioTrack, start: number, end: number, keep: readonly string[], tempo: number): void {
  const eps = 1e-9;
  for (const c of [...track.clips]) {
    if (keep.includes(c.id)) continue;
    const cEnd = c.start + c.length;
    if (cEnd <= start + eps || c.start >= end - eps) continue; // not under it
    const before = start - c.start; // what stays in front of the new piece
    const after = cEnd - end; // what stays behind it
    // Cut edges lose their fade, as when splitting; the outer edges keep theirs.
    if (before > eps && after > eps) {
      // Inside: keep both sides.
      const right: AudioClip = {
        id: nextAudioClipId(track),
        sample: c.sample,
        name: c.name,
        start: end,
        length: after,
        offset: c.offset + beatsToSeconds(end - c.start, tempo),
        ...(c.gain !== undefined ? { gain: c.gain } : {}),
      };
      if (c.fadeOut !== undefined) setAudioFade(right, 'out', c.fadeOut);
      c.length = before;
      delete c.fadeOut;
      track.clips.push(right);
    } else if (before > eps) {
      c.length = before;
      delete c.fadeOut;
    } else if (after > eps) {
      c.offset += beatsToSeconds(end - c.start, tempo);
      c.start = end;
      c.length = after;
      delete c.fadeIn;
    } else {
      removeAudioClip(track, c.id);
      continue;
    }
  }
  // Leftovers that are too short to be a clip go.
  for (const c of [...track.clips]) {
    if (!keep.includes(c.id) && c.length < MIN_CLIP_LENGTH - 1e-9) removeAudioClip(track, c.id);
  }
}

/**
 * Put a whole sample on a track exactly at `start` (not moved to a free place): whatever was there
 * is replaced. Returns the clip, or null when it would run past the end of the timeline.
 */
export function placeAudioClip(
  track: AudioTrack,
  sample: Pick<SampleInfo, 'id' | 'name' | 'duration'>,
  start: number,
  tempo: number,
): AudioClip | null {
  const length = secondsToBeats(sample.duration, tempo);
  const s = Math.max(0, start);
  if (!(length >= MIN_CLIP_LENGTH) || s + length > MAX_BEATS) return null;
  // Make room first: carving may add a clip (the part behind), which takes an id of its own.
  carveAudio(track, s, s + length, [], tempo);
  const clip: AudioClip = { id: nextAudioClipId(track), sample: sample.id, name: sample.name, start: s, length, offset: 0 };
  track.clips.push(clip);
  return clip;
}
