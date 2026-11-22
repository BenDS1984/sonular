import { describe, expect, it } from 'vitest';
import { MAX_PPB, clampPpb, formatLength, formatPosition, labelEvery, snap, snapUnit, zoomAround } from './timelineGeometry';

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

  it('zooms around the pointer', () => {
    // Beat 10 is under x = 100 at 20 px per beat (scrolled 100 px); after zooming it stays there.
    const z = zoomAround(20, 100, 100, 2);
    expect(z.ppb).toBe(40);
    expect((z.scrollLeft + 100) / z.ppb).toBe(10);
  });
});
