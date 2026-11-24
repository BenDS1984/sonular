/**
 * Plain helpers for module groups (see ModuleGroup): where a group's frame or collapsed bar is, and
 * where the cables of a collapsed group attach. No browser APIs, so they can be tested in Node.
 */
import type { ModuleGroup, Patch, PortRef } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

/** Space between the modules and the group frame, and the height of the frame's title strip. */
export const GROUP_PAD = 14;
export const GROUP_HEADER = 32;
/** Width of a collapsed group's bar, and the room per attached cable. */
export const BAR_WIDTH = 230;
const BAR_BASE = 34;
const BAR_STEP = 14;

export type Sizes = Record<string, { w: number; h: number }>;

export function groupOf(patch: Pick<Patch, 'groups'>, moduleId: string): ModuleGroup | undefined {
  return patch.groups?.find((g) => g.moduleIds.includes(moduleId));
}

/** The modules of a group that exist, as the rectangle that holds them all (no padding). */
export function membersRect(patch: Pick<Patch, 'modules'>, group: ModuleGroup, sizes: Sizes): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const id of group.moduleIds) {
    const m = patch.modules.find((x) => x.id === id);
    if (!m) continue;
    const s = sizes[id] ?? { w: 200, h: 240 };
    x0 = Math.min(x0, m.x);
    y0 = Math.min(y0, m.y);
    x1 = Math.max(x1, m.x + s.w);
    y1 = Math.max(y1, m.y + s.h);
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** The frame drawn around an expanded group, with room for the title strip on top. */
export function frameRect(patch: Pick<Patch, 'modules'>, group: ModuleGroup, sizes: Sizes): Rect | null {
  const r = membersRect(patch, group, sizes);
  return r && { x: r.x - GROUP_PAD, y: r.y - GROUP_PAD - GROUP_HEADER, w: r.w + 2 * GROUP_PAD, h: r.h + 2 * GROUP_PAD + GROUP_HEADER };
}

/** Cables that enter or leave the group (the other end is outside it). */
export function externalCables(patch: Pick<Patch, 'cables'>, group: ModuleGroup) {
  const inside = (ref: PortRef) => group.moduleIds.includes(ref.module);
  return {
    outgoing: patch.cables.filter((c) => inside(c.from) && !inside(c.to)),
    incoming: patch.cables.filter((c) => !inside(c.from) && inside(c.to)),
  };
}

/** The collapsed bar: at the top-left of the frame, tall enough for one attachment row per cable. */
export function barRect(patch: Pick<Patch, 'modules' | 'cables'>, group: ModuleGroup, sizes: Sizes): Rect | null {
  const f = frameRect(patch, group, sizes);
  if (!f) return null;
  const { outgoing, incoming } = externalCables(patch, group);
  const rows = Math.max(outgoing.length, incoming.length, 1);
  return { x: f.x, y: f.y, w: BAR_WIDTH, h: BAR_BASE + BAR_STEP * (rows - 1) };
}

/** Where the end of a cable attaches to the bar of a collapsed group. */
export function barAnchor(
  patch: Pick<Patch, 'modules' | 'cables'>,
  group: ModuleGroup,
  sizes: Sizes,
  cableId: string,
  end: 'from' | 'to',
): Point | null {
  const bar = barRect(patch, group, sizes);
  if (!bar) return null;
  const { outgoing, incoming } = externalCables(patch, group);
  const list = end === 'from' ? outgoing : incoming;
  const i = Math.max(0, list.findIndex((c) => c.id === cableId));
  return { x: end === 'from' ? bar.x + bar.w : bar.x, y: bar.y + 17 + i * BAR_STEP };
}
