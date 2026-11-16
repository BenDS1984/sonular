import { BLOCK_SIZE, type DspModule } from '../core/types';

/** Subset of the metadata JSON the Faust compiler writes next to each .wasm file. */
export interface FaustMeta {
  name: string;
  /** Bytes of wasm memory used by the DSP state (starts at address 0). */
  size: number;
  inputs: number;
  outputs: number;
  meta?: Record<string, string>[];
  ui: FaustUiItem[];
}

export interface FaustUiItem {
  type: string;
  label: string;
  shortname?: string;
  index?: number;
  init?: number;
  min?: number;
  max?: number;
  items?: FaustUiItem[];
}

export interface FaustParam {
  index: number;
  min: number;
  max: number;
  init: number;
}

interface FaustExports {
  memory: WebAssembly.Memory;
  getNumInputs(dsp: number): number;
  getNumOutputs(dsp: number): number;
  init(dsp: number, sampleRate: number): void;
  instanceClear(dsp: number): void;
  setParamValue(dsp: number, index: number, value: number): void;
  getParamValue(dsp: number, index: number): number;
  compute(dsp: number, count: number, inputs: number, outputs: number): void;
}

const copysign = (x: number, y: number) => (Math.sign(y) < 0 || Object.is(y, -0) ? -Math.abs(x) : Math.abs(x));
const remainder = (x: number, y: number) => x - Math.round(x / y) * y;

/** Math functions Faust-generated wasm may import (float and double flavours share JS versions). */
const MATH_IMPORTS: Record<string, (...args: number[]) => number> = {
  _abs: Math.abs,
  _acos: Math.acos,
  _acosh: Math.acosh,
  _asin: Math.asin,
  _asinh: Math.asinh,
  _atan: Math.atan,
  _atan2: Math.atan2,
  _atanh: Math.atanh,
  _ceil: Math.ceil,
  _copysign: copysign,
  _cos: Math.cos,
  _cosh: Math.cosh,
  _exp: Math.exp,
  _floor: Math.floor,
  _fmod: (x, y) => x % y,
  _isinf: (x) => (Number.isFinite(x) || Number.isNaN(x) ? 0 : 1),
  _isnan: (x) => (Number.isNaN(x) ? 1 : 0),
  _log: Math.log,
  _log10: Math.log10,
  _max_: Math.max,
  _min_: Math.min,
  _pow: Math.pow,
  _remainder: remainder,
  _rint: (x) => {
    // Round half to even, like C rint() in the default rounding mode.
    const r = Math.round(x);
    return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
  },
  _round: (x) => Math.sign(x) * Math.round(Math.abs(x)),
  _sin: Math.sin,
  _sinh: Math.sinh,
  _sqrt: Math.sqrt,
  _tan: Math.tan,
  _tanh: Math.tanh,
};

/** Resolve a wasm import name such as `_sinf`, `_max_f` or `_powf` to a JS function. */
function resolveMathImport(name: string): ((...args: number[]) => number) | undefined {
  return MATH_IMPORTS[name] ?? (name.endsWith('f') ? MATH_IMPORTS[name.slice(0, -1)] : undefined);
}

function buildImports(module: WebAssembly.Module): WebAssembly.Imports {
  const env: Record<string, WebAssembly.ImportValue> = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module !== 'env' || imp.kind !== 'function') continue;
    const fn = resolveMathImport(imp.name);
    if (!fn) throw new Error(`Faust module needs unsupported import "${imp.name}"`);
    env[imp.name] = fn;
  }
  return { env };
}

const isMeter = (item: FaustUiItem) => item.type === 'vbargraph' || item.type === 'hbargraph';

/** Collect sliders, knobs and buttons by their short name. */
export function collectParams(meta: FaustMeta): Map<string, FaustParam> {
  const params = new Map<string, FaustParam>();
  const walk = (items: FaustUiItem[]) => {
    for (const item of items) {
      if (item.items) walk(item.items);
      else if (item.index !== undefined && !isMeter(item)) {
        params.set(item.shortname ?? item.label, {
          index: item.index,
          min: item.min ?? 0,
          max: item.max ?? 1,
          init: item.init ?? 0,
        });
      }
    }
  };
  walk(meta.ui);
  return params;
}

/** Bargraphs (meters) by short name, with their memory index. */
export function collectMeters(meta: FaustMeta): { name: string; index: number }[] {
  const meters: { name: string; index: number }[] = [];
  const walk = (items: FaustUiItem[]) => {
    for (const item of items) {
      if (item.items) walk(item.items);
      else if (item.index !== undefined && isMeter(item)) {
        meters.push({ name: item.shortname ?? item.label, index: item.index });
      }
    }
  };
  walk(meta.ui);
  return meters;
}

/** Whether the program declares itself an audio sink (`declare sink "1";`). */
export function declaredSink(meta: FaustMeta): boolean {
  return (meta.meta ?? []).some((entry) => entry['sink'] === '1');
}

/**
 * Tail length from `declare tail "<seconds>";` in the .dsp source.
 * Without a declaration, generators (no inputs) never sleep and processors are treated as
 * stateless only if they explicitly say so — so the safe default is Infinity.
 */
export function declaredTail(meta: FaustMeta): number {
  for (const entry of meta.meta ?? []) {
    const value = entry['tail'];
    if (value !== undefined) {
      const t = Number(value);
      return Number.isFinite(t) && t >= 0 ? t : Infinity;
    }
  }
  return Infinity;
}

const align16 = (n: number) => (n + 15) & ~15;
const WASM_PAGE = 65536;

/**
 * Runs one compiled Faust program as an engine module.
 *
 * Memory layout inside the instance's own linear memory:
 *   [0, size)            Faust DSP state
 *   inputPtrs            int32[numInputs]  -> addresses of input buffers
 *   outputPtrs           int32[numOutputs] -> addresses of output buffers
 *   buffers              float32[BLOCK_SIZE] per channel
 */
export class FaustDsp implements DspModule {
  readonly numInputs: number;
  readonly numOutputs: number;
  readonly tailSeconds: number;

  private readonly exports: FaustExports;
  private readonly params: Map<string, FaustParam>;
  readonly meterNames: readonly string[];
  private readonly meterIndexes: Int32Array;
  private readonly inputPtrs: number;
  private readonly outputPtrs: number;
  private readonly inBufs: Float32Array[];
  private readonly outBufs: Float32Array[];
  /** Whether each wasm input buffer is known to contain only zeros (skips redundant clears). */
  private readonly inZeroed: boolean[];

  constructor(module: WebAssembly.Module, meta: FaustMeta, sampleRate: number) {
    const instance = new WebAssembly.Instance(module, buildImports(module));
    this.exports = instance.exports as unknown as FaustExports;
    // Guard against metadata from a different build than the code (parameter addresses would be wrong).
    if (this.exports.getNumInputs(0) !== meta.inputs || this.exports.getNumOutputs(0) !== meta.outputs) {
      throw new Error(`Faust program "${meta.name}": metadata does not match its WebAssembly code`);
    }
    this.numInputs = meta.inputs;
    this.numOutputs = meta.outputs;
    this.tailSeconds = declaredTail(meta);
    this.params = collectParams(meta);
    const meters = collectMeters(meta);
    this.meterNames = meters.map((m) => m.name);
    this.meterIndexes = Int32Array.from(meters, (m) => m.index);

    const channels = this.numInputs + this.numOutputs;
    this.inputPtrs = align16(meta.size);
    this.outputPtrs = this.inputPtrs + 4 * this.numInputs;
    const bufStart = align16(this.outputPtrs + 4 * this.numOutputs);
    const needed = bufStart + channels * BLOCK_SIZE * 4;

    const memory = this.exports.memory;
    if (memory.buffer.byteLength < needed) {
      memory.grow(Math.ceil((needed - memory.buffer.byteLength) / WASM_PAGE));
    }

    // Views must be created after growing: growing detaches the old ArrayBuffer.
    const heap = memory.buffer;
    const ptrs = new Int32Array(heap, this.inputPtrs, channels);
    this.inBufs = [];
    this.outBufs = [];
    for (let c = 0; c < channels; c++) {
      const addr = bufStart + c * BLOCK_SIZE * 4;
      ptrs[c] = addr;
      (c < this.numInputs ? this.inBufs : this.outBufs).push(new Float32Array(heap, addr, BLOCK_SIZE));
    }
    // The compiler stores its JSON description in memory from address 0 onward, which overlaps
    // the buffer area. Clear the buffers so silent inputs really start out as silence.
    for (const buf of this.inBufs) buf.fill(0);
    for (const buf of this.outBufs) buf.fill(0);
    this.inZeroed = this.inBufs.map(() => true);

    this.exports.init(0, sampleRate);
    this.clearMeters();
  }

  /** Meter (bargraph) values are only written by compute(); until then they hold leftover bytes. */
  private clearMeters() {
    for (let i = 0; i < this.meterIndexes.length; i++) this.exports.setParamValue(0, this.meterIndexes[i]!, 0);
  }

  /** Names of the parameters this module accepts. */
  get paramNames(): string[] {
    return [...this.params.keys()];
  }

  setParam(name: string, value: number): void {
    const p = this.params.get(name);
    if (!p || !Number.isFinite(value)) return;
    this.exports.setParamValue(0, p.index, Math.min(p.max, Math.max(p.min, value)));
  }

  readMeters(out: Float32Array, offset: number): void {
    for (let i = 0; i < this.meterIndexes.length; i++) {
      out[offset + i] = this.exports.getParamValue(0, this.meterIndexes[i]!);
    }
  }

  getParam(name: string): number | undefined {
    const p = this.params.get(name);
    return p ? this.exports.getParamValue(0, p.index) : undefined;
  }

  process(
    inputs: readonly Float32Array[],
    inputSilent: readonly boolean[],
    outputs: readonly Float32Array[],
    frames: number,
  ): void {
    for (let i = 0; i < this.numInputs; i++) {
      const dst = this.inBufs[i]!;
      if (inputSilent[i]) {
        if (!this.inZeroed[i]) {
          dst.fill(0);
          this.inZeroed[i] = true;
        }
      } else {
        const src = inputs[i]!;
        if (frames === BLOCK_SIZE) dst.set(src);
        else for (let k = 0; k < frames; k++) dst[k] = src[k]!;
        this.inZeroed[i] = false;
      }
    }
    this.exports.compute(0, frames, this.inputPtrs, this.outputPtrs);
    for (let o = 0; o < this.numOutputs; o++) {
      const src = this.outBufs[o]!;
      const dst = outputs[o]!;
      if (frames === BLOCK_SIZE) dst.set(src);
      else for (let k = 0; k < frames; k++) dst[k] = src[k]!;
    }
  }

  reset(): void {
    this.exports.instanceClear(0);
    this.clearMeters();
  }
}
