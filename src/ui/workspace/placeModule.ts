/**
 * Adding a module to the shown patch: at the point the user chose (dropped there, or double-clicked
 * the canvas), else in the middle of what the canvas shows. The middle of its header goes on the
 * point, even on top of another module.
 */
import { addModule, canvasState, patch } from '../../patch/patch.svelte';
import { snap, toCanvas, type Point } from '../../patch/geometry';
import type { ModuleDefinition } from '../../modules/types';

export function placeModule(def: ModuleDefinition, place?: Point | null) {
  const { w, h } = canvasState.viewport;
  const at = place ?? toCanvas(patch.view, w / 2, h / 2);
  addModule(def.type, snap(at.x - def.width / 2), snap(at.y - 16));
}
