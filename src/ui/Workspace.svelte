<!--
  The patching canvas.

  Mouse:
  - drag empty space (or middle mouse anywhere) to pan; scroll to pan, Ctrl + scroll to zoom
  - drag a module by its header; click to select
  - drag from a jack to patch a cable; drag a connected input to move/remove its cable
  - double-click empty space to add a module there
  Keyboard: Delete/Backspace removes the selection, Escape cancels.
-->
<script lang="ts">
  import ModuleView from './workspace/ModuleView.svelte';
  import CableLayer from './workspace/CableLayer.svelte';
  import ModuleBrowser from './workspace/ModuleBrowser.svelte';
  import ZoomControls from './workspace/ZoomControls.svelte';
  import Minimap from './workspace/Minimap.svelte';
  import { prefs } from './prefs.svelte';
  import { addModule, canvasState, deleteSelection, loadStarterPatch, patch } from '../patch/patch.svelte';
  import { GRID, SNAP, fitView, snap, toCanvas, zoomAt } from '../patch/geometry';
  import type { ModuleDefinition } from '../modules/types';
  import { openPatchFile } from '../patch/fileActions';
  import {
    beginCableDrag,
    cancelCableDrag,
    closeBrowser,
    endCableDrag,
    interaction,
    openBrowser,
    updateCableDrag,
  } from './workspace/interaction.svelte';

  let el: HTMLElement | undefined = $state();

  const view = $derived(patch.view);

  $effect(() => {
    if (!el) return;
    const update = () => {
      canvasState.viewport = { w: el!.clientWidth, h: el!.clientHeight };
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  function local(e: { clientX: number; clientY: number }) {
    const r = el!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function canvasPoint(e: { clientX: number; clientY: number }) {
    const p = local(e);
    return toCanvas(patch.view, p.x, p.y);
  }

  // ---------- Jacks / cables ----------

  function startJackDrag(jack: HTMLElement, e: PointerEvent) {
    const moduleId = jack.dataset.module;
    const portId = jack.dataset.port;
    const kind = jack.dataset.portKind as 'in' | 'out' | undefined;
    if (!moduleId || !portId || !kind) return;
    e.preventDefault();
    beginCableDrag({ module: moduleId, port: portId }, kind, canvasPoint(e));
    const move = (ev: PointerEvent) => updateCableDrag(canvasPoint(ev), patch.view.zoom);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      endCableDrag();
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cancelCableDrag();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  // ---------- Panning ----------

  function startPan(e: PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = patch.view.x;
    const origY = patch.view.y;
    let moved = false;
    el!.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      patch.view.x = origX + dx;
      patch.view.y = origY + dy;
    };
    const up = () => {
      el!.removeEventListener('pointermove', move);
      el!.removeEventListener('pointerup', up);
      el!.removeEventListener('pointercancel', up);
      if (!moved) canvasState.selection = null; // plain click on empty space deselects
    };
    el!.addEventListener('pointermove', move);
    el!.addEventListener('pointerup', up);
    el!.addEventListener('pointercancel', up);
  }

  function onpointerdown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const jack = target.closest<HTMLElement>('[data-port]');
    if (jack && e.button === 0) {
      startJackDrag(jack, e);
      return;
    }
    if (e.button === 1 || (e.button === 0 && (target === el || target.classList.contains('world')))) {
      e.preventDefault();
      startPan(e);
    }
  }

  function onwheel(e: WheelEvent) {
    // Knobs handle their own wheel; the browser popup scrolls its list.
    const t = e.target as HTMLElement;
    if (t.closest('[role="slider"], .browser')) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const p = local(e);
      patch.view = zoomAt(patch.view, p.x, p.y, patch.view.zoom * Math.exp(-e.deltaY * 0.0015));
    } else {
      patch.view.x -= e.shiftKey ? e.deltaY : e.deltaX;
      patch.view.y -= e.shiftKey ? 0 : e.deltaY;
    }
  }

  function ondblclick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target !== el && !target.classList.contains('world')) return;
    const p = local(e);
    openBrowser({ x: p.x, y: p.y }, toCanvas(patch.view, p.x, p.y));
  }

  // ---------- Zoom controls ----------

  function zoomCentered(factor: number) {
    const { w, h } = canvasState.viewport;
    patch.view = zoomAt(patch.view, w / 2, h / 2, patch.view.zoom * factor);
  }

  function resetZoom() {
    const { w, h } = canvasState.viewport;
    patch.view = zoomAt(patch.view, w / 2, h / 2, 1);
  }

  function fit() {
    const rects = patch.modules.map((m) => {
      const s = canvasState.moduleSizes[m.id] ?? { w: 200, h: 200 };
      return { x: m.x, y: m.y, w: s.w, h: s.h };
    });
    patch.view = fitView(rects, canvasState.viewport.w, canvasState.viewport.h);
  }

  // ---------- Adding modules ----------

  function pick(def: ModuleDefinition) {
    const place = interaction.browser?.place;
    closeBrowser();
    if (!place) return;
    // Centre horizontally on the chosen point, header just below it; then move right until the
    // new module no longer overlaps an existing one.
    let x = snap(place.x - def.width / 2);
    const y = snap(place.y - 16);
    const ESTIMATED_HEIGHT = 240;
    for (let guard = 0; guard < 100; guard++) {
      const hit = patch.modules.find((m) => {
        const s = canvasState.moduleSizes[m.id] ?? { w: 200, h: ESTIMATED_HEIGHT };
        return x < m.x + s.w && x + def.width > m.x && y < m.y + s.h && y + ESTIMATED_HEIGHT > m.y;
      });
      if (!hit) break;
      // Round up, so the gap never shrinks below one grid cell.
      x = Math.ceil((hit.x + (canvasState.moduleSizes[hit.id]?.w ?? 200) + GRID) / SNAP) * SNAP;
    }
    addModule(def.type, x, y);
  }

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (canvasState.selection) {
        deleteSelection();
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      if (interaction.cable) cancelCableDrag();
      else if (interaction.browser) closeBrowser();
      else canvasState.selection = null;
    }
  }

  // ---------- Dropping a patch file onto the canvas ----------

  let dropping = $state(false);

  function hasFiles(e: DragEvent) {
    return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }

  function ondragover(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    dropping = true;
  }

  function ondrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dropping = false;
    const file = e.dataTransfer!.files[0];
    if (file) void openPatchFile(file);
  }

  const browserPos = $derived.by(() => {
    const b = interaction.browser;
    if (!b) return null;
    const { w, h } = canvasState.viewport;
    return { x: Math.max(8, Math.min(b.screen.x, w - 308)), y: Math.max(8, Math.min(b.screen.y, h - 428)) };
  });
</script>

<svelte:window {onkeydown} />

<main
  class="workspace"
  class:dragging-cable={!!interaction.cable}
  bind:this={el}
  style:background-size={`${GRID * view.zoom}px ${GRID * view.zoom}px`}
  style:background-position={`${view.x}px ${view.y}px`}
  {onpointerdown}
  {onwheel}
  {ondblclick}
  {ondragover}
  ondragleave={() => (dropping = false)}
  {ondrop}
  aria-label="Patch canvas"
>
  <div class="world" style:transform={`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}>
    {#each patch.modules as module (`${module.id}:${module.type}`)}
      <ModuleView {module} />
    {/each}
    <CableLayer onjackpointerdown={startJackDrag} />
  </div>

  {#if patch.modules.length === 0}
    <div class="empty">
      <p class="title">Your patch is empty</p>
      <p class="hint">Double-click anywhere to add a module, or use <strong>+ Module</strong> in the top bar.</p>
      <button
        type="button"
        class="starter"
        onpointerdown={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
        onclick={loadStarterPatch}
      >
        Load a starter patch
      </button>
    </div>
  {/if}

  {#if dropping}
    <div class="drop-hint">Drop a .modulab file to open it</div>
  {/if}

  {#if prefs.minimap && patch.modules.length > 0}
    <Minimap />
  {/if}

  <ZoomControls
    zoom={view.zoom}
    onzoom={zoomCentered}
    onreset={resetZoom}
    onfit={fit}
    minimap={prefs.minimap}
    ontoggleminimap={() => (prefs.minimap = !prefs.minimap)}
  />

  {#if interaction.browser && browserPos}
    <ModuleBrowser x={browserPos.x} y={browserPos.y} onpick={pick} onclose={closeBrowser} />
  {/if}
</main>

<style>
  .workspace {
    position: relative;
    flex: 1;
    overflow: hidden;
    background-color: var(--bg-canvas);
    background-image: radial-gradient(circle, var(--bg-canvas-dot) 1px, transparent 1.2px);
    touch-action: none;
    cursor: default;
  }
  .workspace.dragging-cable {
    cursor: crosshair;
  }
  .world {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    transform-origin: 0 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
    pointer-events: none;
    user-select: none;
  }
  .title {
    margin: 0 0 6px;
    font-size: var(--text-lg);
    color: var(--text-default);
  }
  .hint {
    margin: 0;
    color: var(--text-muted);
  }
  .drop-hint {
    position: absolute;
    inset: var(--space-3);
    z-index: 190000;
    display: grid;
    place-items: center;
    border: 2px dashed var(--border-focus);
    border-radius: var(--radius-lg);
    background: rgb(0 0 0 / 0.35);
    color: var(--text-strong);
    font-size: var(--text-lg);
    pointer-events: none;
  }
  .starter {
    justify-self: center;
    margin-top: var(--space-4);
    height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-control);
    color: var(--text-default);
    cursor: pointer;
    pointer-events: auto;
  }
  .starter:hover {
    background: var(--surface-control-hover);
  }
  .hint strong {
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
  }
</style>
