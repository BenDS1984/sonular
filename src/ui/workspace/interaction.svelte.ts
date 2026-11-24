/**
 * Transient interaction state of the canvas: the cable being dragged and the module browser.
 */
import { getDefinition } from '../../modules/registry';
import { canvasState, connect, patch, portKey } from '../../patch/patch.svelte';
import type { Point } from '../../patch/geometry';
import { cableIntoInput, disconnect } from '../../patch/operations';
import type { PortRef } from '../../patch/types';
import type { SignalType } from '../signals';

export interface CableDrag {
  /** The end that stays attached. */
  fixed: PortRef;
  fixedKind: 'in' | 'out';
  signal: SignalType;
  /** Loose end, in canvas coordinates. */
  pointer: Point;
  /** Port the cable would connect to if released now. */
  target: PortRef | null;
}

export const interaction = $state({
  cable: null as CableDrag | null,
});

/** Canvas position of a port's jack centre, or null if not measured yet. */
export function portPosition(ref: PortRef): Point | null {
  const m = patch.modules.find((x) => x.id === ref.module);
  const off = canvasState.portOffsets[portKey(ref)];
  return m && off ? { x: m.x + off.x, y: m.y + off.y } : null;
}

function portSignal(ref: PortRef, kind: 'in' | 'out'): SignalType {
  const m = patch.modules.find((x) => x.id === ref.module);
  const def = m && getDefinition(m.type);
  const spec = def && (kind === 'in' ? def.inputs : def.outputs).find((p) => p.id === ref.port);
  return spec?.signal ?? 'audio';
}

/**
 * Begin dragging a cable from a jack.
 * - From an output: a new cable.
 * - From an input that has a cable: pick up that cable by its input end.
 * - From an empty input: a new cable that is looking for an output.
 */
export function beginCableDrag(ref: PortRef, kind: 'in' | 'out', pointer: Point) {
  if (kind === 'in') {
    const existing = cableIntoInput(patch, ref);
    if (existing) {
      disconnect(patch, existing.id);
      interaction.cable = {
        fixed: { ...existing.from },
        fixedKind: 'out',
        signal: portSignal(existing.from, 'out'),
        pointer,
        target: null,
      };
      updateCableDrag(pointer, 1);
      return;
    }
  }
  interaction.cable = { fixed: ref, fixedKind: kind, signal: portSignal(ref, kind), pointer, target: null };
}

/** Screen pixels within which a released cable snaps onto a jack. */
const SNAP_RADIUS_PX = 22;

export function isValidTarget(ref: PortRef, kind: 'in' | 'out'): boolean {
  const drag = interaction.cable;
  if (!drag) return false;
  return kind !== drag.fixedKind && ref.module !== drag.fixed.module;
}

export function updateCableDrag(pointer: Point, zoom: number) {
  const drag = interaction.cable;
  if (!drag) return;
  drag.pointer = pointer;
  const wantKind = drag.fixedKind === 'out' ? 'in' : 'out';
  const radius = SNAP_RADIUS_PX / zoom;
  let best: PortRef | null = null;
  let bestDist = radius;
  for (const m of patch.modules) {
    if (m.id === drag.fixed.module) continue;
    const def = getDefinition(m.type);
    if (!def) continue;
    for (const p of wantKind === 'in' ? def.inputs : def.outputs) {
      const pos = portPosition({ module: m.id, port: p.id });
      if (!pos) continue;
      const d = Math.hypot(pos.x - pointer.x, pos.y - pointer.y);
      if (d < bestDist) {
        bestDist = d;
        best = { module: m.id, port: p.id };
      }
    }
  }
  drag.target = best;
}

/** Finish the drag: connect if over a valid jack; otherwise the cable is dropped (removed). */
export function endCableDrag() {
  const drag = interaction.cable;
  interaction.cable = null;
  if (!drag?.target) return;
  if (drag.fixedKind === 'out') connect(drag.fixed, drag.target);
  else connect(drag.target, drag.fixed);
}

export function cancelCableDrag() {
  interaction.cable = null;
}

