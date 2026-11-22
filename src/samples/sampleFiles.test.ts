import { describe, expect, it } from 'vitest';
import { computePeaks, formatBytes, formatSampleLength, isAudioFile, sampleName } from './sampleFiles';

describe('sample files', () => {
  it('recognises audio by media type or extension', () => {
    expect(isAudioFile({ name: 'kick.wav', type: 'audio/wav' })).toBe(true);
    expect(isAudioFile({ name: 'Pad.AIFF', type: '' })).toBe(true);
    expect(isAudioFile({ name: 'loop.flac', type: 'application/octet-stream' })).toBe(true);
    expect(isAudioFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false);
    expect(isAudioFile({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
  });

  it('names a sample after its file, without the extension', () => {
    expect(sampleName('Snare 02.wav')).toBe('Snare 02');
    expect(sampleName('my.loop.v2.mp3')).toBe('my.loop.v2');
    expect(sampleName('.hidden')).toBe('.hidden');
  });

  it('measures the peak of each part of the sound, over all channels', () => {
    const left = new Float32Array(8).fill(0.1);
    const right = new Float32Array(8);
    left[1] = -0.5;
    right[6] = 0.9;
    expect(computePeaks([left, right], 4).map((p) => +p.toFixed(2))).toEqual([0.5, 0.1, 0.1, 0.9]);
    expect(computePeaks([], 3)).toEqual([0, 0, 0]);
  });

  it('shows sizes and lengths for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(820 * 1024)).toBe('820 KB');
    expect(formatBytes(12.4 * 1024 * 1024)).toBe('12.4 MB');
    expect(formatSampleLength(0.354)).toBe('0.35 s');
    expect(formatSampleLength(2.44)).toBe('2.4 s');
    expect(formatSampleLength(65)).toBe('1:05');
  });
});
