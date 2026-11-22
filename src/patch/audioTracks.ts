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
