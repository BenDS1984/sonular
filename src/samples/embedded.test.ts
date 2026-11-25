import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, parseEmbedded } from './embedded';

const hash = 'ab'.repeat(32);

describe('embedded samples', () => {
  it('turns bytes into base64 and back, also for large files', () => {
    const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => (i * 7) % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('reads valid entries and skips the rest', () => {
    const list = parseEmbedded([
      { hash, name: ' Kick ', fileName: 'kick.wav', type: 'audio/wav', data: 'AAAA' },
      { hash, name: 'Same hash twice', fileName: 'x.wav', type: 'audio/wav', data: 'AAAA' },
      { hash: 'not a hash', name: 'Bad', fileName: 'b.wav', type: 'audio/wav', data: 'AAAA' },
      { hash: 'cd'.repeat(32), name: 'No data', fileName: 'c.wav', type: 'audio/wav', data: '' },
      null,
      'text',
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ hash, name: 'Kick', fileName: 'kick.wav' });
    expect(parseEmbedded(undefined)).toEqual([]);
  });
});
