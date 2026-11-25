/**
 * The sample library as the app sees it: the list of samples (kept on this computer, see
 * src/platform/sampleStore.ts), adding files, renaming, removing, and listening to one sample.
 * Listening plays the file on its own, apart from the patch and the transport.
 */
import { askPersistentStorage, browserSampleStore, type SampleInfo } from '../platform/sampleStore';
import { showToast } from '../ui/toast.svelte';
import { prefs } from '../ui/prefs.svelte';
import type { SampleData } from '../engine/core/types';
import { base64ToBytes, bytesToBase64, MAX_EMBED_BYTES, type EmbeddedSample } from './embedded';
import { computePeaks, isAudioFile, sampleName } from './sampleFiles';

const store = browserSampleStore;

export const library = $state({
  samples: [] as SampleInfo[],
  loaded: false,
  /** Files being read right now. */
  adding: 0,
  /** The sample being listened to. */
  playing: null as string | null,
  /** How far it has played, 0..1. */
  progress: 0,
});

/** Total size of the library in bytes. Reactive. */
export const librarySize = () => library.samples.reduce((n, s) => n + s.size, 0);

const byName = (a: SampleInfo, b: SampleInfo) => a.name.localeCompare(b.name, undefined, { numeric: true });

let loading: Promise<void> | null = null;

/** Read the library once (later calls wait for the same read). */
export function loadLibrary(): Promise<void> {
  loading ??= store
    .list()
    .then((list) => {
      library.samples = list.sort(byName);
      library.loaded = true;
    })
    .catch(() => {
      library.loaded = true;
      showToast('The sample library could not be opened in this browser.', 'error');
    });
  return loading;
}

async function hashOf(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  // Decoding only: a tiny offline context, never heard.
  const ctx = new OfflineAudioContext(1, 1, 44100);
  return ctx.decodeAudioData(data);
}

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Add audio files to the library. Files that are not audio or cannot be read are skipped, and a
 * file already in the library is not added again; a message says what happened.
 */
export async function addSampleFiles(files: Iterable<File>): Promise<void> {
  // Take the files at once: a dropped or picked file list empties once the event is over.
  const list = Array.from(files);
  await loadLibrary();
  const audio = list.filter(isAudioFile);
  let added = 0;
  let duplicates = 0;
  const failed: string[] = list.filter((f) => !isAudioFile(f)).map((f) => f.name);
  library.adding += audio.length;
  for (const file of audio) {
    try {
      const data = await file.arrayBuffer();
      const hash = await hashOf(data);
      if (library.samples.some((s) => s.hash === hash)) {
        duplicates++;
        continue;
      }
      const buffer = await decode(data.slice(0));
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
      const info: SampleInfo = {
        id: newId(),
        name: sampleName(file.name),
        fileName: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        peaks: computePeaks(channels),
        hash,
        added: Date.now(),
      };
      await store.add(info, file);
      library.samples = [...library.samples, info].sort(byName);
      added++;
    } catch {
      failed.push(file.name);
    } finally {
      library.adding--;
    }
  }
  if (added > 0) void askPersistentStorage();
  const parts: string[] = [];
  if (added) parts.push(`Added ${added} sample${added > 1 ? 's' : ''}.`);
  if (duplicates) parts.push(`${duplicates} already in the library.`);
  if (failed.length) {
    const names = failed.slice(0, 3).join(', ') + (failed.length > 3 ? ', …' : '');
    parts.push(`Could not read ${failed.length} file${failed.length > 1 ? 's' : ''} as audio: ${names}`);
  }
  if (parts.length) showToast(parts.join(' '), failed.length ? 'warning' : 'info');
}

export async function renameSample(id: string, name: string): Promise<void> {
  const s = library.samples.find((x) => x.id === id);
  const clean = name.trim();
  if (!s || !clean || clean === s.name) return;
  await store.rename(id, clean);
  library.samples = library.samples.map((x) => (x.id === id ? { ...x, name: clean } : x)).sort(byName);
}

export async function removeSample(id: string): Promise<void> {
  if (library.playing === id) stopPreview();
  await store.remove(id);
  library.samples = library.samples.filter((x) => x.id !== id);
}

// ---------- Use in modules and patch files ----------

/** The library's entry for the sample with this hash (what modules store), if it is in the library. */
export const sampleByHash = (hash: string): SampleInfo | undefined => library.samples.find((s) => s.hash === hash);

/** The audio of a sample for the engine: one array per channel, as the file decodes. Null when it is not in the library. */
export async function loadSampleAudio(hash: string): Promise<SampleData | null> {
  await loadLibrary();
  const info = sampleByHash(hash);
  if (!info) return null;
  const blob = await store.file(info.id);
  if (!blob) return null;
  const buffer = await decode(await blob.arrayBuffer());
  // Copies, because the arrays are moved to the audio thread.
  const left = new Float32Array(buffer.getChannelData(0));
  const right = buffer.numberOfChannels > 1 ? new Float32Array(buffer.getChannelData(1)) : null;
  return { left, right, sampleRate: buffer.sampleRate };
}

/** The files of the samples with these hashes, for a patch file. `skipped` lists the names that are missing or too big. */
export async function embedSamples(hashes: Iterable<string>): Promise<{ samples: EmbeddedSample[]; skipped: string[] }> {
  await loadLibrary();
  const samples: EmbeddedSample[] = [];
  const skipped: string[] = [];
  for (const hash of new Set(hashes)) {
    const info = sampleByHash(hash);
    if (!info) {
      skipped.push('a sample that is not in the library');
      continue;
    }
    const blob = await store.file(info.id);
    if (!blob || blob.size > MAX_EMBED_BYTES) {
      skipped.push(info.name);
      continue;
    }
    samples.push({ hash, name: info.name, fileName: info.fileName, type: info.type, data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) });
  }
  return { samples, skipped };
}

/** Add the samples that came with a patch file to the library (those already there are left alone). */
export async function importEmbeddedSamples(list: readonly EmbeddedSample[]): Promise<void> {
  await loadLibrary();
  const fresh = list.filter((e) => !sampleByHash(e.hash));
  if (fresh.length === 0) return;
  await addSampleFiles(fresh.map((e) => new File([base64ToBytes(e.data) as BlobPart], e.fileName, { type: e.type })));
  // Keep the name the patch's author gave the sample.
  for (const e of fresh) {
    const info = sampleByHash(e.hash);
    if (info && info.name !== e.name) await renameSample(info.id, e.name);
  }
}

// ---------- Listening ----------

let audio: HTMLAudioElement | null = null;
let url: string | null = null;
let frame = 0;

/** Loudness for listening: the slider's position squared, so it feels even to the ear. */
const listenGain = () => (prefs.sampleMuted ? 0 : Math.min(1, Math.max(0, prefs.sampleVolume)) ** 2);

// A change of the volume (or mute) is heard at once, also while a sample plays.
$effect.root(() => {
  $effect(() => {
    const gain = listenGain();
    if (audio) audio.volume = gain;
  });
});

/** Follow the playing sample's position for the waveform. */
function track() {
  frame = 0;
  if (!audio) return;
  const d = audio.duration;
  if (Number.isFinite(d) && d > 0) library.progress = Math.min(1, audio.currentTime / d);
  frame = requestAnimationFrame(track);
}

export function stopPreview() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  library.progress = 0;
  audio?.pause();
  audio = null;
  if (url) URL.revokeObjectURL(url);
  url = null;
  library.playing = null;
}

/** Play a sample, or stop it when it is already playing. One sample plays at a time. */
export async function togglePreview(id: string): Promise<void> {
  const was = library.playing;
  stopPreview();
  if (was === id) return;
  const blob = await store.file(id);
  if (!blob) {
    showToast('This sample could not be found in the library.', 'error');
    return;
  }
  url = URL.createObjectURL(blob);
  const a = new Audio(url);
  a.volume = listenGain();
  audio = a;
  library.playing = id;
  a.onended = () => {
    if (audio === a) stopPreview();
  };
  try {
    await a.play();
    if (audio === a && !frame) frame = requestAnimationFrame(track);
  } catch {
    if (audio === a) stopPreview();
    showToast('This sample could not be played.', 'error');
  }
}
