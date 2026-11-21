/**
 * Automation as the controls see it: which knobs have a lane, what value they show while the
 * song plays, and the right-click menu that starts or removes automation.
 */
import { engineState, transportState } from '../engine/engine.svelte';
import { overrideKey, overrides } from '../engine/overrides.svelte';
import { getDefinition } from '../modules/registry';
import { project } from '../patch/patch.svelte';
import { addAutomation, laneOf, laneValueAt, removeLane } from '../patch/timeline';
import type { ModuleInstance, Patch } from '../patch/types';
import { showOnTimeline } from './focus.svelte';
import { timelineView } from './timeline/timelineScreen.svelte';

/** The patch a module belongs to. */
export function patchOf(module: ModuleInstance): Patch | undefined {
  return project.patches.find((p) => p.modules.includes(module));
}

/** A control's lane, if it has one with points. */
function activeLane(module: ModuleInstance, param: string) {
  const patch = patchOf(module);
  const lane = patch && laneOf(patch, module.id, param);
  return patch && lane && lane.points.length > 0 ? { patch, lane } : null;
}

/** Whether a control has automation (shown with a coloured ring). Reactive. */
export function isAutomated(module: ModuleInstance, param: string): boolean {
  return activeLane(module, param) !== null;
}

/** Whether the user took over an automated control (its lane pauses until the next Play). Reactive. */
export function isOverridden(module: ModuleInstance, param: string): boolean {
  const patch = patchOf(module);
  return !!patch && !!overrides.keys[overrideKey(patch.id, module.id, param)];
}

/**
 * Set a control from its knob, fader or switch. An automated control is taken over: its lane
 * pauses until the next Play (not in a Free patch, which ignores its lanes anyway).
 */
export function setControl(module: ModuleInstance, param: string, value: number) {
  module.params[param] = value;
  const a = activeLane(module, param);
  if (a && !a.patch.free) overrides.keys[overrideKey(a.patch.id, module.id, param)] = true;
}

/**
 * The value a control shows: its lane's value at the playhead (where the song is while playing,
 * where Play starts while stopped), or its own value without automation, in a Free patch or when
 * the user took it over. Reactive.
 */
export function shownValue(module: ModuleInstance, param: string): number {
  const own = module.params[param] ?? 0;
  const a = activeLane(module, param);
  if (!a || a.patch.free || overrides.keys[overrideKey(a.patch.id, module.id, param)]) return own;
  const spec = getDefinition(module.type)?.params.find((s) => s.id === param);
  if (!spec) return own;
  const beat = engineState.playing ? engineState.beat : transportState.start;
  return laneValueAt(spec, a.lane.points, beat) ?? own;
}

// ---------- Right-click menu on a control ----------

export const controlMenu = $state({
  open: false,
  x: 0,
  y: 0,
  module: null as ModuleInstance | null,
  param: '',
  label: '',
});

export function openControlMenu(e: MouseEvent, module: ModuleInstance, param: string, label: string) {
  e.preventDefault();
  e.stopPropagation();
  controlMenu.open = true;
  controlMenu.x = e.clientX;
  controlMenu.y = e.clientY;
  controlMenu.module = module;
  controlMenu.param = param;
  controlMenu.label = label;
}

export function closeControlMenu() {
  controlMenu.open = false;
  controlMenu.module = null;
}

/** Whether a control can be automated (mute, solo and a sequencer's pattern cannot). */
export function canAutomate(module: ModuleInstance, param: string): boolean {
  const spec = getDefinition(module.type)?.params.find((s) => s.id === param);
  return !!spec && spec.automatable !== false;
}

/** Start automating a control and show its lane on the timeline. */
export function automate(module: ModuleInstance, param: string) {
  const patch = patchOf(module);
  if (!patch || !canAutomate(module, param)) return;
  addAutomation(patch, module.id, param, module.params[param] ?? 0);
  delete timelineView.folded[patch.id];
  showOnTimeline(patch.id, module.id);
}

/** Show a control's lane on the timeline. */
export function showAutomation(module: ModuleInstance) {
  const patch = patchOf(module);
  if (!patch) return;
  delete timelineView.folded[patch.id];
  showOnTimeline(patch.id, module.id);
}

export function removeAutomation(module: ModuleInstance, param: string) {
  const patch = patchOf(module);
  if (patch) removeLane(patch, module.id, param);
}
