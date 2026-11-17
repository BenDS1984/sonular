import type { DspModule } from '../core/types';

/** Horizontal resolution of a trace: each column holds the lowest and highest value in its slice. */
export const SCOPE_COLUMNS = 160;

/** Auto trigger: when no trigger comes within this time, draw anyway (so flat lines show too). */
const AUTO_TIMEOUT_SECONDS = 0.1;

/**
 * Windows at least this long are shown while they are being drawn (a sweep from left to right,
 * like an analog scope), instead of only after they are complete.
 */
export const SWEEP_SECONDS = 0.05;

/** Hysteresis of the trigger, as a share of the signal's range: noise never re-triggers. */
const TRIGGER_HYSTERESIS = 0.1;

/** Below this range (peak to peak) a signal counts as flat: nothing to trigger on. */
const MIN_TRIGGER_RANGE = 1e-3;

/**
 * Two-channel oscilloscope. Records what passes through it and offers it as a display; the
 * signals leave unchanged through the outputs, so it can sit between two modules.
 *
 * Inputs:  0 A, 1 B.   Outputs: 0 A, 1 B (copies of the inputs).
 *
 * Parameters:
 * - "time": seconds across the screen;
 * - "trigger": 0 = Auto (a repeating wave stands still), 1 = Free (the picture runs freely).
 * The "scale" parameter only affects drawing and is handled by the panel.
 *
 * Display: `SCOPE_COLUMNS` minimum values of A, then the maxima of A, then the same for B.
 *
 * The auto trigger fires when the signal rises through the middle of its own range (measured
 * over the previous picture), so it works for audio around zero as well as for envelopes (0..1)
 * and gates. It listens to A, or to B when only B is connected.
 *
 * Observer: the engine processes it even when its outputs lead nowhere, so a scope patched
 * only with inputs still shows its signals. It never sleeps, so a signal that stops is shown
 * as a flat line instead of a frozen picture.
 */
export class Scope implements DspModule {
  readonly numInputs = 2;
  readonly numOutputs = 2;
  readonly tailSeconds = Infinity;
  readonly isObserver = true;
  readonly displayLength = 4 * SCOPE_COLUMNS;

  private readonly sampleRate: number;
  private samplesPerColumn = 1;
  private sweep = false;
  private autoTrigger = true;
  private readonly timeoutSamples: number;
  /** Input the trigger listens to. */
  private triggerInput = 0;

  /** Picture being recorded, and the last complete one (layout as the display). */
  private readonly recording = new Float32Array(4 * SCOPE_COLUMNS);
  private readonly shown = new Float32Array(4 * SCOPE_COLUMNS);

  private capturing = false;
  /** Time since the picture started, in samples (fractional when it started on a trigger). */
  private pos = 0;
  /** Column being filled. */
  private col = 0;
  private minA = Infinity;
  private maxA = -Infinity;
  private minB = Infinity;
  private maxB = -Infinity;
  /** Previous samples: for drawing between samples, and for finding the exact trigger moment. */
  private prevA = 0;
  private prevB = 0;
  private prevT = 0;

  private armed = false;
  private waited = 0;
  private triggerLevel = 0;
  private triggerHysteresis = 0;
  private canTrigger = false;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.timeoutSamples = Math.round(AUTO_TIMEOUT_SECONDS * sampleRate);
    this.setParam('time', 0.02);
  }

  setParam(name: string, value: number): void {
    switch (name) {
      case 'time': {
        const seconds = Math.max(1e-4, value);
        const spc = (seconds * this.sampleRate) / SCOPE_COLUMNS;
        if (spc === this.samplesPerColumn) return;
        // Turning the knob never throws the picture away: drawing carries on from the current
        // column at the new speed.
        if (this.capturing) this.pos = this.col * spc;
        this.samplesPerColumn = spc;
        const sweep = seconds >= SWEEP_SECONDS;
        // Leaving sweep mode: the picture drawn so far stays on screen until the next one is done.
        if (this.sweep && !sweep) this.shown.set(this.recording);
        this.sweep = sweep;
        break;
      }
      case 'trigger':
        this.autoTrigger = Math.round(value) === 0;
        break;
    }
  }

  onConnectionsChanged(connected: readonly boolean[]): void {
    this.triggerInput = !connected[0] && connected[1] ? 1 : 0;
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], outputs: readonly Float32Array[], frames: number): void {
    const a = inputs[0]!;
    const b = inputs[1]!;
    outputs[0]!.set(a.subarray(0, frames));
    outputs[1]!.set(b.subarray(0, frames));
    const trig = this.triggerInput === 0 ? a : b;

    for (let i = 0; i < frames; i++) {
      const xa = a[i]!;
      const xb = b[i]!;
      const xt = trig[i]!;
      let go = this.capturing;
      if (!go) {
        const startPos = this.startPosition(xt);
        if (startPos >= 0) {
          this.startCapture(startPos);
          go = true;
        }
      }
      if (go) this.record(xa, xb);
      this.prevA = xa;
      this.prevB = xb;
      this.prevT = xt;
    }
  }

  /**
   * While waiting: whether the next picture starts at this sample. Returns -1 to keep waiting,
   * otherwise how long ago (in samples, 0..1) the signal crossed the trigger level. Starting the
   * picture exactly at the crossing, between two samples, keeps short windows from jittering.
   */
  private startPosition(x: number): number {
    // Nothing to trigger on (a flat signal, or no picture yet): run freely.
    if (!this.autoTrigger || !this.canTrigger) return 0;
    const level = this.triggerLevel;
    if (x < level - this.triggerHysteresis) this.armed = true;
    else if (this.armed && x >= level) return (x - level) / (x - this.prevT);
    return ++this.waited >= this.timeoutSamples ? 0 : -1;
  }

  private startCapture(startPos: number): void {
    this.capturing = true;
    this.armed = false;
    this.waited = 0;
    this.pos = startPos;
    this.col = 0;
    this.minA = this.minB = Infinity;
    this.maxA = this.maxB = -Infinity;
  }

  private record(xa: number, xb: number): void {
    const spc = this.samplesPerColumn;
    const rec = this.recording;
    const C = SCOPE_COLUMNS;
    if (spc >= 1) {
      // Several samples per column: keep the lowest and highest.
      if (xa < this.minA) this.minA = xa;
      if (xa > this.maxA) this.maxA = xa;
      if (xb < this.minB) this.minB = xb;
      if (xb > this.maxB) this.maxB = xb;
      this.pos++;
      if (this.pos >= (this.col + 1) * spc) {
        const c = this.col;
        rec[c] = this.minA;
        rec[C + c] = this.maxA;
        rec[2 * C + c] = this.minB;
        rec[3 * C + c] = this.maxB;
        this.minA = this.minB = Infinity;
        this.maxA = this.maxB = -Infinity;
        this.col++;
      }
    } else {
      // Columns shorter than a sample: draw straight lines between samples.
      const pos = this.pos;
      while (this.col < C && this.col * spc <= pos) {
        const frac = this.col * spc - (pos - 1);
        const va = this.prevA + (xa - this.prevA) * frac;
        const vb = this.prevB + (xb - this.prevB) * frac;
        const c = this.col;
        rec[c] = rec[C + c] = va;
        rec[2 * C + c] = rec[3 * C + c] = vb;
        this.col++;
      }
      this.pos++;
    }
    if (this.col >= C) this.finishCapture();
  }

  private finishCapture(): void {
    this.capturing = false;
    if (!this.sweep) this.shown.set(this.recording);
    // Next trigger level: the middle of this picture's range on the trigger input.
    const C = SCOPE_COLUMNS;
    const base = this.triggerInput === 0 ? 0 : 2 * C;
    let lo = Infinity;
    let hi = -Infinity;
    for (let c = 0; c < C; c++) {
      const l = this.recording[base + c]!;
      const h = this.recording[base + C + c]!;
      if (l < lo) lo = l;
      if (h > hi) hi = h;
    }
    const range = hi - lo;
    this.canTrigger = range > MIN_TRIGGER_RANGE;
    this.triggerLevel = (hi + lo) / 2;
    this.triggerHysteresis = range * TRIGGER_HYSTERESIS;
  }

  readDisplay(out: Float32Array, offset: number): void {
    out.set(this.sweep ? this.recording : this.shown, offset);
  }

  reset(): void {
    this.capturing = false;
    this.armed = false;
    this.waited = 0;
    this.canTrigger = false;
    this.recording.fill(0);
    this.shown.fill(0);
  }
}
