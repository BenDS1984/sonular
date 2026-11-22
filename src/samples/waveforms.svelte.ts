/**
 * Detailed waveforms of library samples for the timeline, worked out once per sample (from the
 * decoded audio) and kept while the app is open. Until one is ready the clip shows the library's
 * coarse overview.
 */
import { decodeLibrarySample } from './sampleBuffers';
import { computeWaveform, type Waveform } from './waveform';
import { library } from './library.svelte';

/** Ready waveforms by sample id. Replaced as a whole when one is added, so reading it is reactive. */
let ready = $state.raw<Record<string, Waveform>>({});
/** Samples being worked out, or that could not be read (not tried again). */
const started = new Set<string>();

/** The detailed waveform of a sample, once it is ready. Reactive. */
export const waveformOf = (id: string): Waveform | undefined => ready[id];

/** Start working out the waveform of a sample (nothing happens when that was already started). */
export function loadWaveform(id: string): void {
  if (started.has(id)) return;
  const info = library.samples.find((s) => s.id === id);
  if (!info) return; // the library has not loaded yet, or the sample is missing: try again later
  started.add(id);
  void decodeLibrarySample(id, info.sampleRate).then((decoded) => {
    if (!decoded) return;
    ready = { ...ready, [id]: computeWaveform(decoded.channels, decoded.rate) };
  });
}
