import { describe, expect, it, vi } from 'vitest';

const sent: [string, string, number][] = [];
vi.mock('./engine.svelte', () => ({
  audio: { setParam: (id: string, name: string, value: number) => sent.push([id, name, value]) },
}));
import {
  MAX_RECORDING_SECONDS,
  clearRecording,
  hasUnsavedRecording,
  receiveRecording,
  recorderState,
  recordingBlob,
  setArmed,
  transportStopped,
} from './recordings.svelte';

const piece = (take: number, frames: number, value = 0.5) => ({
  take,
  left: new Float32Array(frames).fill(value),
  right: new Float32Array(frames).fill(-value),
});

describe('recordings', () => {
  it('collects a take, and a new take replaces the previous one', async () => {
    receiveRecording('a', 48000, piece(1, 2400));
    receiveRecording('a', 48000, piece(1, 2400));
    expect(recorderState('a').frames).toBe(4800);
    expect(hasUnsavedRecording()).toBe(true);
    const blob = recordingBlob('a')!;
    expect(blob.size).toBe(44 + 4800 * 6);
    receiveRecording('a', 48000, piece(2, 100));
    expect(recorderState('a').frames).toBe(100);
    expect(recordingBlob('a')!.size).toBe(44 + 100 * 6);
    clearRecording('a');
    expect(recordingBlob('a')).toBeNull();
    expect(hasUnsavedRecording()).toBe(false);
  });

  it('arms and disarms through the engine, and Stop ends every take', () => {
    sent.length = 0;
    setArmed('b', true);
    expect(sent.at(-1)).toEqual(['b', 'armed', 1]);
    transportStopped();
    expect(recorderState('b').armed).toBe(false);
    expect(sent.at(-1)).toEqual(['b', 'armed', 0]);
  });

  it('stops at the longest take and keeps exactly that much', () => {
    const sr = 1000; // small rate keeps the test fast: 15 min = 900 000 frames
    setArmed('c', true);
    const max = MAX_RECORDING_SECONDS * sr;
    for (let f = 0; f < max + 5000; f += 50_000) receiveRecording('c', sr, piece(1, 50_000));
    const st = recorderState('c');
    expect(st.frames).toBe(max);
    expect(st.full).toBe(true);
    expect(st.armed).toBe(false);
  });
});
