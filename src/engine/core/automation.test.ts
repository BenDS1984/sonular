import { describe, expect, it } from 'vitest';
import { laneValueAt, positionAt, segmentAt, type EngineLane } from './automation';
import { Engine } from './Engine';
import { BLOCK_SIZE, type DspModule, type ModuleFactory } from './types';
import { Master } from '../modules/Master';

/** Generator writing its "value" parameter as a constant signal. */
class Const implements DspModule {
  readonly numInputs = 0;
  readonly numOutputs = 1;
  readonly tailSeconds = Infinity;
  value = 0;
  setParam(name: string, v: number) {
    if (name === 'value') this.value = v;
  }
  process(_i: readonly Float32Array[], _s: readonly boolean[], out: readonly Float32Array[], n: number) {
    out[0]!.fill(this.value, 0, n);
  }
  reset() {}
}

const SR = 48000;

const lane = (over: Partial<EngineLane>): EngineLane => ({
  node: 'c',
  param: 'value',
  times: [0, 4],
  positions: [0, 1],
  min: 0,
  max: 1,
  scale: 'linear',
  step: 0,
  ...over,
});

function setup(value = 0.5) {
  const factories: Record<string, ModuleFactory> = { const: () => new Const(), master: () => new Master() };
  const engine = new Engine(SR, factories);
  engine.setPatch({
    nodes: [
      { id: 'c', kind: 'const', params: { value } },
      { id: 'master', kind: 'master' },
    ],
    connections: [{ from: { node: 'c', port: 0 }, to: { node: 'master', port: 0 } }],
  });
  const L = new Float32Array(BLOCK_SIZE);
  const R = new Float32Array(BLOCK_SIZE);
  /** Render until the transport reaches `beat`; returns the first sample of the last block. */
  const renderTo = (beat: number) => {
    while (engine.transport.beat < beat) engine.renderBlock(L, R, BLOCK_SIZE);
    return L[0]!;
  };
  return { engine, renderTo, L, R };
}

describe('automation lane values', () => {
  it('draws straight lines between points and holds before the first and after the last', () => {
    const times = [1, 2, 4];
    const pos = [0.2, 1, 0];
    expect(positionAt(times, pos, 0)).toBe(0.2);
    expect(positionAt(times, pos, 1.5)).toBeCloseTo(0.6);
    expect(positionAt(times, pos, 3)).toBeCloseTo(0.5);
    expect(positionAt(times, pos, 9)).toBe(0);
    expect(positionAt([], [], 1)).toBe(0);
  });

  it('finds the segment from a hint, and from the start when the hint is past the position', () => {
    const times = [0, 1, 2, 3, 4];
    expect(segmentAt(times, 2.5, 1)).toBe(2);
    expect(segmentAt(times, 0.5, 3)).toBe(0);
    expect(segmentAt(times, 10, 0)).toBe(3);
  });

  it('follows the knob travel for logarithmic controls and holds stepped ones', () => {
    // Halfway along a log knob from 20 to 20000 is about 632, not 10010.
    expect(laneValueAt(lane({ min: 20, max: 20000, scale: 'log' }), 2)).toBeCloseTo(632.5, 0);
    // A switch with steps of 1 keeps the first point's value until the next point.
    const sw = lane({ min: 0, max: 3, step: 1, positions: [0, 1] });
    expect(laneValueAt(sw, 3.9)).toBe(0);
    expect(laneValueAt(sw, 4)).toBe(3);
  });
});

describe('automation in the engine', () => {
  it('sets the control to the lane value at the start of every block', () => {
    const { engine, renderTo } = setup();
    engine.restart(0);
    engine.setAutomation([lane({})]);
    // 128 samples at 120 BPM and 48 kHz are 1/187.5 beat: the block value lags at most that.
    expect(renderTo(1)).toBeCloseTo(0.25, 2);
    expect(renderTo(3)).toBeCloseTo(0.75, 2);
    expect(renderTo(6)).toBe(1);
  });

  it('starts from the playhead and leaves controls without a lane alone', () => {
    const { engine, renderTo } = setup(0.3);
    engine.restart(2);
    engine.setAutomation([lane({ param: 'other' })]);
    expect(renderTo(2.5)).toBeCloseTo(0.3);
    engine.setAutomation([lane({})]);
    expect(renderTo(2.6)).toBeCloseTo(0.65, 2);
  });

  it('applies a lane again when the lanes are sent again, even on a flat line', () => {
    const { engine, renderTo } = setup();
    engine.restart(0);
    engine.setAutomation([lane({ positions: [0.4, 0.4] })]);
    expect(renderTo(0.5)).toBeCloseTo(0.4);
    // Taken over: the main thread leaves the lane out and sends the knob's value.
    engine.setAutomation([]);
    engine.setParam('c', 'value', 0.9);
    expect(renderTo(0.6)).toBeCloseTo(0.9);
    // Play again: the lane is back.
    engine.setAutomation([lane({ positions: [0.4, 0.4] })]);
    expect(renderTo(0.7)).toBeCloseTo(0.4);
  });

  it('applies the lane again after a patch change resets the control', () => {
    const { engine, renderTo } = setup();
    engine.restart(0);
    engine.setAutomation([lane({ positions: [0.4, 0.4] })]);
    renderTo(0.5);
    engine.setPatch({
      nodes: [
        { id: 'c', kind: 'const', params: { value: 0.1 } },
        { id: 'master', kind: 'master' },
      ],
      connections: [{ from: { node: 'c', port: 0 }, to: { node: 'master', port: 0 } }],
    });
    expect(renderTo(0.6)).toBeCloseTo(0.4);
  });
});
