import { describe, expect, it } from 'vitest';
import { SampleBank } from '../core/SampleBank';
import { createEngine } from '../createEngine';
import { decodeWav24, encodePcm24, wavHeader } from '../wav';
import { renderSong, type ExportJob } from './renderSong';

const SR = 48000;

/** A job with one audio track playing a 1 s sample of constant level from beat `start`. */
function job(over: Partial<ExportJob> = {}, start = 0): ExportJob {
  return {
    sampleRate: SR,
    graph: {
      nodes: [
        {
          id: 'audio/a1',
          kind: 'native:audiotrack',
          params: { level: 1, pan: 0 },
          audioClips: [{ sample: 's', start, end: start + 2, offset: 0 }],
          active: true,
        },
      ],
      connections: [],
    },
    lanes: [],
    tempo: 120, // 2 beats per second
    masterLevel: 1,
    limiter: false,
    samples: [{ id: 's', rate: SR, channels: [new Float32Array(SR).fill(0.25)] }],
    from: 0,
    to: 4,
    tailSeconds: 0,
    ...over,
  };
}

/** Render a job to one pair of arrays. */
function render(j: ExportJob) {
  const samples = new SampleBank();
  for (const s of j.samples) samples.set(s.id, s.rate, s.channels);
  const engine = createEngine(j.sampleRate, [], samples);
  const pieces: { left: Float32Array; right: Float32Array }[] = [];
  const steps = renderSong(engine, j, (left, right) => pieces.push({ left, right }));
  let r = steps.next();
  const progress: number[] = [];
  while (!r.done) {
    progress.push(r.value);
    r = steps.next();
  }
  const frames = pieces.reduce((n, p) => n + p.left.length, 0);
  const left = new Float32Array(frames);
  let o = 0;
  for (const p of pieces) {
    left.set(p.left, o);
    o += p.left.length;
  }
  return { result: r.value, left, pieces, progress };
}

describe('rendering the song', () => {
  it('renders exactly the stretch asked for, as it plays', () => {
    const { result, left, progress } = render(job());
    expect(result.frames).toBe(2 * SR); // 4 beats at 120 BPM
    expect(left[Math.floor(0.5 * SR)]).toBeCloseTo(0.25, 3); // the clip (0–1 s)
    expect(left[Math.floor(1.5 * SR)]).toBe(0); // after it
    expect(progress.at(-1)).toBe(1);
    expect(result.clipped).toBe(false);
  });

  it('starts at `from`: the loop export begins in the middle of the song', () => {
    const { result, left } = render(job({ from: 1, to: 3 }));
    expect(result.frames).toBe(SR);
    expect(left[Math.floor(0.25 * SR)]).toBeCloseTo(0.25, 3); // 0.5 s into the clip
    expect(left[Math.floor(0.75 * SR)]).toBe(0);
  });

  it('lets a sound ring on after the end, and stops the tail once it is silent', () => {
    // The clip starts at beat 3 and lasts 1 s, so it runs 0.5 s past the end (beat 4).
    const { result, left } = render(job({ tailSeconds: 10 }, 3));
    expect(result.frames).toBeGreaterThan(2.45 * SR);
    expect(result.frames).toBeLessThan(2.6 * SR); // not the whole 10 s
    expect(left[Math.floor(2.4 * SR)]).toBeCloseTo(0.25, 3);
  });

  it('notices when the master goes over 0 dB with the limiter off', () => {
    const loud = job({ samples: [{ id: 's', rate: SR, channels: [new Float32Array(SR).fill(1.5)] }] });
    expect(render(loud).result.clipped).toBe(true);
  });

  it('makes a WAV file that reads back the same', () => {
    const { result, pieces } = render(job());
    const bytes = [wavHeader(result.frames, SR), ...pieces.map((p) => encodePcm24(p.left, p.right))];
    const all = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
    let o = 0;
    for (const b of bytes) {
      all.set(b, o);
      o += b.length;
    }
    const wav = decodeWav24(all);
    expect(wav.sampleRate).toBe(SR);
    expect(wav.left.length).toBe(2 * SR);
    expect(wav.left[Math.floor(0.5 * SR)]).toBeCloseTo(0.25, 4);
  });
});
