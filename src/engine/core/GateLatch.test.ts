import { describe, expect, it } from 'vitest';
import { GateLatch } from './GateLatch';

describe('GateLatch', () => {
  it('reports a gate that was open, once, even when it closed again', () => {
    const latch = new GateLatch();
    const block = new Float32Array(128);
    block.fill(1, 10, 20);
    latch.see(block, 128);
    latch.see(new Float32Array(128), 128); // later, silent blocks do not clear it
    expect(latch.take()).toBe(1);
    expect(latch.take()).toBe(0);
  });

  it('ignores a closed gate and values past the block length', () => {
    const latch = new GateLatch();
    const block = new Float32Array(128);
    block[100] = 1;
    latch.see(block, 64); // only the first 64 frames are valid
    expect(latch.take()).toBe(0);
  });
});
