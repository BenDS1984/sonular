<!--
  One group of modules on the canvas (see ModuleGroup). Expanded: a frame around its modules with a
  grey bar on top (like the header of the Output module). Collapsed: that bar alone; its modules
  are hidden and the cables that come in or go out attach to it. Dragging the bar moves the whole
  group; double-click the name (or use the pencil) to rename it.
-->
<script lang="ts">
  import { canvasState, groupLayer, patch, toggleGroupCollapsed, ungroup } from '../../patch/patch.svelte';
  import { barRect, frameRect, GROUP_HEADER } from '../../patch/groups';
  import { snap } from '../../patch/geometry';
  import type { ModuleGroup } from '../../patch/types';
  import EditableName from '../components/EditableName.svelte';

  interface Props {
    group: ModuleGroup;
  }

  let { group }: Props = $props();

  const frame = $derived(frameRect(patch, group, canvasState.moduleSizes));
  const bar = $derived(barRect(patch, group, canvasState.moduleSizes));
  const rect = $derived(group.collapsed ? bar : frame);

  let nameField: EditableName | undefined = $state();

  /** An empty name goes back to the default one. */
  function rename(name: string) {
    const n = (patch.groups ?? []).findIndex((g) => g.id === group.id) + 1;
    group.name = name.slice(0, 40) || `Group ${n}`;
  }

  function ondragstart(e: PointerEvent) {
    if (e.button !== 0) return;
    // Buttons and the name field (while it is being edited) keep their own clicks.
    if ((e.target as HTMLElement).closest('button, input')) return;
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
</script>

{#if rect}
  <div
    class="group-view"
    class:collapsed={group.collapsed}
    class:joining={canvasState.groupHint?.groupId === group.id && canvasState.groupHint.kind === 'in'}
    class:leaving={canvasState.groupHint?.groupId === group.id && canvasState.groupHint.kind === 'out'}
    role="group"
    aria-label={`Group ${group.name}`}
    title={group.collapsed ? `${group.moduleIds.length} modules` : undefined}
    style:left={`${rect.x}px`}
    style:top={`${rect.y}px`}
    style:width={`${rect.w}px`}
    style:height={`${rect.h}px`}
    style:z-index={group.collapsed ? undefined : groupLayer(group.moduleIds)}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions (dragging by the bar is a mouse affordance, like a module header) -->
    <header
      class="head"
      style:height={group.collapsed ? '100%' : `${GROUP_HEADER}px`}
      onpointerdown={ondragstart}
      ondblclick={(e) => nameField?.isAt(e.clientX, e.clientY) && nameField.start()}
    >
      <h3 class="title">
        <EditableName
          bind:this={nameField}
          text={group.name}
          value={group.name}
          placeholder="Group name"
          label="Group name"
          title="Drag the bar to move the group; double-click to rename"
          onrename={rename}
        />
      </h3>
      <span class="spacer"></span>
      <button type="button" onclick={() => toggleGroupCollapsed(group.id)} title={group.collapsed ? 'Show the modules' : 'Hide the modules'}>
        {group.collapsed ? 'Expand' : 'Collapse'}
      </button>
      <button type="button" onclick={() => ungroup(group.id)} title="Dissolve the group; the modules stay where they are">
        Ungroup
      </button>
    </header>
  </div>
{/if}

<style>
  .group-view {
    position: absolute;
    box-sizing: border-box;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    /* Solid, so a module from outside the group that lies under it is not seen through it. */
    background: color-mix(in srgb, var(--bg-canvas) 94%, white);
    box-shadow: var(--shadow-module);
    user-select: none;
    /* Just below its own modules (z-index is set from the modules' stacking); only the grey bar takes the mouse. */
    pointer-events: none;
  }
  /* While dragging a module: a bright frame means "it joins when you let go", a dashed one "it leaves". */
  .group-view.joining {
    border-color: var(--border-focus);
    box-shadow:
      0 0 0 2px var(--border-focus),
      var(--shadow-module);
  }
  .group-view.leaving {
    border-style: dashed;
    border-color: var(--danger);
    opacity: 0.85;
  }
  .group-view.collapsed {
    z-index: 100001;
    background: var(--surface-module);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    box-sizing: border-box;
    padding: 0 var(--space-2) 0 var(--space-3);
    background: var(--sheen-header), var(--family-output);
    border-bottom: 1px solid rgb(0 0 0 / 0.25);
    box-shadow: 0 1px 0 rgb(255 255 255 / 0.15) inset;
    border-radius: calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0 0;
    cursor: grab;
    touch-action: none;
    pointer-events: auto;
  }
  .collapsed .head {
    border-bottom: 0;
    border-radius: calc(var(--radius-lg) - 1px);
  }
  .head:active {
    cursor: grabbing;
  }
  .title {
    margin: 0;
    min-width: 0;
    display: flex;
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-strong);
    letter-spacing: 0.01em;
  }
  .spacer {
    flex: 1;
  }
  button {
    height: 20px;
    padding: 0 var(--space-2);
    border: 1px solid rgb(0 0 0 / 0.3);
    border-radius: var(--radius-sm);
    background: rgb(0 0 0 / 0.2);
    color: var(--text-strong);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  button:hover {
    background: rgb(0 0 0 / 0.35);
  }
</style>
