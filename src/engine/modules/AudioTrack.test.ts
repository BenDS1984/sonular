import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE } from '../core/types';
import { SampleBank } from '../core/SampleBank';
import { Transport } from '../core/Transport';
import { AudioTrack } from './AudioTrack';

const SR = 48000;

/** A sample of `seconds` seconds holding a constant value. */
function setup(value: number, seconds = 4) {
  const bank = new SampleBank();
  bank.set('s', SR, [new Float32Array(seconds * SR).fill(value)]);
  const transport = new Transport(SR);
  transport.setTempo(120); // 2 beats per second
  const track = new AudioTrack(SR, transport, bank);
  return { bank, transport, track };
}

/** Render `blocks` blocks, returning the left output of every sample. */
function render(t: ReturnType<typeof setup>, blocks: number): Float32Array {
  const out = new Float32Array(blocks * BLOCK_SIZE);
  for (let b = 0; b < blocks; b++) {
    t.transport.beginBlock();
    t.track.process([], [], [], BLOCK_SIZE);
    out.set(t.track.outL.subarray(0, BLOCK_SIZE), b * BLOCK_SIZE);
    t.transport.endBlock(BLOCK_SIZE);
  }
  return out;
}

const rms = (a: Float32Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length));

describe('AudioTrack', () => {
  it('plays a clip only while the song is inside it, in both channels', () => {
    const t = setup(0.5);
    t.track.setAudioClips([{ sample: 's', start: 1, end: 2, offset: 0 }]); // 0.5 s – 1 s
    const out = render(t, Math.ceil((1.5 * SR) / BLOCK_SIZE));
    const at = (sec: number) => out[Math.floor(sec * SR)]!;
    expect(at(0.25)).toBe(0);
    expect(at(0.75)).toBeCloseTo(0.5, 5);
    expect(at(1.25)).toBe(0);
  });

  it('starts in the middle of a clip when the song starts there', () => {
    const t = setup(0.5);
    t.track.setAudioClips([{ sample: 's', start: 0, end: 8, offset: 0 }]);
    t.transport.rewind(4); // 2 s in
    const out = render(t, 40);
    expect(out[BLOCK_SIZE * 39]).toBeCloseTo(0.5, 5);
    expect(out[0]).toBe(0); // fades in from silence, no click
  });

  it('plays the sample from its offset', () => {
    const bank = new SampleBank();
    const data = new Float32Array(2 * SR);
    data.fill(0.1, 0, SR); // first second quiet
    data.fill(0.9, SR); // second second loud
    bank.set('s', SR, [data]);
    const transport = new Transport(SR);
    transport.setTempo(120);
    const track = new AudioTrack(SR, transport, bank);
    track.setAudioClips([{ sample: 's', start: 0, end: 2, offset: 1 }]);
    const t = { bank, transport, track };
    const out = render(t, 100);
    expect(out[BLOCK_SIZE * 90]).toBeCloseTo(0.9, 5);
  });

  it('finds its place again after the loop turns round', () => {
    const t = setup(0.5);
    t.track.setAudioClips([{ sample: 's', start: 0, end: 2, offset: 0 }]);
    t.transport.setLoop(true, 0, 2); // 1 s loop
    const out = render(t, Math.ceil((2.5 * SR) / BLOCK_SIZE));
    expect(out[Math.floor(1.5 * SR)]).toBeCloseTo(0.5, 5);
    expect(rms(out.subarray(Math.floor(1.2 * SR), Math.floor(2.4 * SR)))).toBeGreaterThan(0.4);
  });

  it('stays silent until its sample arrives, then plays on in time', () => {
    const t = setup(0.5);
    t.track.setAudioClips([{ sample: 'later', start: 0, end: 20, offset: 0 }]);
    expect(rms(render(t, 20))).toBe(0);
    t.bank.set('later', SR, [new Float32Array(20 * SR).fill(0.25)]);
    const out = render(t, 40);
    expect(out[BLOCK_SIZE * 39]).toBeCloseTo(0.25, 5);
  });

  it('follows its level and reports a peak', () => {
    const t = setup(0.5);
    t.track.setParam('level', 0);
    t.track.setAudioClips([{ sample: 's', start: 0, end: 8, offset: 0 }]);
    expect(rms(render(t, 100))).toBeLessThan(0.1); // starts at level 1 and glides to 0
    const meters = new Float32Array(2);
    t.track.readMeters(meters, 0);
    expect(meters[0]).toBeGreaterThan(0);
  });
});

describe('AudioTrack pan', () => {
  it('turns the far side down and keeps the near side', () => {
    const t = setup(0.5);
    t.track.setParam('pan', 1);
    t.track.setAudioClips([{ sample: 's', start: 0, end: 8, offset: 0 }]);
    for (let b = 0; b < 400; b++) {
      t.transport.beginBlock();
      t.track.process([], [], [], BLOCK_SIZE);
      t.transport.endBlock(BLOCK_SIZE);
    }
    const last = BLOCK_SIZE - 1;
    expect(t.track.outL[last]!).toBeCloseTo(0, 3); // hard right: left side silent
    expect(t.track.outR[last]!).toBeCloseTo(0.5, 3);
  });
});
