/**
 * Samples inside a patch file. The file keeps, besides the patch, the audio files of the samples its
 * modules use (as they were added to the library, base64 in the JSON), so the patch plays on another
 * computer too. Plain helpers: no browser storage in here.
 */

export interface EmbeddedSample {
  /** SHA-256 (hex) of the audio file: how a module refers to it. */
  hash: string;
  name: string;
  fileName: string;
  /** Media type, e.g. 'audio/wav'. */
  type: string;
  /** The audio file itself, base64. */
  data: string;
}

/** A sample bigger than this (as a file) is left out of a patch file: it would make the file too heavy. */
export const MAX_EMBED_BYTES = 20 * 1024 * 1024;

export function bytesToBase64(bytes: Uint8Array): string {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}

export function base64ToBytes(data: string): Uint8Array {
  const text = atob(data);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/** The embedded samples of a parsed patch file: entries that are not complete are skipped. */
export function parseEmbedded(raw: unknown): EmbeddedSample[] {
  if (!Array.isArray(raw)) return [];
  const out: EmbeddedSample[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    if (typeof e !== 'object' || e === null) continue;
    const r = e as Record<string, unknown>;
    const { hash, name, fileName, type, data } = r;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash) || seen.has(hash)) continue;
    if (typeof data !== 'string' || data.length === 0) continue;
    seen.add(hash);
    out.push({
      hash,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 80) : 'Sample',
      fileName: typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 120) : 'sample.wav',
      type: typeof type === 'string' ? type : 'application/octet-stream',
      data,
    });
  }
  return out;
}
