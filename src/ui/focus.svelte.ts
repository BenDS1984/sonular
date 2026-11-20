/**
 * Jumping between a sequencer on the canvas and its row on the timeline. The target lights up
 * briefly so the eye finds it. Screen state only: not saved and not part of undo.
 *
 * Imports no module definitions: panels import this file, so that would be a circular import.
 */
import { canvasState, project, selectModule, selectPatch } from '../patch/patch.svelte';
import { view } from './view.svelte';

/** What lights up: a module on the canvas, or a timeline row ("patchId:moduleId"). */
export const flash = $state({ module: '', row: '', n: 0 });

const FLASH_MS = 1400;
let timer: ReturnType<typeof setTimeout> | undefined;

function startFlash(module: string, row: string) {
  flash.module = module;
  flash.row = row;
  flash.n++;
  clearTimeout(timer);
  timer = setTimeout(() => {
    flash.module = '';
    flash.row = '';
  }, FLASH_MS);
}

/** Open a module's patch, select the module, bring it into view and light it up. */
export function showModule(patchId: string, moduleId: string) {
  const p = project.patches.find((x) => x.id === patchId);
  const m = p?.modules.find((x) => x.id === moduleId);
  if (!p || !m) return;
  selectPatch(patchId);
  view.main = 'patch';
  selectModule(moduleId);
  const { w: vw, h: vh } = canvasState.viewport;
  if (vw > 0 && vh > 0) {
    const size = canvasState.moduleSizes[moduleId] ?? { w: 300, h: 240 };
    const z = p.view.zoom;
    const left = m.x * z + p.view.x;
    const top = m.y * z + p.view.y;
    const inView = left >= 0 && top >= 0 && left + size.w * z <= vw && top + size.h * z <= vh;
    if (!inView) p.view = { zoom: z, x: vw / 2 - (m.x + size.w / 2) * z, y: vh / 2 - (m.y + size.h / 2) * z };
  }
  startFlash(moduleId, '');
}

/** Open the timeline and light up a sequencer's row. */
export function showOnTimeline(patchId: string, moduleId: string) {
  view.main = 'timeline';
  startFlash('', `${patchId}:${moduleId}`);
}
