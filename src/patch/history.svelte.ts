/**
 * Undo/redo for the patch.
 *
 * Every change to modules, cables, parameters or the patch name becomes an undo step, but changes that belong
 * together are merged: while a mouse button is held (dragging a module or turning a knob) nothing
 * is recorded until release, and other bursts (scroll wheel, arrow keys) are merged when they
 * come within a short pause of each other. Panning and zooming the view is not undoable.
 */
import { untrack } from 'svelte';
import { canvasState, patch } from './patch.svelte';
import { UndoStack } from './UndoStack';
import type { Cable, ModuleInstance } from './types';

const MERGE_MS = 350;

interface Content {
  name: string;
  modules: ModuleInstance[];
  cables: Cable[];
}

const snapshot = (): string => JSON.stringify({ name: patch.name, modules: patch.modules, cables: patch.cables });

export const historyState = $state({ canUndo: false, canRedo: false });

let stack: UndoStack | null = null;
let pending: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pointerDown = false;

function updateFlags() {
  historyState.canUndo = !!stack?.canUndo || pending !== null;
  historyState.canRedo = !!stack?.canRedo && pending === null;
}

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (pending !== null && stack) stack.push(pending);
  pending = null;
  updateFlags();
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = pointerDown ? null : setTimeout(flush, MERGE_MS);
  updateFlags();
}

function restore(state: string) {
  const content = JSON.parse(state) as Content;
  patch.name = content.name;
  patch.modules = content.modules;
  patch.cables = content.cables;
  const sel = canvasState.selection;
  if (sel?.kind === 'module' && !content.modules.some((m) => m.id === sel.id)) canvasState.selection = null;
  if (sel?.kind === 'cable' && !content.cables.some((c) => c.id === sel.id)) canvasState.selection = null;
  updateFlags();
}

export function undo() {
  flush();
  const state = stack?.undo();
  if (state != null) restore(state);
}

export function redo() {
  flush();
  const state = stack?.redo();
  if (state != null) restore(state);
}

/** Forget all history (e.g. after opening a file is not wanted as an undo step). */
export function resetHistory() {
  if (timer) clearTimeout(timer);
  timer = null;
  pending = null;
  stack?.reset(untrack(snapshot));
  updateFlags();
}

export function startHistory(): () => void {
  stack = new UndoStack(untrack(snapshot));

  const onDown = () => (pointerDown = true);
  const onUp = () => {
    pointerDown = false;
    if (pending !== null) schedule();
  };
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);

  const stopEffects = $effect.root(() => {
    $effect(() => {
      const state = snapshot(); // deep dependency on name, modules and cables
      untrack(() => {
        // Equal to the recorded state: nothing new (e.g. right after an undo restored it).
        if (state === stack?.currentSnapshot) {
          if (timer) clearTimeout(timer);
          timer = null;
          pending = null;
          updateFlags();
          return;
        }
        pending = state;
        schedule();
      });
    });
  });

  return () => {
    stopEffects();
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
  };
}
