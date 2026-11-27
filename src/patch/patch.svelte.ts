/**
 * The open patch as reactive app state, plus UI state of the canvas (selection, port positions).
 */
import { DEFAULT_TEMPO } from '../engine/core/Transport';
import { getDefinition } from '../modules/registry';
import { fitView } from './geometry';
import { groupOf, type DropHint } from './groups';
import * as ops from './operations';
import type { Patch, PortRef } from './types';

export const DEFAULT_PATCH_NAME = 'Untitled patch';

export const patch = $state<Patch>({
  name: DEFAULT_PATCH_NAME,
  tempo: DEFAULT_TEMPO,
  modules: [],
  cables: [],
  view: { x: 0, y: 0, zoom: 1 },
});

/**
 * Whether the patch holds nothing to lose: no cables and no modules but (at most) Outputs, which a
 * new patch starts with. Then "New patch" needs no confirmation and the hints for an empty patch show.
 */
export function isPatchEmpty(): boolean {
  return patch.cables.length === 0 && patch.modules.every((m) => m.type === 'output');
}

/** Switch the master limiter on or off; on is the default and is not stored. */
export function setLimiter(on: boolean) {
  if (on) delete patch.limiter;
  else patch.limiter = false;
}

/** `modules` is a group of two or more modules, selected by dragging a frame (Shift + drag). */
export type Selection =
  | { kind: 'module'; id: string }
  | { kind: 'modules'; ids: string[] }
  | { kind: 'cable'; id: string }
  | null;

/** The ids of the selected modules (none, one or a group). */
export function selectedModuleIds(): string[] {
  const sel = canvasState.selection;
  if (sel?.kind === 'module') return [sel.id];
  if (sel?.kind === 'modules') return sel.ids;
  return [];
}

/** Select these modules: a group when there are several. */
export function selectModules(ids: string[]) {
  if (ids.length === 0) canvasState.selection = null;
  else if (ids.length === 1) canvasState.selection = { kind: 'module', id: ids[0]! };
  else canvasState.selection = { kind: 'modules', ids };
  for (const id of ids) raiseModule(id);
}

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
  /** The loose (ungrouped) module that was selected last: it may lie above the groups. */
  topLoose: null as string | null,
  /** Size of the visible canvas area in screen pixels. */
  viewport: { w: 0, h: 0 },
  /** While a module is dragged: the group it would join or leave if let go now (shown on the group). */
  groupHint: null as DropHint | null,
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

/** How far a copy lies from its original, in canvas pixels. */
const DUPLICATE_OFFSET = 40;

/** Copy these modules (and the cables between them) a little down and to the right, and select the copies. */
export function duplicateModules(ids: string[]) {
  const copies = ops.duplicateModules(patch, ids, DUPLICATE_OFFSET, DUPLICATE_OFFSET);
  selectModules(copies.map((m) => m.id));
}

export function removeModule(id: string) {
  if (!ops.canRemove(patch, id)) return;
  ops.removeModule(patch, id);
  for (const key of Object.keys(canvasState.portOffsets)) {
    if (key.startsWith(`${id}:`)) delete canvasState.portOffsets[key];
  }
  delete canvasState.moduleSizes[id];
  delete canvasState.zIndex[id];
  dropFromGroups(id);
  const sel = canvasState.selection;
  if (sel?.kind === 'modules') selectModules(sel.ids.filter((x) => x !== id));
  else if (sel?.id === id) canvasState.selection = null;
}

// ---------- Groups ----------

/** A removed module leaves its group; a group of fewer than two modules is dissolved. */
function dropFromGroups(moduleId: string) {
  if (!patch.groups) return;
  for (const g of patch.groups) g.moduleIds = g.moduleIds.filter((id) => id !== moduleId);
  const left = patch.groups.filter((g) => g.moduleIds.length >= 2);
  patch.groups = left.length ? left : undefined;
}

/** Put a loose module into a group. */
export function addToGroup(groupId: string, moduleId: string) {
  const g = patch.groups?.find((x) => x.id === groupId);
  if (!g || groupOf(patch, moduleId) || !patch.modules.some((m) => m.id === moduleId)) return;
  g.moduleIds = [...g.moduleIds, moduleId];
  raiseModule(moduleId);
}

/** Take a module out of its group (a group left with fewer than two modules is dissolved). */
export function removeFromGroup(moduleId: string) {
  dropFromGroups(moduleId);
}

/** Whether the selected modules can be grouped: two or more, none of them in a group yet. */
export function canGroupSelection(): boolean {
  const ids = selectedModuleIds();
  return ids.length >= 2 && ids.every((id) => !groupOf(patch, id));
}

/** Group the selected modules (a frame around them with a title; it can be collapsed). */
export function groupSelection() {
  if (!canGroupSelection()) return;
  const ids = selectedModuleIds();
  const groups = patch.groups ?? [];
  let n = groups.length + 1;
  while (groups.some((g) => g.id === `g${n}`)) n++;
  patch.groups = [...groups, { id: `g${n}`, name: `Group ${n}`, moduleIds: [...ids], collapsed: false }];
  raiseModule(ids[0]!); // the new group covers whatever lies under it
}

/** Dissolve a group; its modules stay where they are. */
export function ungroup(groupId: string) {
  const left = (patch.groups ?? []).filter((g) => g.id !== groupId);
  patch.groups = left.length ? left : undefined;
}

export function toggleGroupCollapsed(groupId: string) {
  const g = patch.groups?.find((x) => x.id === groupId);
  if (!g) return;
  g.collapsed = !g.collapsed;
  // Hidden modules cannot stay selected: Delete would remove them unseen.
  if (g.collapsed && selectedModuleIds().some((id) => g.moduleIds.includes(id))) canvasState.selection = null;
}

/** Whether a module is hidden inside a collapsed group. */
export function isHidden(moduleId: string): boolean {
  return !!groupOf(patch, moduleId)?.collapsed;
}

export function connect(from: PortRef, to: PortRef) {
  return ops.connect(patch, from, to, getDefinition);
}

export function disconnect(cableId: string) {
  ops.disconnect(patch, cableId);
  if (canvasState.selection?.kind === 'cable' && canvasState.selection.id === cableId) canvasState.selection = null;
}

/**
 * Bring a module to the front. A module in a group brings its whole group along, so a group always
 * covers (or is covered by) other modules as one piece.
 */
export function raiseModule(id: string) {
  if (zCounter > MAX_Z) renumberLayers();
  const group = groupOf(patch, id);
  if (!group) canvasState.topLoose = id;
  for (const member of group ? group.moduleIds.filter((x) => x !== id) : []) canvasState.zIndex[member] = ++zCounter;
  canvasState.zIndex[id] = ++zCounter;
}

/** Give every group its own stacking turn (after opening a patch, when nothing was raised yet). */
export function raiseGroups() {
  for (const g of patch.groups ?? []) if (g.moduleIds[0]) raiseModule(g.moduleIds[0]);
}

/** Stacking numbers stay far below the cable layer (100000); past this the numbers are made small again. */
const MAX_Z = 14000;
const GROUP_TIER = 30000;
const TOP_TIER = 60000;

/** Give every module the smallest stacking number that keeps the current order. */
function renumberLayers() {
  const ids = Object.keys(canvasState.zIndex).sort((a, b) => canvasState.zIndex[a]! - canvasState.zIndex[b]!);
  zCounter = 0;
  for (const id of ids) canvasState.zIndex[id] = ++zCounter;
}

/**
 * Stacking number on the canvas. Modules take even numbers. Three tiers, from below: loose modules,
 * grouped modules, and the loose module selected last (it may lie above a group). The frame of an
 * expanded group sits just below its lowest member (an odd number), above everything underneath it.
 */
export const moduleLayer = (id: string) => {
  const base = 2 * (canvasState.zIndex[id] ?? 0);
  if (groupOf(patch, id)) return base + GROUP_TIER;
  return canvasState.topLoose === id ? base + TOP_TIER : base;
};
export function groupLayer(moduleIds: string[]) {
  return Math.min(...moduleIds.map((id) => moduleLayer(id))) - 1;
}

export function selectModule(id: string) {
  canvasState.selection = { kind: 'module', id };
  raiseModule(id);
}

export function deleteSelection() {
  const sel = canvasState.selection;
  if (!sel) return;
  if (sel.kind === 'module') removeModule(sel.id);
  else if (sel.kind === 'modules') for (const id of [...sel.ids]) removeModule(id);
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
