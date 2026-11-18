/**
 * The open project as reactive app state, plus UI state of the canvas (selection, port positions).
 *
 * `patch` is the patch shown in the workspace: a live view onto the active patch of `project`,
 * so editing code and canvas components can keep working on "the patch" without caring which
 * one is active.
 */
import { DEFAULT_TEMPO } from '../engine/core/Transport';
import { getDefinition } from '../modules/registry';
import { fitView } from './geometry';
import * as ops from './operations';
import type { Patch, PortRef, Project } from './types';

export const DEFAULT_PROJECT_NAME = 'Untitled project';

/** Starts without its Channel: `ensureProjectChannels()` adds it once the modules are loaded. */
export const project = $state<Project>(ops.emptyProject(DEFAULT_PROJECT_NAME, DEFAULT_TEMPO));

/** Give every patch its Channel (start-up; opening files does this by itself). */
export function ensureProjectChannels() {
  ops.ensureChannels(project, getDefinition);
}

/** The patch shown in the workspace (falls back to the first, so there always is one). */
export function activePatch(): Patch {
  return project.patches.find((p) => p.id === project.activePatch) ?? project.patches[0]!;
}

export const patch: Patch = {
  get id() {
    return activePatch().id;
  },
  get name() {
    return activePatch().name;
  },
  set name(v) {
    activePatch().name = v;
  },
  get color() {
    return activePatch().color;
  },
  set color(v) {
    activePatch().color = v;
  },
  get modules() {
    return activePatch().modules;
  },
  set modules(v) {
    activePatch().modules = v;
  },
  get cables() {
    return activePatch().cables;
  },
  set cables(v) {
    activePatch().cables = v;
  },
  get view() {
    return activePatch().view;
  },
  set view(v) {
    activePatch().view = v;
  },
};

/** True when the patch holds nothing but its Channel. */
export function isPatchEmpty(p: Patch = patch): boolean {
  return p.modules.every((m) => getDefinition(m.type)?.fixed);
}

/** Replace the whole project (open file, new project, autosave restore, starter patch). */
export function replaceProject(next: Project) {
  ops.ensureChannels(next, getDefinition);
  canvasState.selection = null;
  project.name = next.name;
  project.tempo = next.tempo;
  project.patches = next.patches;
  project.activePatch = next.activePatch;
}

export type Selection = { kind: 'module'; id: string } | { kind: 'cable'; id: string } | null;

export const canvasState = $state({
  selection: null as Selection,
  /**
   * Position of every port's jack centre relative to its module's top-left corner, in canvas
   * pixels, keyed by "moduleId:portId". Measured from the DOM when modules render.
   */
  portOffsets: {} as Record<string, { x: number; y: number }>,
  /** Module sizes in canvas pixels, keyed by module id (for "fit to view"). */
  moduleSizes: {} as Record<string, { w: number; h: number }>,
  /**
   * Stacking order by module id. Raising a module bumps its number instead of reordering the
   * module list, so DOM nodes never move while the user is interacting with them.
   */
  zIndex: {} as Record<string, number>,
  /** Size of the visible canvas area in screen pixels. */
  viewport: { w: 0, h: 0 },
});

let zCounter = 0;

export const portKey = (ref: PortRef) => `${ref.module}:${ref.port}`;

export function addModule(type: string, x: number, y: number) {
  const def = getDefinition(type);
  if (!def) return null;
  const m = ops.addModule(patch, def, x, y);
  selectModule(m.id);
  return m;
}

export function removeModule(id: string) {
  const m = patch.modules.find((x) => x.id === id);
  if (m && getDefinition(m.type)?.fixed) return; // the Channel stays
  ops.removeModule(patch, id);
  for (const key of Object.keys(canvasState.portOffsets)) {
    if (key.startsWith(`${id}:`)) delete canvasState.portOffsets[key];
  }
  delete canvasState.moduleSizes[id];
  delete canvasState.zIndex[id];
  if (canvasState.selection?.id === id) canvasState.selection = null;
}

export function connect(from: PortRef, to: PortRef) {
  return ops.connect(patch, from, to, getDefinition);
}

export function disconnect(cableId: string) {
  ops.disconnect(patch, cableId);
  if (canvasState.selection?.kind === 'cable' && canvasState.selection.id === cableId) canvasState.selection = null;
}

export function raiseModule(id: string) {
  canvasState.zIndex[id] = ++zCounter;
}

export function selectModule(id: string) {
  canvasState.selection = { kind: 'module', id };
  raiseModule(id);
}

export function deleteSelection() {
  const sel = canvasState.selection;
  if (!sel) return;
  if (sel.kind === 'module') removeModule(sel.id);
  else disconnect(sel.id);
}

export function setParam(moduleId: string, paramId: string, value: number) {
  const m = patch.modules.find((x) => x.id === moduleId);
  if (m) m.params[paramId] = value;
}

/** Zoom and pan so every module is in view. */
export function fitAll() {
  const rects = patch.modules.map((m) => {
    const s = canvasState.moduleSizes[m.id] ?? { w: getDefinition(m.type)?.width ?? 200, h: 240 };
    return { x: m.x, y: m.y, w: s.w, h: s.h };
  });
  patch.view = fitView(rects, canvasState.viewport.w, canvasState.viewport.h);
}
