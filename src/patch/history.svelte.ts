/**
 * Undo/redo for the whole project: one history across all patches.
 *
 * Every change to modules, cables, parameters, the tempo, the project or a patch's name, colour
 * or the list of patches becomes an undo step, but changes that belong
 * together are merged: while a mouse button is held (dragging a module or turning a knob) nothing
 * is recorded until release, and other bursts (scroll wheel, arrow keys) are merged when they
 * come within a short pause of each other. Panning and zooming a view and switching between
 * patches are not undoable.
 */
import { untrack } from 'svelte';
import { canvasState, patch, project } from './patch.svelte';
import { UndoStack } from './UndoStack';
import type { Patch } from './types';

const MERGE_MS = 350;

type PatchContent = Omit<Patch, 'view'>;

interface Content {
  name: string;
  tempo: number;
  patches: PatchContent[];
}

const snapshot = (): string =>
  JSON.stringify({
    name: project.name,
    tempo: project.tempo,
    patches: project.patches.map((p) => ({ id: p.id, name: p.name, color: p.color, modules: p.modules, cables: p.cables })),
  });

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
  project.name = content.name;
  project.tempo = content.tempo;
  // Views are not part of the history: patches that still exist keep where they were scrolled to.
  const views = new Map(project.patches.map((p) => [p.id, p.view]));
  project.patches = content.patches.map((p) => ({ ...p, view: views.get(p.id) ?? { x: 0, y: 0, zoom: 1 } }));
  if (!project.patches.some((p) => p.id === project.activePatch)) project.activePatch = project.patches[0]!.id;
  const sel = canvasState.selection;
  if (sel?.kind === 'module' && !patch.modules.some((m) => m.id === sel.id)) canvasState.selection = null;
  if (sel?.kind === 'cable' && !patch.cables.some((c) => c.id === sel.id)) canvasState.selection = null;
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
      const state = snapshot(); // deep dependency on everything except the views
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
