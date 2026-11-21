import {
  BLOCK_SIZE,
  isSink,
  type DspModule,
  type EngineClip,
  type EngineBlockStats,
  type DisplayLayoutEntry,
  type EnginePatch,
  type MeterLayoutEntry,
  type ModuleFactory,
  type RecordedAudio,
  type SinkModule,
} from './types';
import { Transport } from './Transport';
import { positionAt, segmentAt, type EngineLane } from './automation';
import { fromNormalized, quantize } from '../../ui/scale';

/** An automation lane bound to its node. */
interface AutoLane {
  lane: EngineLane;
  node: Node | undefined;
  /** Segment found in the previous block (search start). */
  hint: number;
  /** Value last applied (NaN: apply in the next block whatever it is). */
  last: number;
}

export interface MasterMeters {
  peakL: number;
  peakR: number;
  clipped: boolean;
  faulted: boolean;
}

/** Samples below this magnitude count as silence (about −140 dBFS). */
const SILENCE_THRESHOLD = 1e-7;

/** Hard ceiling on the master bus; the browser would clip at ±1 anyway. */
const MASTER_CEILING = 1;

/** Fade time for sinks going silent or coming back, and for master level changes. */
const FADE_SECONDS = 0.02;

/**
 * Master level smoothing, the same as the Channel's knob smoothing (Faust `si.polySmooth` with
 * pole 1 − 44.1/SR, about 23 ms): every sample moves a fixed share of the remaining distance, so
 * a fader that sends a new value many times a second still glides without corners. (A straight
 * ramp per message stops abruptly at each value; dragged, those corners crackle on pure tones.)
 */
const MASTER_SMOOTH_HZ = 44.1;
/** Closer than this to the target, the master level jumps there and smoothing stops. */
const MASTER_SNAP = 1e-5;

interface Source {
  node: Node;
  port: number;
}

interface InputSlot {
  sources: Source[];
  /** Summing buffer, only allocated for inputs with more than one cable. */
  mix: Float32Array | null;
}

interface Node {
  id: string;
  kind: string;
  module: DspModule;
  inputs: InputSlot[];
  outputs: Float32Array[];
  outputSilent: boolean[];
  /** Current input views handed to `process` (reused every block). */
  inputViews: Float32Array[];
  inputSilent: boolean[];
  /** Blocks in a row with every input silent. */
  silentInputBlocks: number;
  tailBlocks: number;
  asleep: boolean;
  isSink: boolean;
  /** Whether the module has processed at least one block (meters are meaningless before). */
  rendered: boolean;
  /** In the current processing order (reaches a sink that is heard, an observer or keeps time). */
  inOrder: boolean;
  /** Sinks: current and target level on the master bus (0 or 1), faded per sample. */
  sinkGain: number;
  sinkTarget: number;
  /** Sinks: faded out completely, so it and whatever only feeds it are not rendered. */
  dormant: boolean;
}

function isBufferSilent(buf: Float32Array, frames: number): boolean {
  for (let i = 0; i < frames; i++) {
    const v = buf[i]!;
    if (v > SILENCE_THRESHOLD || v < -SILENCE_THRESHOLD) return false;
  }
  return true;
}

/**
 * The patch engine: owns module instances, routes audio between them and renders blocks.
 *
 * CPU-saving rules:
 * - only nodes that (through cables) reach a sink are processed;
 * - a sink that is switched off (a muted mixer channel) fades out and then stops rendering,
 *   together with everything that only feeds it; modules that keep time keep running;
 * - a node whose inputs have been silent for longer than its tail is put to sleep;
 * - unconnected inputs share one silent buffer, single cables are passed without copying,
 *   and silent sources are left out of sums.
 *
 * Cycles are allowed: a cable that closes a loop reads the previous block of its source
 * (one block of delay), like in hardware-style modular systems.
 */
export class Engine {
  readonly sampleRate: number;
  /** Tempo and musical position, shared with modules that follow the tempo. */
  readonly transport: Transport;
  private readonly factories: Readonly<Record<string, ModuleFactory>>;
  private nodes = new Map<string, Node>();
  /** Processing order: only reachable nodes, dependencies first. */
  private order: Node[] = [];
  private sinks: { node: Node; module: SinkModule }[] = [];
  private meterNodes: Node[] = [];
  private meterLayoutCache: MeterLayoutEntry[] = [];
  private meterCount = 0;
  private displayNodes: Node[] = [];
  private displayLayoutCache: DisplayLayoutEntry[] = [];
  private displayCount = 0;
  private recorderNodes: Node[] = [];
  private lanes: AutoLane[] = [];
  private readonly zero = new Float32Array(BLOCK_SIZE);

  private readonly masterL = new Float32Array(BLOCK_SIZE);
  private readonly masterR = new Float32Array(BLOCK_SIZE);
  /** Master level (linear), faded per sample towards its target. */
  private masterGain = 1;
  private masterTarget = 1;
  /** Share of the remaining distance the master level moves per sample. */
  private readonly masterCoef: number;
  private readonly fadeStep: number;
  /** A sink went dormant or woke up: rebuild the processing order before the next block. */
  private orderDirty = false;

  /** Peak magnitude of the master bus since the last `takeMeters()`. */
  private peakL = 0;
  private peakR = 0;
  private clipped = false;
  /** Set when a module produced NaN/Infinity; the block was muted and state was reset. */
  private faulted = false;

  readonly stats: EngineBlockStats = { processed: 0, sleeping: 0, unreachable: 0 };

  constructor(sampleRate: number, factories: Readonly<Record<string, ModuleFactory>>) {
    this.sampleRate = sampleRate;
    this.transport = new Transport(sampleRate);
    this.factories = factories;
    this.fadeStep = 1 / (FADE_SECONDS * sampleRate);
    this.masterCoef = MASTER_SMOOTH_HZ / sampleRate;
  }

  // ---------- Patch management ----------

  /**
   * Replace the graph. Existing nodes with the same id and kind keep their instance (and thus
   * their state), so editing cables never interrupts running sound.
   */
  setPatch(patch: EnginePatch): void {
    const next = new Map<string, Node>();
    for (const desc of patch.nodes) {
      let node = this.nodes.get(desc.id);
      if (!node || node.kind !== desc.kind) {
        const factory = this.factories[desc.kind];
        if (!factory) throw new Error(`Unknown module kind "${desc.kind}"`);
        node = this.createNode(desc.id, desc.kind, factory(this.sampleRate, this.transport));
        // A new sink starts at its state without fading.
        if (node.isSink && desc.active === false) {
          node.sinkGain = node.sinkTarget = 0;
          node.dormant = true;
        }
      } else if (node.isSink && desc.active !== undefined) {
        this.applySinkActive(node, desc.active);
      }
      if (desc.params) {
        for (const [name, value] of Object.entries(desc.params)) node.module.setParam(name, value);
      }
      if (desc.clips) node.module.setClips?.(desc.clips);
      next.set(desc.id, node);
    }

    for (const [id, node] of this.nodes) {
      if (next.get(id) !== node) node.module.dispose?.();
    }
    this.nodes = next;

    for (const node of next.values()) {
      for (const slot of node.inputs) slot.sources = [];
    }
    for (const c of patch.connections) {
      const from = next.get(c.from.node);
      const to = next.get(c.to.node);
      if (!from || !to) continue;
      if (c.from.port < 0 || c.from.port >= from.outputs.length) continue;
      const slot = to.inputs[c.to.port];
      if (!slot) continue;
      if (slot.sources.some((s) => s.node === from && s.port === c.from.port)) continue;
      slot.sources.push({ node: from, port: c.from.port });
    }
    for (const node of next.values()) {
      for (const slot of node.inputs) {
        slot.mix = slot.sources.length > 1 ? (slot.mix ?? new Float32Array(BLOCK_SIZE)) : null;
      }
      node.module.onConnectionsChanged?.(node.inputs.map((slot) => slot.sources.length > 0));
    }

    this.rebuildOrder();

    this.meterNodes = [...next.values()].filter((n) => (n.module.meterNames?.length ?? 0) > 0);
    this.meterLayoutCache = this.meterNodes.map((n) => ({ node: n.id, names: n.module.meterNames! }));
    this.meterCount = this.meterLayoutCache.reduce((sum, e) => sum + e.names.length, 0);

    this.displayNodes = [...next.values()].filter((n) => (n.module.displayLength ?? 0) > 0);
    this.displayLayoutCache = this.displayNodes.map((n) => ({ node: n.id, length: n.module.displayLength! }));
    this.displayCount = this.displayLayoutCache.reduce((sum, e) => sum + e.length, 0);
    this.recorderNodes = [...next.values()].filter((n) => typeof n.module.takeRecorded === 'function');
    // The patch's own values were just applied: every lane applies its value again.
    for (const a of this.lanes) {
      a.node = next.get(a.lane.node);
      a.last = NaN;
    }
  }

  /**
   * Replace every automation lane. While rendering, each automated control is set to its lane's
   * value at the start of every block (about 3 ms); the modules smooth the steps.
   */
  setAutomation(lanes: readonly EngineLane[]): void {
    this.lanes = lanes
      .filter((l) => l.times.length > 0 && l.times.length === l.positions.length)
      .map((lane) => ({ lane, node: this.nodes.get(lane.node), hint: 0, last: NaN }));
  }

  private applyAutomation(): void {
    const beat = this.transport.beat;
    const lanes = this.lanes;
    for (let i = 0; i < lanes.length; i++) {
      const a = lanes[i]!;
      if (!a.node) continue;
      const l = a.lane;
      const hold = l.step > 0;
      a.hint = segmentAt(l.times, beat, a.hint);
      let v = fromNormalized(positionAt(l.times, l.positions, beat, a.hint, hold, l.curves), l.min, l.max, l.scale);
      if (hold) v = quantize(v, l.step, l.min);
      if (v !== a.last) {
        a.node.module.setParam(l.param, v);
        a.last = v;
      }
    }
  }

  /** Hand every recorder's new audio to `use` (nothing happens when nobody is recording). */
  collectRecordings(use: (node: string, audio: RecordedAudio) => void): void {
    for (let i = 0; i < this.recorderNodes.length; i++) {
      const node = this.recorderNodes[i]!;
      const audio = node.module.takeRecorded!();
      if (audio) use(node.id, audio);
    }
  }

  /** Displays of all modules, in snapshot order. Changes only when the patch changes. */
  get displayLayout(): readonly DisplayLayoutEntry[] {
    return this.displayLayoutCache;
  }

  /** Number of values in a display snapshot. */
  get displayValueCount(): number {
    return this.displayCount;
  }

  /** Fill `out` with every module's current display values (layout order). No allocation. */
  readDisplays(out: Float32Array): void {
    let offset = 0;
    for (let i = 0; i < this.displayNodes.length; i++) {
      const node = this.displayNodes[i]!;
      const count = node.module.displayLength!;
      if (offset + count > out.length) return;
      if (!node.rendered || !node.inOrder) out.fill(0, offset, offset + count);
      else node.module.readDisplay!(out, offset);
      offset += count;
    }
  }

  /** Meters of all modules, in snapshot order. Changes only when the patch changes. */
  get meterLayout(): readonly MeterLayoutEntry[] {
    return this.meterLayoutCache;
  }

  /** Number of values in a meter snapshot. */
  get meterValueCount(): number {
    return this.meterCount;
  }

  /** Fill `out` with every module's current meter values (layout order). No allocation. */
  readMeters(out: Float32Array): void {
    let offset = 0;
    for (let i = 0; i < this.meterNodes.length; i++) {
      const node = this.meterNodes[i]!;
      const count = node.module.meterNames!.length;
      if (offset + count > out.length) return;
      if (node.asleep || !node.rendered || !node.inOrder) out.fill(0, offset, offset + count);
      else node.module.readMeters!(out, offset);
      offset += count;
    }
  }

  setParam(nodeId: string, name: string, value: number): void {
    this.nodes.get(nodeId)?.module.setParam(name, value);
  }

  /** Replace a module's timeline blocks (sequencers). */
  setClips(nodeId: string, clips: readonly EngineClip[]): void {
    this.nodes.get(nodeId)?.module.setClips?.(clips);
  }

  /** Switch a sink on or off (mute/solo of a mixer channel), with a short fade. */
  setSinkActive(nodeId: string, active: boolean): void {
    const node = this.nodes.get(nodeId);
    if (node?.isSink) this.applySinkActive(node, active);
  }

  private applySinkActive(node: Node, active: boolean): void {
    node.sinkTarget = active ? 1 : 0;
    if (active && node.dormant) {
      node.dormant = false;
      node.sinkGain = 0; // fade in from silence
      this.orderDirty = true;
    }
  }

  /** Master level (linear gain, 1 = 0 dB), faded to avoid clicks. */
  setMasterLevel(gain: number): void {
    if (Number.isFinite(gain)) this.masterTarget = Math.max(0, gain);
  }

  /** Clear the state of every module (e.g. on stop, or after a fault). */
  resetAll(): void {
    for (const node of this.nodes.values()) {
      node.module.reset();
      for (const out of node.outputs) out.fill(0);
      node.outputSilent.fill(true);
      node.silentInputBlocks = 0;
      node.asleep = false;
      node.sinkGain = node.sinkTarget;
    }
    this.masterGain = this.masterTarget;
  }

  /**
   * Start playing (Play pressed): position to `beat` (the playhead) and every module cleared, so
   * sequences start on their first step and no tail from the previous run comes back.
   */
  restart(beat = 0): void {
    this.transport.rewind(beat);
    this.resetAll();
  }

  /** Move the position while playing (the playhead was moved); modules keep their state. */
  locate(beat: number): void {
    this.transport.rewind(beat);
  }

  setLoop(on: boolean, start: number, end: number): void {
    this.transport.setLoop(on, start, end);
  }

  setTempo(bpm: number): void {
    this.transport.setTempo(bpm);
  }

  get nodeCount(): number {
    return this.nodes.size;
  }

  private createNode(id: string, kind: string, module: DspModule): Node {
    const tail = module.tailSeconds;
    return {
      id,
      kind,
      module,
      inputs: Array.from({ length: module.numInputs }, () => ({ sources: [], mix: null })),
      outputs: Array.from({ length: module.numOutputs }, () => new Float32Array(BLOCK_SIZE)),
      outputSilent: Array.from({ length: module.numOutputs }, () => true),
      inputViews: Array.from({ length: module.numInputs }, () => this.zero),
      inputSilent: Array.from({ length: module.numInputs }, () => true),
      silentInputBlocks: 0,
      // Sources (no inputs) never sleep: silence on their inputs says nothing about their output.
      tailBlocks:
        module.numInputs > 0 && Number.isFinite(tail)
          ? Math.ceil((Math.max(0, tail) * this.sampleRate) / BLOCK_SIZE)
          : Infinity,
      asleep: false,
      isSink: isSink(module),
      rendered: false,
      inOrder: false,
      sinkGain: 1,
      sinkTarget: 1,
      dormant: false,
    };
  }

  /**
   * Depth-first walk from every sink that is heard (and every observer, such as a scope, and
   * every module that keeps time) back through its sources; post-order = processing order.
   * Nodes that join the order start from a clean state, so a channel that comes back does not
   * replay an old reverb tail.
   */
  private rebuildOrder(): void {
    const order: Node[] = [];
    const done = new Set<Node>();
    const onStack = new Set<Node>();

    const visit = (node: Node) => {
      if (done.has(node) || onStack.has(node)) return; // on stack = feedback edge
      onStack.add(node);
      for (const slot of node.inputs) for (const s of slot.sources) visit(s.node);
      onStack.delete(node);
      done.add(node);
      order.push(node);
    };

    this.orderDirty = false;
    this.sinks = [];
    for (const node of this.nodes.values()) {
      if (isSink(node.module) && !node.dormant) {
        this.sinks.push({ node, module: node.module });
        visit(node);
      }
    }
    for (const node of this.nodes.values()) {
      if (node.module.isObserver || node.module.keepsTime) visit(node);
    }

    for (const node of this.nodes.values()) {
      const included = done.has(node);
      if (included && !node.inOrder && node.rendered) {
        // Back after a pause: start clean.
        node.module.reset();
        node.silentInputBlocks = 0;
        node.asleep = false;
      }
      if (!included && node.inOrder) {
        // Nodes that no longer reach a sink stop rendering: silence their outputs once so that
        // feedback cables reading from them get zeros.
        for (const out of node.outputs) out.fill(0);
        node.outputSilent.fill(true);
      }
      node.inOrder = included;
    }
    this.order = order;
  }

  // ---------- Rendering ----------

  /**
   * Render `frames` (≤ BLOCK_SIZE) into the given channel buffers, starting at `offset`.
   */
  renderBlock(outL: Float32Array, outR: Float32Array, frames: number, offset = 0): void {
    const n = Math.min(frames, BLOCK_SIZE);
    let processed = 0;
    let sleeping = 0;
    if (this.orderDirty) this.rebuildOrder();
    this.transport.beginBlock();
    if (this.lanes.length > 0) this.applyAutomation();

    // Hot path: indexed loops only. for-of creates iterator objects, and any garbage on the
    // audio thread eventually triggers a collection that stalls rendering (audible clicks).
    const order = this.order;
    for (let ni = 0; ni < order.length; ni++) {
      const node = order[ni]!;
      // Gather inputs.
      let allSilent = true;
      for (let i = 0; i < node.inputs.length; i++) {
        const slot = node.inputs[i]!;
        const count = slot.sources.length;
        if (count === 0) {
          node.inputViews[i] = this.zero;
          node.inputSilent[i] = true;
        } else if (count === 1) {
          const s = slot.sources[0]!;
          node.inputViews[i] = s.node.outputs[s.port]!;
          node.inputSilent[i] = s.node.outputSilent[s.port]!;
        } else {
          const mix = slot.mix!;
          let silent = true;
          for (let si = 0; si < count; si++) {
            const s = slot.sources[si]!;
            if (s.node.outputSilent[s.port]) continue;
            const src = s.node.outputs[s.port]!;
            if (silent) mix.set(src);
            else for (let k = 0; k < n; k++) mix[k]! += src[k]!;
            silent = false;
          }
          if (silent) mix.fill(0);
          node.inputViews[i] = mix;
          node.inputSilent[i] = silent;
        }
        if (!node.inputSilent[i]) allSilent = false;
      }

      // Sleep: inputs silent for longer than the module's tail, and its output has died out.
      node.silentInputBlocks = allSilent ? node.silentInputBlocks + 1 : 0;
      let outputsSilent = true;
      for (let o = 0; o < node.outputSilent.length; o++) {
        if (!node.outputSilent[o]) {
          outputsSilent = false;
          break;
        }
      }
      if (node.silentInputBlocks > node.tailBlocks && outputsSilent && !node.isSink) {
        if (!node.asleep) {
          for (let o = 0; o < node.outputs.length; o++) node.outputs[o]!.fill(0);
          node.asleep = true;
        }
        sleeping++;
        continue;
      }
      node.asleep = false;

      node.module.process(node.inputViews, node.inputSilent, node.outputs, n);
      node.rendered = true;
      for (let o = 0; o < node.outputs.length; o++) {
        node.outputSilent[o] = isBufferSilent(node.outputs[o]!, n);
      }
      processed++;
    }

    // Master bus: sum all sinks, fading those that are switched on or off.
    const L = this.masterL;
    const R = this.masterR;
    L.fill(0, 0, n);
    R.fill(0, 0, n);
    const step = this.fadeStep;
    for (let k = 0; k < this.sinks.length; k++) {
      const sink = this.sinks[k]!;
      const sl = sink.module.outL;
      const sr = sink.module.outR;
      const node = sink.node;
      let g = node.sinkGain;
      const target = node.sinkTarget;
      if (g === target) {
        if (g === 0) {
          // Faded out: stop rendering it (and what only feeds it) from the next block.
          node.dormant = true;
          this.orderDirty = true;
          continue;
        }
        for (let i = 0; i < n; i++) {
          L[i]! += sl[i]!;
          R[i]! += sr[i]!;
        }
      } else {
        for (let i = 0; i < n; i++) {
          g = g < target ? Math.min(target, g + step) : Math.max(target, g - step);
          L[i]! += sl[i]! * g;
          R[i]! += sr[i]! * g;
        }
        node.sinkGain = g;
      }
    }

    // Master level.
    let mg = this.masterGain;
    const mt = this.masterTarget;
    if (mg !== mt) {
      const k = this.masterCoef;
      for (let i = 0; i < n; i++) {
        mg += (mt - mg) * k;
        L[i]! *= mg;
        R[i]! *= mg;
      }
      if (Math.abs(mt - mg) < MASTER_SNAP) mg = mt;
      this.masterGain = mg;
    } else if (mg !== 1) {
      for (let i = 0; i < n; i++) {
        L[i]! *= mg;
        R[i]! *= mg;
      }
    }

    // Safety: a NaN or Infinity anywhere would poison every following block. Mute and reset.
    let finite = true;
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(L[i]!) || !Number.isFinite(R[i]!)) {
        finite = false;
        break;
      }
    }
    if (!finite) {
      this.faulted = true;
      L.fill(0, 0, n);
      R.fill(0, 0, n);
      this.resetAll();
    }

    let pl = this.peakL;
    let pr = this.peakR;
    for (let i = 0; i < n; i++) {
      let l = L[i]!;
      let r = R[i]!;
      const al = l < 0 ? -l : l;
      const ar = r < 0 ? -r : r;
      if (al > pl) pl = al;
      if (ar > pr) pr = ar;
      if (al > MASTER_CEILING) {
        l = l < 0 ? -MASTER_CEILING : MASTER_CEILING;
        this.clipped = true;
      }
      if (ar > MASTER_CEILING) {
        r = r < 0 ? -MASTER_CEILING : MASTER_CEILING;
        this.clipped = true;
      }
      outL[offset + i] = l;
      outR[offset + i] = r;
    }
    this.peakL = pl;
    this.peakR = pr;

    this.transport.endBlock(n);
    this.stats.processed = processed;
    this.stats.sleeping = sleeping;
    this.stats.unreachable = this.nodes.size - this.order.length;
  }

  /** Render any number of frames by looping over blocks. */
  render(outL: Float32Array, outR: Float32Array, frames: number, offset = 0): void {
    let done = 0;
    while (done < frames) {
      const n = Math.min(BLOCK_SIZE, frames - done);
      this.renderBlock(outL, outR, n, offset + done);
      done += n;
    }
  }

  /**
   * Read and reset the master meters (peaks are pre-ceiling, so overs are visible).
   * Writes into `into` when given, so the audio thread can reuse one object (no garbage).
   */
  takeMeters(into: MasterMeters = { peakL: 0, peakR: 0, clipped: false, faulted: false }): MasterMeters {
    into.peakL = this.peakL;
    into.peakR = this.peakR;
    into.clipped = this.clipped;
    into.faulted = this.faulted;
    this.peakL = 0;
    this.peakR = 0;
    this.clipped = false;
    this.faulted = false;
    return into;
  }
}
