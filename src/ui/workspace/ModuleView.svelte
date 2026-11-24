<!--
  One module instance on the canvas: positions the panel, handles dragging by the header,
  and reports where its jacks are so cables can attach to them.
-->
<script lang="ts">
  import ModulePanel from '../components/ModulePanel.svelte';
  import Port from '../components/Port.svelte';
  import { getDefinition } from '../../modules/registry';
  import { canvasState, patch, raiseModule, removeModule, selectModule } from '../../patch/patch.svelte';
  import { snap } from '../../patch/geometry';
  import { isPortConnected } from '../../patch/operations';
  import type { ModuleInstance } from '../../patch/types';
  import { defaultTitle, moduleLabel, moduleTooltip, renameModule } from '../../patch/moduleNames';
  import { interaction, isValidTarget } from './interaction.svelte';
  import { startAutoPan } from './autoPan';

  interface Props {
    module: ModuleInstance;
  }

  let { module }: Props = $props();

  const def = $derived(getDefinition(module.type));
  const selected = $derived(
    (canvasState.selection?.kind === 'module' && canvasState.selection.id === module.id) ||
      (canvasState.selection?.kind === 'modules' && canvasState.selection.ids.includes(module.id)),
  );

  let root: HTMLDivElement | undefined = $state();

  // Measure jack centres relative to the module, in canvas pixels (undoing the zoom).
  function measure() {
    if (!root) return;
    const zoom = patch.view.zoom;
    const base = root.getBoundingClientRect();
    for (const jack of root.querySelectorAll<HTMLElement>('[data-port]')) {
      const r = jack.getBoundingClientRect();
      canvasState.portOffsets[`${module.id}:${jack.dataset.port}`] = {
        x: (r.left + r.width / 2 - base.left) / zoom,
        y: (r.top + r.height / 2 - base.top) / zoom,
      };
    }
    canvasState.moduleSizes[module.id] = { w: base.width / zoom, h: base.height / zoom };
  }

  $effect(() => {
    if (!root) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    return () => ro.disconnect();
  });

  function onheaderpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    // Dragging a module of a selected group moves the whole group; otherwise just this module.
    const sel = canvasState.selection;
    const inGroup = sel?.kind === 'modules' && sel.ids.includes(module.id);
    if (inGroup) raiseModule(module.id);
    else selectModule(module.id);
    const header = e.currentTarget as HTMLElement;
    header.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = module.x;
    const origY = module.y;
    const others = (inGroup ? sel.ids : [])
      .filter((id) => id !== module.id)
      .flatMap((id) => {
        const m = patch.modules.find((x) => x.id === id);
        return m ? [{ m, x: m.x, y: m.y }] : [];
      });
    let moved = false;
    // Where the canvas was: when it scrolls along at an edge, the module keeps up with it.
    const viewX = patch.view.x;
    const viewY = patch.view.y;
    let last = { clientX: e.clientX, clientY: e.clientY };
    const place = () => {
      const zoom = patch.view.zoom;
      module.x = snap(origX + (last.clientX - startX - (patch.view.x - viewX)) / zoom);
      module.y = snap(origY + (last.clientY - startY - (patch.view.y - viewY)) / zoom);
      if (module.x !== origX || module.y !== origY) moved = true;
      for (const o of others) {
        o.m.x = o.x + module.x - origX;
        o.m.y = o.y + module.y - origY;
      }
    };
    const pan = startAutoPan(() => header.closest<HTMLElement>('.workspace'), place);
    const move = (ev: PointerEvent) => {
      last = { clientX: ev.clientX, clientY: ev.clientY };
      place();
      pan.update(ev);
    };
    const up = () => {
      pan.stop();
      if (inGroup && !moved) selectModule(module.id); // a plain click inside a group selects just this one
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', up);
      header.removeEventListener('pointercancel', up);
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
    header.addEventListener('pointercancel', up);
  }

  const connected = (port: string, kind: 'in' | 'out') => isPortConnected(patch, { module: module.id, port }, kind);
  const target = (port: string, kind: 'in' | 'out') => isValidTarget({ module: module.id, port }, kind);
  const active = (port: string) =>
    interaction.cable?.target?.module === module.id && interaction.cable.target.port === port;
</script>

{#if def}
  <div
    class="module-view"
    bind:this={root}
    style:left={`${module.x}px`}
    style:top={`${module.y}px`}
    style:z-index={canvasState.zIndex[module.id] ?? 0}
    onpointerdown={() => {
      if (!selected || canvasState.selection?.kind !== 'modules') selectModule(module.id);
    }}
    role="group"
    aria-label={`${def.title} ${module.id}`}
  >
    <ModulePanel
      title={moduleLabel(def, module)}
      rename={{
        value: module.name ?? '',
        placeholder: defaultTitle(def, module),
        tooltip: moduleTooltip(def, module),
        onrename: (name) => renameModule(module, name),
      }}
      signal={def.signal}
      family={def.category}
      width={def.width}
      {selected}
      {onheaderpointerdown}
      onremove={() => removeModule(module.id)}
    >
      <def.panel {module} {def} />
      {#snippet ports()}
        <div class="group">
          {#each def.inputs as p (p.id)}
            <Port
              kind="in"
              signal={p.signal}
              label={p.label}
              moduleId={module.id}
              portId={p.id}
              connected={connected(p.id, 'in')}
              target={target(p.id, 'in')}
              active={active(p.id)}
            />
          {/each}
        </div>
        <div class="group" class:plate={def.outputs.length > 0}>
          {#each def.outputs as p (p.id)}
            <Port
              kind="out"
              signal={p.signal}
              label={p.label}
              moduleId={module.id}
              portId={p.id}
              connected={connected(p.id, 'out')}
              target={target(p.id, 'out')}
              active={active(p.id)}
            />
          {/each}
        </div>
      {/snippet}
    </ModulePanel>
  </div>
{/if}

<style>
  .module-view {
    position: absolute;
  }
  .group {
    display: flex;
    gap: var(--space-2);
  }
  /* Outputs sit on a darker plate, so inputs and outputs are told apart at a glance. */
  .plate {
    margin: -4px -6px -6px;
    padding: 4px 6px 6px;
    background: var(--surface-plate);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-recess);
  }
</style>
