import { describe, expect, it } from 'vitest';
import { Engine } from './Engine';
import { BLOCK_SIZE, type DspModule, type EnginePatch, type ModuleFactory } from './types';
import { Master } from '../modules/Master';

/** Generator writing a constant value (parameter "value"). Never sleeps. */
class Const implements DspModule {
  readonly numInputs = 0;
  readonly numOutputs = 1;
  readonly tailSeconds: number = Infinity;
  value = 0;
  calls = 0;
  setParam(name: string, v: number) {
    if (name === 'value') this.value = v;
  }
  process(_i: readonly Float32Array[], _s: readonly boolean[], out: readonly Float32Array[], n: number) {
    this.calls++;
    out[0]!.fill(this.value, 0, n);
  }
  reset() {}
}

/** Stateless gain (parameter "gain"), tail 0, counts its process calls. */
class Gain implements DspModule {
  readonly numInputs = 1;
  readonly numOutputs = 1;
  readonly tailSeconds = 0;
  gain = 1;
  calls = 0;
  setParam(name: string, v: number) {
    if (name === 'gain') this.gain = v;
  }
  process(inp: readonly Float32Array[], _s: readonly boolean[], out: readonly Float32Array[], n: number) {
    this.calls++;
    for (let i = 0; i < n; i++) out[0]![i] = inp[0]![i]! * this.gain;
  }
  reset() {}
}

/** Emits NaN, to test the safety net. */
class Broken implements DspModule {
  readonly numInputs = 0;
  readonly numOutputs = 1;
  readonly tailSeconds = Infinity;
  setParam() {}
  process(_i: readonly Float32Array[], _s: readonly boolean[], out: readonly Float32Array[], n: number) {
    out[0]!.fill(NaN, 0, n);
  }
  reset() {}
}

const SR = 48000;

function setup(patch: EnginePatch) {
  const instances = new Map<string, DspModule>();
  const track = (f: ModuleFactory): ModuleFactory => (sr, t) => f(sr, t);
  const factories: Record<string, ModuleFactory> = {
    const: track(() => new Const()),
    gain: track(() => new Gain()),
    broken: track(() => new Broken()),
    master: track(() => new Master()),
  };
  const engine = new Engine(SR, factories);
  engine.setPatch(patch);
  // Reach into the engine to grab instances for assertions.
  const nodes = (engine as unknown as { nodes: Map<string, { module: DspModule }> }).nodes;
  for (const [id, n] of nodes) instances.set(id, n.module);
  const L = new Float32Array(BLOCK_SIZE);
  const R = new Float32Array(BLOCK_SIZE);
  const render = () => {
    engine.renderBlock(L, R, BLOCK_SIZE);
    return { L, R };
  };
  return { engine, instances, render };
}

const wire = (from: string, to: string, toPort = 0, fromPort = 0) => ({
  from: { node: from, port: fromPort },
  to: { node: to, port: toPort },
});

describe('Engine', () => {
  it('renders a chain in dependency order', () => {
    const { render } = setup({
      nodes: [
        { id: 'master', kind: 'master' },
        { id: 'g', kind: 'gain', params: { gain: 0.5 } },
        { id: 'c', kind: 'const', params: { value: 0.8 } },
      ],
      connections: [wire('c', 'g'), wire('g', 'master')],
    });
    const { L, R } = render();
    expect(L[0]).toBeCloseTo(0.4);
    expect(R[BLOCK_SIZE - 1]).toBeCloseTo(0.4); // mono input feeds both sides
  });

  it('sums several cables into one input', () => {
    const { render } = setup({
      nodes: [
        { id: 'a', kind: 'const', params: { value: 0.25 } },
        { id: 'b', kind: 'const', params: { value: 0.5 } },
        { id: 'master', kind: 'master' },
      ],
      connections: [wire('a', 'master'), wire('b', 'master')],
    });
    expect(render().L[10]).toBeCloseTo(0.75);
  });

  it('does not process modules that do not reach an output', () => {
    const { render, instances, engine } = setup({
      nodes: [
        { id: 'c', kind: 'const', params: { value: 0.5 } },
        { id: 'lonely', kind: 'const', params: { value: 0.5 } },
        { id: 'master', kind: 'master' },
      ],
      connections: [wire('c', 'master')],
    });
    render();
    render();
    expect((instances.get('lonely') as Const).calls).toBe(0);
    expect(engine.stats.unreachable).toBe(1);
  });

  it('puts processors to sleep when their input is silent and wakes them up again', () => {
    const { render, instances, engine } = setup({
      nodes: [
        { id: 'c', kind: 'const', params: { value: 0 } },
        { id: 'g', kind: 'gain' },
        { id: 'master', kind: 'master' },
      ],
      connections: [wire('c', 'g'), wire('g', 'master')],
    });
    const gain = instances.get('g') as Gain;
    for (let i = 0; i < 10; i++) render();
    expect(gain.calls).toBeLessThanOrEqual(1);
    expect(engine.stats.sleeping).toBe(1);

    engine.setParam('c', 'value', 0.3);
    const { L } = render();
    expect(L[0]).toBeCloseTo(0.3);
    expect(engine.stats.sleeping).toBe(0);
  });

  it('never puts a source to sleep, even if it declares no tail', () => {
    class QuietSource extends Const {
      override readonly tailSeconds = 0;
    }
    const engine = new Engine(SR, { src: () => new QuietSource(), master: () => new Master() });
    engine.setPatch({
      nodes: [
        { id: 's', kind: 'src', params: { value: 0 } },
        { id: 'master', kind: 'master' },
      ],
      connections: [wire('s', 'master')],
    });
    const L = new Float32Array(BLOCK_SIZE);
    const R = new Float32Array(BLOCK_SIZE);
    for (let i = 0; i < 5; i++) engine.renderBlock(L, R, BLOCK_SIZE);
    engine.setParam('s', 'value', 0.2);
    engine.renderBlock(L, R, BLOCK_SIZE);
    expect(L[0]).toBeCloseTo(0.2);
    expect(engine.stats.sleeping).toBe(0);
  });

  it('keeps module state when the patch changes', () => {
    const { engine, instances } = setup({
      nodes: [
        { id: 'c', kind: 'const', params: { value: 0.5 } },
        { id: 'master', kind: 'master' },
      ],
      connections: [wire('c', 'master')],
    });
    const before = instances.get('c');
    engine.setPatch({
      nodes: [
        { id: 'c', kind: 'const' },
        { id: 'master', kind: 'master' },
      ],
      connections: [],
    });
    const nodes = (engine as unknown as { nodes: Map<string, { module: DspModule }> }).nodes;
    expect(nodes.get('c')!.module).toBe(before);
  });

  it('handles feedback loops with one block of delay', () => {
    const { render } = setup({
      nodes: [
        { id: 'c', kind: 'const', params: { value: 0.1 } },
        { id: 'g1', kind: 'gain', params: { gain: 1 } },
        { id: 'g2', kind: 'gain', params: { gain: 0.5 } },
        { id: 'master', kind: 'master' },
      ],
      // c -> g1 -> master, and g1 -> g2 -> back into g1
      connections: [wire('c', 'g1'), wire('g1', 'g2'), wire('g2', 'g1'), wire('g1', 'master')],
    });
    expect(render().L[0]).toBeCloseTo(0.1);
    expect(render().L[0]).toBeCloseTo(0.15); // 0.1 + 0.5 * previous 0.1
    for (let i = 0; i < 50; i++) render();
    expect(render().L[0]).toBeCloseTo(0.2, 3); // converges to 0.1 / (1 - 0.5)
  });

  it('mutes and reports a fault when a module outputs NaN', () => {
    const { render, engine } = setup({
      nodes: [
        { id: 'x', kind: 'broken' },
        { id: 'master', kind: 'master' },
      ],
      connections: [wire('x', 'master')],
    });
    const { L, R } = render();
    expect(L.every((v) => v === 0)).toBe(true);
    expect(R.every((v) => v === 0)).toBe(true);
    expect(engine.takeMeters().faulted).toBe(true);
  });

  it('limits the master bus to ±1 and reports clipping with the true peak', () => {
    const { render, engine } = setup({
      nodes: [
        { id: 'c', kind: 'const', params: { value: 2 } },
        { id: 'master', kind: 'master' },
      ],
      connections: [wire('c', 'master')],
    });
    expect(render().L[0]).toBe(1);
    const m = engine.takeMeters();
    expect(m.clipped).toBe(true);
    expect(m.peakL).toBeCloseTo(2);
  });

  it('reports zero meters for modules that have not rendered yet', () => {
    class Metered extends Const {
      readonly meterNames = ['m'];
      readMeters(out: Float32Array, offset: number) {
        out[offset] = 1e30; // garbage until processed
      }
    }
    const engine = new Engine(SR, { metered: () => new Metered(), master: () => new Master() });
    engine.setPatch({
      nodes: [
        { id: 'x', kind: 'metered' },
        { id: 'master', kind: 'master' },
      ],
      connections: [],
    });
    const out = new Float32Array(engine.meterValueCount).fill(-1);
    engine.readMeters(out);
    expect(out[0]).toBe(0);
  });

  it('rejects unknown module kinds', () => {
    expect(() => setup({ nodes: [{ id: 'q', kind: 'nope' }], connections: [] })).toThrow(/Unknown module kind/);
  });
});

describe('Engine: mixer channels (sinks switched on and off) and master level', () => {
  /** Keeps time like a clock: counts blocks, never sleeps. */
  class Ticker implements DspModule {
    readonly numInputs = 0;
    readonly numOutputs = 1;
    readonly tailSeconds = Infinity;
    readonly keepsTime = true;
    calls = 0;
    setParam() {}
    process(_i: readonly Float32Array[], _s: readonly boolean[], out: readonly Float32Array[], n: number) {
      this.calls++;
      out[0]!.fill(0, 0, n);
    }
    reset() {}
  }
  /** Constant source that counts resets. */
  class Src extends Const {
    resets = 0;
    override reset() {
      this.resets++;
    }
  }

  function build(activeB = true) {
    const made = new Map<string, DspModule>();
    const engine = new Engine(SR, {
      src: () => new Src(),
      ticker: () => new Ticker(),
      master: () => new Master(),
    });
    engine.setPatch({
      nodes: [
        { id: 'p1/src', kind: 'src', params: { value: 0.25 } },
        { id: 'p1/out', kind: 'master' },
        { id: 'p2/src', kind: 'src', params: { value: 0.5 } },
        { id: 'p2/tick', kind: 'ticker' },
        { id: 'p2/out', kind: 'master', active: activeB },
      ],
      connections: [wire('p1/src', 'p1/out'), wire('p2/src', 'p2/out'), wire('p2/tick', 'p2/out', 1)],
    });
    const nodes = (engine as unknown as { nodes: Map<string, { module: DspModule }> }).nodes;
    for (const [id, node] of nodes) made.set(id, node.module);
    const blocks = (count: number) => {
      const L = new Float32Array(BLOCK_SIZE * count);
      const R = new Float32Array(BLOCK_SIZE * count);
      engine.render(L, R, L.length);
      return { L, R };
    };
    return { engine, made, blocks };
  }

  const maxStep = (x: Float32Array) => {
    let m = 0;
    for (let i = 1; i < x.length; i++) m = Math.max(m, Math.abs(x[i]! - x[i - 1]!));
    return m;
  };

  it('plays every channel together on the master bus', () => {
    const { blocks } = build();
    expect(blocks(1).L[5]).toBeCloseTo(0.75);
  });

  it('fades a switched-off channel out in about 20 ms, then stops rendering what only feeds it', () => {
    const { engine, made, blocks } = build();
    blocks(4);
    engine.setSinkActive('p2/out', false);
    const { L } = blocks(16); // 43 ms
    // A ramp, not a jump: no step larger than a 20 ms fade of 0.5 produces.
    expect(maxStep(L)).toBeLessThan((0.5 / (0.02 * SR)) * 1.01);
    expect(L[Math.round(0.021 * SR)]).toBeCloseTo(0.25, 5);
    const src = made.get('p2/src') as Src;
    const tick = made.get('p2/tick') as Ticker;
    const [srcCalls, tickCalls] = [src.calls, tick.calls];
    blocks(10);
    expect(src.calls).toBe(srcCalls); // asleep: no CPU
    expect(tick.calls).toBe(tickCalls + 10); // keeps time
  });

  it('fades a channel back in from a clean state', () => {
    const { engine, made, blocks } = build();
    blocks(2);
    engine.setSinkActive('p2/out', false);
    blocks(16);
    const src = made.get('p2/src') as Src;
    const resets = src.resets;
    engine.setSinkActive('p2/out', true);
    const { L } = blocks(16);
    expect(src.resets).toBe(resets + 1);
    expect(maxStep(L)).toBeLessThan((0.5 / (0.02 * SR)) * 1.01);
    expect(L[L.length - 1]).toBeCloseTo(0.75, 5);
  });

  it('never renders a channel that starts switched off', () => {
    const { made, blocks } = build(false);
    const { L } = blocks(4);
    expect(L[0]).toBeCloseTo(0.25);
    expect((made.get('p2/src') as Src).calls).toBe(0);
  });

  it('applies the master level with a fade', () => {
    const { engine, blocks } = build();
    blocks(2);
    engine.setMasterLevel(0.5);
    const { L } = blocks(16);
    expect(maxStep(L)).toBeLessThan(0.001);
    expect(L[L.length - 1]).toBeCloseTo(0.375, 5);
    engine.restart();
    expect(blocks(1).L[0]).toBeCloseTo(0.375, 5); // after Play: straight at the level
  });
});
