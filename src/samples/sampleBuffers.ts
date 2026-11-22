/**
 * Reading a sample of the library as audio for the engine: decoded at the engine's sample rate
 * (the browser resamples while decoding), one array per channel (mono stays mono).
 */
import { browserSampleStore } from '../platform/sampleStore';

export interface DecodedSample {
  rate: number;
  channels: Float32Array[];
}

/** Decode a library sample for an engine running at `rate` Hz. Null when it is missing or unreadable. */
export async function decodeLibrarySample(id: string, rate: number): Promise<DecodedSample | null> {
  try {
    const blob = await browserSampleStore.file(id);
    if (!blob) return null;
    const data = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, rate);
    const buffer = await ctx.decodeAudioData(data);
    const channels = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c).slice());
    return { rate: buffer.sampleRate, channels };
  } catch {
    return null;
  }
}
