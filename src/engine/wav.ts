/**
 * WAV files: 24-bit stereo PCM, the format the Recorder saves. Plain TypeScript (no browser
 * APIs), so it can be tested in Node.
 */

export const WAV_BITS = 24;
const BYTES_PER_SAMPLE = WAV_BITS / 8;
const MAX_24 = 8388607; // 2^23 - 1

/**
 * Convert one piece of stereo audio to the bytes of a WAV data chunk: interleaved L/R, 24-bit
 * little-endian. Values beyond ±1 are clipped (the meters show when that happens).
 */
export function encodePcm24(left: Float32Array, right: Float32Array): Uint8Array {
  const frames = Math.min(left.length, right.length);
  const out = new Uint8Array(frames * 2 * BYTES_PER_SAMPLE);
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < 2; c++) {
      const x = c === 0 ? left[i]! : right[i]!;
      const clipped = x > 1 ? 1 : x < -1 ? -1 : x || 0; // `|| 0` turns NaN into silence
      const v = Math.round(clipped * MAX_24);
      out[o++] = v & 0xff;
      out[o++] = (v >> 8) & 0xff;
      out[o++] = (v >> 16) & 0xff;
    }
  }
  return out;
}

/** The 44-byte header of a 24-bit stereo WAV file holding `frames` frames. */
export function wavHeader(frames: number, sampleRate: number): Uint8Array {
  const channels = 2;
  const blockAlign = channels * BYTES_PER_SAMPLE;
  const dataBytes = frames * blockAlign;
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) header[offset + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // size of the fmt chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, WAV_BITS, true);
  text(36, 'data');
  view.setUint32(40, dataBytes, true);
  return header;
}

/** Read a 24-bit stereo WAV back into float samples (used by the tests). */
export function decodeWav24(bytes: Uint8Array): { sampleRate: number; left: Float32Array; right: Float32Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const frames = view.getUint32(40, true) / (2 * BYTES_PER_SAMPLE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < 2; c++) {
      let v = bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16);
      if (v & 0x800000) v -= 0x1000000;
      o += 3;
      (c === 0 ? left : right)[i] = v / MAX_24;
    }
  }
  return { sampleRate, left, right };
}
