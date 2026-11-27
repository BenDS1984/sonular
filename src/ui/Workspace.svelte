<!--
  The patching canvas.

  Mouse:
  - drag empty space (or middle mouse anywhere) to pan; scroll to pan, Ctrl + scroll to zoom
  - Shift + drag on empty space draws a frame that selects every module it touches; dragging one
    of them by its header moves them all, Delete removes them all
  - "Group" (or Ctrl+G) puts the selected modules in a group with a frame and a name; Collapse
    turns the group into one small bar (the sound does not change), Ungroup dissolves it
  - drag a module by its header; click to select
  - drag from a jack to patch a cable; drag a connected input to move/remove its cable
  - while dragging a module or a cable near an edge, the canvas scrolls along
  - double-click empty space to search the browser for a module to add there
  - drop a module from the browser to add it there; drop a .sonular file to open it
  Keyboard: Delete/Backspace removes the selection, Escape cancels.
-->
<script lang="ts">
  import ModuleView from './workspace/ModuleView.svelte';
  import CableLayer from './workspace/CableLayer.svelte';
  import ZoomControls from './workspace/ZoomControls.svelte';
  import Minimap from './workspace/Minimap.svelte';
  import ModuleMenu from './workspace/ModuleMenu.svelte';
  import { prefs } from './prefs.svelte';
  import GroupView from './workspace/GroupView.svelte';
  import {
    canGroupSelection,
    canvasState,
    deleteSelection,
    fitAll,
    groupSelection,
    isHidden,
    isPatchEmpty,
    patch,
    selectedModuleIds,
    selectModules,
  } from '../patch/patch.svelte';
  import { loadStarterPatch } from '../patch/fileActions';
  import { GRID, toCanvas, zoomAt } from '../patch/geometry';
  import { getDefinition } from '../modules/registry';
  import { openPatchFile } from '../patch/fileActions';
  import { beginCableDrag, cancelCableDrag, endCableDrag, interaction, updateCableDrag } from './workspace/interaction.svelte';
  import { placeModule } from './workspace/placeModule';
  import { startAutoPan } from './workspace/autoPan';
  import { MODULE_DRAG_TYPE, requestBrowserSearch, sideBrowser } from './browser/browserPanel.svelte';

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
    // Near an edge the canvas scrolls; the cable end stays under the pointer.
    let last = { clientX: e.clientX, clientY: e.clientY };
    const pan = startAutoPan(
      () => el,
      () => updateCableDrag(canvasPoint(last), patch.view.zoom),
    );
    const move = (ev: PointerEvent) => {
      last = { clientX: ev.clientX, clientY: ev.clientY };
      updateCableDrag(canvasPoint(ev), patch.view.zoom);
      pan.update(ev);
    };
    const up = () => {
      pan.stop();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      endCableDrag();
    };
    const cancel = () => {
      pan.stop();
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

  // ---------- Frame selection (Shift + drag on empty space) ----------

  /** The frame being dragged, in canvas-element pixels. */
  let frame = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  function startFrame(e: PointerEvent) {
    const p0 = local(e);
    frame = { x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y };
    canvasState.selection = null;
    el!.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const p = local(ev);
      frame = { x0: p0.x, y0: p0.y, x1: p.x, y1: p.y };
      // Live: the modules the frame touches light up while dragging.
      const a = toCanvas(patch.view, Math.min(frame.x0, frame.x1), Math.min(frame.y0, frame.y1));
      const b = toCanvas(patch.view, Math.max(frame.x0, frame.x1), Math.max(frame.y0, frame.y1));
      const ids = patch.modules
        .filter((m) => !isHidden(m.id))
        .filter((m) => {
          const s = canvasState.moduleSizes[m.id] ?? { w: 200, h: 240 };
          return m.x < b.x && m.x + s.w > a.x && m.y < b.y && m.y + s.h > a.y;
        })
        .map((m) => m.id);
      selectModules(ids);
    };
    const end = () => {
      el!.removeEventListener('pointermove', move);
      el!.removeEventListener('pointerup', end);
      el!.removeEventListener('pointercancel', end);
      frame = null;
    };
    el!.addEventListener('pointermove', move);
    el!.addEventListener('pointerup', end);
    el!.addEventListener('pointercancel', end);
  }

  function onpointerdown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const jack = target.closest<HTMLElement>('[data-port]');
    if (jack && e.button === 0) {
      startJackDrag(jack, e);
      return;
    }
    if (e.button === 0 && e.shiftKey && (target === el || target.classList.contains('world'))) {
      e.preventDefault();
      startFrame(e);
      return;
    }
    if (e.button === 1 || (e.button === 0 && (target === el || target.classList.contains('world')))) {
      e.preventDefault();
      startPan(e);
    }
  }

  function onwheel(e: WheelEvent) {
    // Everywhere on the canvas (knobs too) the wheel pans or zooms.
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
    requestBrowserSearch(toCanvas(patch.view, p.x, p.y));
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

  const fit = fitAll;

  /** Hide or show the cables; a hidden cable cannot stay selected (Delete would remove it unseen). */
  function toggleCables() {
    prefs.cablesVisible = !prefs.cablesVisible;
    if (!prefs.cablesVisible && canvasState.selection?.kind === 'cable') canvasState.selection = null;
  }


  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      if (canGroupSelection()) groupSelection();
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (canvasState.selection) {
        deleteSelection();
        e.preventDefault();
      }
    } else if (e.key === 'Escape') {
      if (interaction.cable) cancelCableDrag();
      else if (sideBrowser.place) sideBrowser.place = null;
      else canvasState.selection = null;
    }
  }

  // ---------- Dropping a module from the browser, or a patch file, onto the canvas ----------

  let dropping = $state(false);

  const hasType = (e: DragEvent, type: string) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes(type);

  function ondragover(e: DragEvent) {
    if (hasType(e, MODULE_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
      return;
    }
    if (!hasType(e, 'Files')) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    dropping = true;
  }

  function ondrop(e: DragEvent) {
    if (hasType(e, MODULE_DRAG_TYPE)) {
      e.preventDefault();
      const def = getDefinition(e.dataTransfer!.getData(MODULE_DRAG_TYPE));
      if (def) placeModule(def, canvasPoint(e));
      return;
    }
    if (!hasType(e, 'Files')) return;
    e.preventDefault();
    dropping = false;
    const file = e.dataTransfer!.files[0];
    if (file) void openPatchFile(file);
  }
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
    {#each patch.groups ?? [] as group (group.id)}
      <GroupView {group} />
    {/each}
    {#each patch.modules as module (`${module.id}:${module.type}`)}
      <ModuleView {module} />
    {/each}
    <CableLayer onjackpointerdown={startJackDrag} />
  </div>

  {#if canGroupSelection() && !frame}
    <button type="button" class="group-button" onpointerdown={(e) => e.stopPropagation()} onclick={groupSelection}>
      Group {selectedModuleIds().length} modules
    </button>
  {/if}

  {#if frame}
    <div
      class="frame"
      style:left={`${Math.min(frame.x0, frame.x1)}px`}
      style:top={`${Math.min(frame.y0, frame.y1)}px`}
      style:width={`${Math.abs(frame.x1 - frame.x0)}px`}
      style:height={`${Math.abs(frame.y1 - frame.y0)}px`}
    ></div>
  {/if}

  {#if isPatchEmpty()}
    <div class="empty">
      <p class="title">Your patch is empty</p>
      <p class="hint">Drag a module from the <strong>Browser</strong> on the left, or double-click here to search one.</p>
      <button
        type="button"
        class="starter"
        onpointerdown={(e) => e.stopPropagation()}
        ondblclick={(e) => e.stopPropagation()}
        onclick={() => void loadStarterPatch()}
      >
        Load the Welcome! patch
      </button>
    </div>
  {/if}

  {#if dropping}
    <div class="drop-hint">Drop a .sonular file to open it</div>
  {/if}

  {#if prefs.minimap && !isPatchEmpty()}
    <Minimap />
  {/if}

  <ModuleMenu />
  <ZoomControls
    zoom={view.zoom}
    onzoom={zoomCentered}
    onreset={resetZoom}
    onfit={fit}
    minimap={prefs.minimap}
    ontoggleminimap={() => (prefs.minimap = !prefs.minimap)}
    cablesVisible={prefs.cablesVisible}
    ontogglecables={toggleCables}
    cableOpacity={prefs.cableOpacity}
    oncableopacity={(o) => (prefs.cableOpacity = Math.min(1, Math.max(0.1, o)))}
  />

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
  .group-button {
    position: absolute;
    top: var(--space-3);
    left: 50%;
    transform: translateX(-50%);
    z-index: 190000;
    height: 30px;
    padding: 0 var(--space-4);
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-md);
    background: var(--surface-control);
    color: var(--text-strong);
    cursor: pointer;
  }
  .group-button:hover {
    background: var(--surface-control-hover);
  }
  .frame {
    position: absolute;
    z-index: 190000;
    border: 1px solid var(--border-focus);
    background: rgb(255 255 255 / 0.06);
    pointer-events: none;
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
