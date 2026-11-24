/**
 * Tests for the spectrum analyser: pass-through, where a tone shows and how loud, silence, how the
 * bars fall and the peaks hold, the two axes, and extreme settings. Everything renders offline;
 * nothing is played.
 */
import { describe, expect, it } from "vitest";
import { Engine } from "../core/Engine";
import { BLOCK_SIZE } from "../core/types";
import { Spectrum, SPECTRUM_BANDS, SPECTRUM_FLOOR_DB } from "./Spectrum";

const SR = 48000;
const B = SPECTRUM_BANDS;

/** Feed `seconds` of input, block by block; returns the outputs. `silent` tells the flags. */
function feed(
  s: Spectrum,
  seconds: number,
  input: (c: number, i: number) => number,
  from = 0,
  silent = false,
): Float32Array[] {
  const total = Math.round(seconds * SR);
  const outs = [new Float32Array(total), new Float32Array(total)];
  const ins = [new Float32Array(BLOCK_SIZE), new Float32Array(BLOCK_SIZE)];
  const blockOuts = [
    new Float32Array(BLOCK_SIZE),
    new Float32Array(BLOCK_SIZE),
  ];
  for (let start = 0; start < total; start += BLOCK_SIZE) {
    const n = Math.min(BLOCK_SIZE, total - start);
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < n; i++) ins[c]![i] = input(c, from + start + i);
    s.process(ins, [silent, silent], blockOuts, n);
    for (let c = 0; c < 2; c++)
      outs[c]!.set(blockOuts[c]!.subarray(0, n), start);
  }
  return outs;
}

const levels = (s: Spectrum) => {
  const out = new Float32Array(s.displayLength);
  s.readDisplay(out, 0);
  return {
    level: Array.from(out.subarray(0, B)),
    peak: Array.from(out.subarray(B)),
  };
};

const sine =
  (hz: number, amp = 1) =>
  (_c: number, i: number) =>
    amp * Math.sin((2 * Math.PI * hz * i) / SR);

function make(
  params: Record<string, number> = {},
  connected: boolean[] = [true, true],
): Spectrum {
  const s = new Spectrum(SR);
  s.onConnectionsChanged(connected);
  for (const [k, v] of Object.entries(params)) s.setParam(k, v);
  return s;
}

const argmax = (v: number[]) => v.indexOf(Math.max(...v));
/** The column a frequency falls in on the logarithmic axis (20 Hz .. 20 kHz). */
const logColumn = (hz: number) =>
  (B * Math.log(hz / 20)) / Math.log(20000 / 20);
const linColumn = (hz: number) => (B * hz) / 20000;

describe("Spectrum", () => {
  it("passes both signals through unchanged", () => {
    const s = make();
    const [l, r] = feed(s, 0.2, (c, i) =>
      c === 0 ? sine(440)(0, i) : 0.3 * sine(97)(0, i),
    );
    for (const i of [0, 100, 5000, 9000]) {
      expect(l![i]).toBeCloseTo(sine(440)(0, i), 6);
      expect(r![i]).toBeCloseTo(0.3 * sine(97)(0, i), 6);
    }
  });

  it("shows a 1 kHz tone at the right place and at its level (0 dB for a full-scale sine)", () => {
    const s = make({ decay: 0 }); // quick bars: nothing lingers from the moment the tone started
    feed(s, 0.5, sine(1000));
    const { level } = levels(s);
    expect(Math.abs(argmax(level) - logColumn(1000))).toBeLessThanOrEqual(2);
    expect(Math.max(...level)).toBeGreaterThan(-2);
    expect(Math.max(...level)).toBeLessThan(0.5);
    // Far from the tone the picture is quiet.
    expect(level[10]!).toBeLessThan(-90);
    expect(level[B - 10]!).toBeLessThan(-90);
  });

  it("measures level: a sine of 0.1 shows about -20 dB, whatever its frequency", () => {
    for (const hz of [100, 440, 3000, 12000]) {
      const s = make();
      feed(s, 0.3, sine(hz, 0.1));
      const top = Math.max(...levels(s).level);
      expect(top, `${hz} Hz`).toBeGreaterThan(-23);
      expect(top, `${hz} Hz`).toBeLessThan(-19.5);
    }
  });

  it("follows the tone along the axis as the frequency changes", () => {
    const cols = [100, 400, 1600, 6400].map((hz) => {
      const s = make();
      feed(s, 0.3, sine(hz));
      return argmax(levels(s).level);
    });
    expect(cols).toEqual([...cols].sort((a, b) => a - b));
    [100, 400, 1600, 6400].forEach((hz, i) =>
      expect(Math.abs(cols[i]! - logColumn(hz))).toBeLessThanOrEqual(3),
    );
  });

  it("counts one connected channel fully and two equal channels alike", () => {
    const one = make({}, [true, false]);
    feed(one, 0.3, (c, i) => (c === 0 ? sine(1000)(0, i) : 0));
    const both = make({}, [true, true]);
    feed(both, 0.3, sine(1000));
    expect(Math.max(...levels(one).level)).toBeCloseTo(
      Math.max(...levels(both).level),
      0,
    );
    expect(Math.max(...levels(one).level)).toBeGreaterThan(-2);
  });

  it("shows silence as the floor, without NaN", () => {
    const s = make();
    feed(s, 0.3, () => 0);
    const { level, peak } = levels(s);
    for (const v of [...level, ...peak]) expect(v).toBe(SPECTRUM_FLOOR_DB);
  });

  it("lets the bars fall back at the Decay speed: fast clears quickly, slow lingers", () => {
    const run = (decay: number) => {
      const s = make({ decay });
      feed(s, 0.3, sine(1000));
      feed(s, 0.5, () => 0, 0, true);
      return Math.max(...levels(s).level);
    };
    expect(run(0)).toBeLessThan(-100);
    const slow = run(1);
    expect(slow).toBeGreaterThan(-12);
    expect(slow).toBeLessThan(0);
  });

  it("holds peaks when asked, then lets them fall", () => {
    const s = make({ peak: 1, decay: 0 });
    feed(s, 0.3, sine(1000));
    feed(s, 0.5, () => 0, 0, true);
    const held = levels(s);
    expect(Math.max(...held.level)).toBeLessThan(-100); // the bars are gone
    expect(Math.max(...held.peak)).toBeGreaterThan(-3); // the peak line is still there
    feed(s, 4, () => 0, 0, true);
    expect(Math.max(...levels(s).peak)).toBeLessThan(-60);
    // Off: no peak line at all.
    const off = make({ peak: 0 });
    feed(off, 0.3, sine(1000));
    expect(Math.max(...levels(off).peak)).toBe(SPECTRUM_FLOOR_DB);
  });

  it("can use a linear axis", () => {
    const s = make({ scale: 1 });
    feed(s, 0.3, sine(10000));
    expect(
      Math.abs(argmax(levels(s).level) - linColumn(10000)),
    ).toBeLessThanOrEqual(2);
    const lg = make({ scale: 0 });
    feed(lg, 0.3, sine(10000));
    expect(
      Math.abs(argmax(levels(lg).level) - logColumn(10000)),
    ).toBeLessThanOrEqual(2);
  });

  it("stays finite with loud noise, silence flags on and off, and every knob thrown around", () => {
    const s = make();
    let seed = 1;
    const noise = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed / 2147483647) * 2 - 1;
    };
    for (let round = 0; round < 8; round++) {
      s.setParam("decay", round % 2);
      s.setParam("peak", round % 3 === 0 ? 1 : 0);
      s.setParam("scale", round % 2);
      feed(s, 0.1, () => 4 * noise(), 0, round === 5);
    }
    const { level, peak } = levels(s);
    for (const v of [...level, ...peak]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(SPECTRUM_FLOOR_DB);
    }
  });

  it("forgets everything on reset", () => {
    const s = make({ peak: 1 });
    feed(s, 0.3, sine(1000));
    s.reset();
    const { level, peak } = levels(s);
    expect(Math.max(...level, ...peak)).toBe(SPECTRUM_FLOOR_DB);
  });

  it("is rendered by the engine even when its outputs lead nowhere", () => {
    const engine = new Engine(SR, {
      osc: () => {
        let n = 0;
        return {
          numInputs: 0,
          numOutputs: 1,
          tailSeconds: Infinity,
          setParam() {},
          process(_i, _s, outs, frames) {
            for (let i = 0; i < frames; i++)
              outs[0]![i] = 0.5 * Math.sin((2 * Math.PI * 1000 * n++) / SR);
          },
          reset() {},
        };
      },
      spectrum: (sr) => new Spectrum(sr),
    });
    engine.setPatch({
      nodes: [
        { id: "src", kind: "osc" },
        { id: "sp", kind: "spectrum" },
      ],
      connections: [
        { from: { node: "src", port: 0 }, to: { node: "sp", port: 0 } },
      ],
    });
    expect(engine.displayLayout).toEqual([{ node: "sp", length: 2 * B }]);
    const frames = Math.round(0.3 * SR);
    engine.render(new Float32Array(frames), new Float32Array(frames), frames);
    const out = new Float32Array(engine.displayValueCount);
    engine.readDisplays(out);
    const level = Array.from(out.subarray(0, B));
    expect(Math.abs(argmax(level) - logColumn(1000))).toBeLessThanOrEqual(2);
    // Only the left input is connected: a sine of 0.5 shows about -6 dB.
    expect(Math.max(...level)).toBeGreaterThan(-8);
    expect(Math.max(...level)).toBeLessThan(-5);
  });
});
