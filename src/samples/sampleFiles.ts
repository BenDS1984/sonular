/** Plain helpers for sample files: which files are audio, names, sizes and the waveform overview. */

/** The Sampler plays samples up to this long (longer ones would make patches too heavy). */
export const SAMPLER_MAX_SECONDS = 60;

/** Drag data type of a sample dragged from the library (its hash), for dropping on a Sampler. */
export const SAMPLE_DRAG_TYPE = 'application/x-sonular-sample';

/** Number of parts in a sample's waveform overview. */
export const PEAK_COUNT = 64;

const AUDIO_EXTENSIONS = ['wav', 'wave', 'aif', 'aiff', 'aifc', 'mp3', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'webm'];

const extensionOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

/** Whether a file looks like audio (by its media type or, when that is missing, its extension). */
export function isAudioFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXTENSIONS.includes(extensionOf(file.name));
}

/** A sample's name from its file name: without the extension. */
export function sampleName(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  const base = i > 0 ? fileName.slice(0, i) : fileName;
  return base.trim() || fileName;
}

/** Peak level (0..1) of each of `count` equal parts, over all channels. */
export function computePeaks(channels: readonly Float32Array[], count = PEAK_COUNT): number[] {
  const length = channels[0]?.length ?? 0;
  const peaks = new Array<number>(count).fill(0);
  if (length === 0) return peaks;
  for (let p = 0; p < count; p++) {
    const from = Math.floor((p * length) / count);
    const to = Math.max(from + 1, Math.floor(((p + 1) * length) / count));
    let peak = 0;
    for (const ch of channels) {
      for (let i = from; i < to && i < length; i++) {
        const v = Math.abs(ch[i]!);
        if (v > peak) peak = v;
      }
    }
    peaks[p] = Math.min(1, peak);
  }
  return peaks;
}

/** A size in bytes for people: "820 KB", "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A sample length for people: "0.35 s", "2.4 s", "1:05". */
export function formatSampleLength(seconds: number): string {
  if (seconds < 1) return `${seconds.toFixed(2)} s`;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
