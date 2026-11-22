import { describe, expect, it } from 'vitest';
import { MAX_PPB, clampPpb, formatLength, formatTime, timeStep, formatPosition, labelEvery, snap, snapUnit, zoomAround } from './timelineGeometry';

describe('timeline geometry', () => {
  it('snaps to bars, beats or sixteenths depending on the zoom', () => {
    expect(snapUnit(4)).toBe(4);
    expect(snapUnit(24)).toBe(1);
    expect(snapUnit(120)).toBe(0.25);
    expect(snap(9.4, 4)).toBe(8);
    expect(snap(9.6, 1)).toBe(10);
  });

  it('keeps bar numbers apart when zoomed out', () => {
    expect(labelEvery(24)).toBe(1); // 96 px per bar
    expect(labelEvery(4)).toBe(4); // 16 px per bar
  });

  it('shows positions and lengths in bars and beats', () => {
    expect(formatPosition(0)).toBe('1.1');
    expect(formatPosition(9)).toBe('3.2');
    expect(formatPosition(9.25)).toBe('3.2.2');
    expect(formatLength(64)).toBe('16 bars');
    expect(formatLength(4)).toBe('1 bar');
    expect(formatLength(6)).toBe('1 bar 2 beats');
    expect(formatLength(1)).toBe('1 beat');
  });

  it('zooms in far enough to place things within a sixteenth', () => {
    expect(MAX_PPB / 4).toBeGreaterThanOrEqual(600); // a sixteenth is hundreds of pixels wide
    expect(clampPpb(1e9)).toBe(MAX_PPB);
    expect(clampPpb(0)).toBeGreaterThan(0);
  });

  it('chooses a spacing for the time labels and writes times as m:ss', () => {
    // 120 BPM = 2 beats per second: at 24 px per beat that is 48 px per second.
    expect(timeStep(48)).toBe(2);
    expect(timeStep(4800)).toBe(0.02); // zoomed far in: hundredths
    expect(timeStep(0.5)).toBe(300); // zoomed far out: wide spacing
    expect(timeStep(0.01)).toBe(600); // and never wider than ten minutes
    expect(formatTime(0, 1)).toBe('0:00');
    expect(formatTime(65, 1)).toBe('1:05');
    expect(formatTime(1.5, 0.5)).toBe('0:01.5');
    expect(formatTime(61.04, 0.02)).toBe('1:01.04');
    expect(formatTime(599.9999, 1)).toBe('10:00');
  });

  it('zooms around the pointer', () => {
    // Beat 10 is under x = 100 at 20 px per beat (scrolled 100 px); after zooming it stays there.
    const z = zoomAround(20, 100, 100, 2);
    expect(z.ppb).toBe(40);
    expect((z.scrollLeft + 100) / z.ppb).toBe(10);
  });
});
