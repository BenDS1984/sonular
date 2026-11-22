/**
 * The sample library as the app sees it: the list of samples (kept on this computer, see
 * src/platform/sampleStore.ts), adding files, renaming, removing, and listening to one sample.
 * Listening plays the file on its own, apart from the patch and the transport.
 */
import { askPersistentStorage, browserSampleStore, type SampleInfo } from '../platform/sampleStore';
import { showToast } from '../ui/toast.svelte';
import { computePeaks, isAudioFile, sampleName } from './sampleFiles';

const store = browserSampleStore;

export const library = $state({
  samples: [] as SampleInfo[],
  loaded: false,
  /** Files being read right now. */
  adding: 0,
  /** The sample being listened to. */
  playing: null as string | null,
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

// ---------- Listening ----------

let audio: HTMLAudioElement | null = null;
let url: string | null = null;

export function stopPreview() {
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
  audio = a;
  library.playing = id;
  a.onended = () => {
    if (audio === a) stopPreview();
  };
  try {
    await a.play();
  } catch {
    if (audio === a) stopPreview();
    showToast('This sample could not be played.', 'error');
  }
}
