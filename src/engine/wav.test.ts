import { describe, expect, it } from 'vitest';
import { decodeWav24, encodePcm24, wavHeader } from './wav';

describe('WAV (24-bit stereo)', () => {
  it('writes a valid header', () => {
    const h = wavHeader(1000, 48000);
    const v = new DataView(h.buffer);
    const text = (o: number) => String.fromCharCode(...h.subarray(o, o + 4));
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(text(12)).toBe('fmt ');
    expect(text(36)).toBe('data');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2); // stereo
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(24);
    expect(v.getUint32(40, true)).toBe(6000);
    expect(v.getUint32(4, true)).toBe(6036);
  });

  it('round-trips audio within 24-bit precision, and clips beyond ±1', () => {
    const n = 5000;
    const left = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.05) * 0.8);
    const right = Float32Array.from({ length: n }, (_, i) => (i % 2 ? -1 : 1) * (i / n));
    left[10] = 1.7;
    left[11] = -3;
    // Written in two pieces, as the recorder delivers them.
    const a = encodePcm24(left.subarray(0, 1234), right.subarray(0, 1234));
    const b = encodePcm24(left.subarray(1234), right.subarray(1234));
    const file = new Uint8Array(44 + a.length + b.length);
    file.set(wavHeader(n, 44100), 0);
    file.set(a, 44);
    file.set(b, 44 + a.length);
    const back = decodeWav24(file);
    expect(back.sampleRate).toBe(44100);
    expect(back.left.length).toBe(n);
    for (let i = 0; i < n; i++) {
      const want = Math.max(-1, Math.min(1, left[i]!));
      expect(Math.abs(back.left[i]! - want)).toBeLessThan(1.5 / 8388607);
      expect(Math.abs(back.right[i]! - right[i]!)).toBeLessThan(1.5 / 8388607);
    }
    expect(back.left[10]).toBeCloseTo(1, 6);
    expect(back.left[11]).toBeCloseTo(-1, 6);
  });
});
