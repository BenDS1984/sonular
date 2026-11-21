/**
 * Recording automation: with the "Automation" button on, turning a knob, fader or switch while the
 * song plays draws its movement into the control's lane.
 *
 * Only the stretch where the control is being turned (a "touch") is replaced: when it is let go,
 * the old line plays on. A touch ends when the mouse button is released, or, for keyboard changes,
 * after a short pause. While it lasts the lane is paused, so the control is heard as it is turned.
 * The movement is drawn live and thinned out to the points it needs when the touch ends.
 * Patches set to Free do not record (they ignore the timeline).
 */
import { currentBeat, engineState } from '../engine/engine.svelte';
import { overrideKey, overrides } from '../engine/overrides.svelte';
import { getDefinition } from '../modules/registry';
import type { ParamSpec } from '../modules/types';
import { ensureLane, punchIn, thinPoints } from '../patch/timeline';
import type { AutomationLane, AutomationPoint, ModuleInstance, Patch } from '../patch/types';

/** Screen state, not saved: whether recording is on, and which controls are being recorded. */
export const automationRecording = $state({
  armed: false,
  /** Keys "<patch id>/<module id>:<param>" of the controls being recorded right now. */
  keys: {} as Record<string, true>,
});

interface Touch {
  key: string;
  module: ModuleInstance;
  param: string;
  spec: ParamSpec;
  lane: AutomationLane;
  /** The lane's points before this touch. */
  base: AutomationPoint[];
  /** The control's value before this touch (used when the lane had no points). */
  own: number;
  start: number;
  samples: AutomationPoint[];
  /** performance.now() of the last change from the control. */
  changedAt: number;
}

/** How often a held control is sampled, in ms. */
const SAMPLE_MS = 30;
/** A keyboard touch ends after this long without a change, in ms. */
const KEY_RELEASE_MS = 600;

const touches = new Map<string, Touch>();
let pointerDown = false;
let ticker: ReturnType<typeof setInterval> | null = null;
let listening = false;

/** Whether a control is being recorded right now. Reactive. */
export function isRecording(patch: Patch | undefined, module: ModuleInstance, param: string): boolean {
  return !!patch && !!automationRecording.keys[overrideKey(patch.id, module.id, param)];
}

export function toggleAutomationRecording() {
  automationRecording.armed = !automationRecording.armed;
  if (automationRecording.armed) listen();
  else endAllTouches();
}

/**
 * Called when a control changes (after its new value is written). Records it when recording is
 * on, the song plays and the patch follows the timeline. Returns whether it was recorded.
 */
export function recordControl(patch: Patch | undefined, module: ModuleInstance, param: string, before: number): boolean {
  if (!automationRecording.armed || !engineState.playing || !patch || patch.free) return false;
  const spec = getDefinition(module.type)?.params.find((s) => s.id === param);
  if (!spec || spec.automatable === false) return false;
  const key = overrideKey(patch.id, module.id, param);
  const value = module.params[param] ?? before;
  let touch = touches.get(key);
  let now = touch ? songTime(touch) : currentBeat();
  if (touch && now < 0) {
    // The song looped back: finish this pass and start a new one at the loop start.
    endTouch(touch);
    touch = undefined;
    now = currentBeat();
  }
  if (!touch) {
    const lane = ensureLane(patch, module.id, param);
    touch = {
      key,
      module,
      param,
      spec,
      lane,
      base: lane.points.map((p) => ({ ...p })),
      own: before,
      start: now,
      samples: [],
      changedAt: 0,
    };
    touches.set(key, touch);
    // Pause the lane while it is being recorded, so the control is heard as it is turned.
    overrides.keys[key] = true;
    automationRecording.keys[key] = true;
  }
  touch.changedAt = performance.now();
  addSample(touch, now, value);
  if (!ticker) ticker = setInterval(tick, SAMPLE_MS);
  return true;
}

/** A jump back in song position larger than this (in beats) is the loop, not timing jitter. */
const LOOP_JUMP = 0.5;

/**
 * The song position for the next sample of a touch: never before its last sample (the estimated
 * position wobbles a little), or -1 when the song looped back.
 */
function songTime(touch: Touch): number {
  const now = currentBeat();
  const last = touch.samples[touch.samples.length - 1]!.time;
  if (now < last - LOOP_JUMP) return -1;
  return Math.max(now, last);
}

function addSample(touch: Touch, time: number, value: number) {
  const last = touch.samples[touch.samples.length - 1];
  if (last && time - last.time < 1e-6) last.value = value;
  else touch.samples.push({ time, value });
  touch.lane.points = punchIn(touch.spec, touch.base, touch.start, time, touch.samples, touch.own);
}

/** Sample held controls (so holding still is recorded too) and end touches that are over. */
function tick() {
  if (!engineState.playing || !automationRecording.armed) {
    endAllTouches();
    return;
  }
  for (const touch of [...touches.values()]) {
    const last = touch.samples[touch.samples.length - 1]!;
    const now = songTime(touch);
    if (now < 0) {
      endTouch(touch); // looped back: the next change starts a new pass
      continue;
    }
    if (!pointerDown && performance.now() - touch.changedAt > KEY_RELEASE_MS) {
      endTouch(touch);
      continue;
    }
    addSample(touch, now, touch.module.params[touch.param] ?? last.value);
  }
}

function endTouch(touch: Touch) {
  touches.delete(touch.key);
  const end = touch.samples[touch.samples.length - 1]!.time;
  touch.lane.points = punchIn(touch.spec, touch.base, touch.start, end, thinPoints(touch.spec, touch.samples), touch.own);
  delete overrides.keys[touch.key];
  delete automationRecording.keys[touch.key];
  if (touches.size === 0 && ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function endAllTouches() {
  for (const touch of [...touches.values()]) endTouch(touch);
}

/** Follow the mouse button: a touch made with the mouse ends when the button is released. */
function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener('pointerdown', () => (pointerDown = true), true);
  const up = () => {
    pointerDown = false;
    endAllTouches();
  };
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}
