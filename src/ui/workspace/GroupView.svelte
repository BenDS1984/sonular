<!--
  One group of modules on the canvas (see ModuleGroup). Expanded: a frame with a title strip around
  its modules. Collapsed: one small bar; its modules are hidden and the cables that come in or go
  out attach to the bar. Dragging the title strip or the bar moves the whole group.
-->
<script lang="ts">
  import { canvasState, patch, toggleGroupCollapsed, ungroup } from '../../patch/patch.svelte';
  import { barRect, frameRect, GROUP_HEADER } from '../../patch/groups';
  import { snap } from '../../patch/geometry';
  import type { ModuleGroup } from '../../patch/types';

  interface Props {
    group: ModuleGroup;
  }

  let { group }: Props = $props();

  const frame = $derived(frameRect(patch, group, canvasState.moduleSizes));
  const bar = $derived(barRect(patch, group, canvasState.moduleSizes));
  const rect = $derived(group.collapsed ? bar : frame);

  function ondragstart(e: PointerEvent) {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input')) return;
    e.preventDefault();
    e.stopPropagation();
    const head = e.currentTarget as HTMLElement;
    head.setPointerCapture(e.pointerId);
    canvasState.selection = null;
    const members = group.moduleIds.flatMap((id) => {
      const m = patch.modules.find((x) => x.id === id);
      return m ? [{ m, x: m.x, y: m.y }] : [];
    });
    const startX = e.clientX;
    const startY = e.clientY;
    const move = (ev: PointerEvent) => {
      const zoom = patch.view.zoom;
      const dx = snap((ev.clientX - startX) / zoom);
      const dy = snap((ev.clientY - startY) / zoom);
      for (const o of members) {
        o.m.x = o.x + dx;
        o.m.y = o.y + dy;
      }
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  }

  const title = (e: Event) => {
    const name = (e.currentTarget as HTMLInputElement).value;
    group.name = name.slice(0, 40);
  };
</script>

{#if rect}
  <div
    class="group-view"
    class:collapsed={group.collapsed}
    role="group"
    aria-label={`Group ${group.name}`}
    title={group.collapsed ? `${group.moduleIds.length} modules` : undefined}
    style:left={`${rect.x}px`}
    style:top={`${rect.y}px`}
    style:width={`${rect.w}px`}
    style:height={`${rect.h}px`}
  >
    <div class="head" style:height={`${GROUP_HEADER}px`} onpointerdown={ondragstart} role="presentation">
      <input class="name" value={group.name} oninput={title} maxlength="40" aria-label="Group name" spellcheck="false" />
      <button type="button" onclick={() => toggleGroupCollapsed(group.id)} title={group.collapsed ? 'Show the modules' : 'Hide the modules'}>
        {group.collapsed ? 'Expand' : 'Collapse'}
      </button>
      <button type="button" onclick={() => ungroup(group.id)} title="Dissolve the group; the modules stay where they are">
        Ungroup
      </button>
    </div>
  </div>
{/if}

<style>
  .group-view {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    background: rgb(255 255 255 / 0.03);
    /* Behind the modules and the cables' hit layer; only the title strip takes the mouse. */
    z-index: -2;
    pointer-events: none;
  }
  .group-view.collapsed {
    z-index: 100001;
    background: var(--surface-control);
    box-shadow: var(--shadow-recess);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2);
    box-sizing: border-box;
    cursor: grab;
    pointer-events: auto;
  }
  .name {
    flex: 1;
    min-width: 60px;
    height: 20px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-strong);
    font: inherit;
    font-size: var(--text-sm);
  }
  .name:hover,
  .name:focus {
    border-color: var(--border-strong);
    background: var(--bg-canvas);
  }
  button {
    height: 20px;
    padding: 0 var(--space-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  button:hover {
    background: var(--surface-control-hover);
  }
</style>
