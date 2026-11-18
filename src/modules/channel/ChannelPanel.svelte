<!--
  The Channel strip: the patch's name and colour, a fader with stereo meter, pan, mute/solo and
  two sends (not active yet). The name and colour belong to the patch, so they also show on its
  tab and in the mixer.
-->
<script lang="ts">
  import Fader from '../../ui/components/Fader.svelte';
  import Meter from '../../ui/components/Meter.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import { patch } from '../../patch/patch.svelte';
  import { CHANNEL_COLORS, channelColor } from '../../ui/channelColors';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const levelSpec = $derived(def.params.find((p) => p.id === 'level')!);

  // ---------- Name (double-click to rename) ----------
  let editing = $state(false);
  let draft = $state('');
  let input: HTMLInputElement | undefined = $state();

  function startRename() {
    draft = patch.name;
    editing = true;
    queueMicrotask(() => input?.select());
  }

  function finishRename(save: boolean) {
    if (!editing) return;
    editing = false;
    const name = draft.trim();
    if (save && name) patch.name = name;
  }

  // ---------- Colour ----------
  let paletteOpen = $state(false);
</script>

<div class="channel" style:--channel-color={channelColor(patch.color)}>
  <div class="name-bar">
    <button
      class="swatch"
      type="button"
      title="Channel colour"
      aria-label="Choose channel colour"
      aria-expanded={paletteOpen}
      onclick={() => (paletteOpen = !paletteOpen)}
    ></button>
    {#if editing}
      <input
        class="name-input"
        bind:this={input}
        bind:value={draft}
        aria-label="Patch name"
        maxlength="40"
        spellcheck="false"
        onkeydown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') finishRename(true);
          else if (e.key === 'Escape') finishRename(false);
        }}
        onblur={() => finishRename(true)}
      />
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions (the name is also renamed from the tabs and mixer) -->
      <span class="name" title="Double-click to rename" ondblclick={startRename}>{patch.name}</span>
    {/if}
  </div>

  {#if paletteOpen}
    <div class="palette" role="listbox" aria-label="Channel colour">
      {#each CHANNEL_COLORS as c, i (c.name)}
        <button
          class="chip"
          class:current={i === patch.color}
          type="button"
          role="option"
          aria-selected={i === patch.color}
          title={c.name}
          aria-label={c.name}
          style:background={c.value}
          onclick={() => {
            patch.color = i;
            paletteOpen = false;
          }}
        ></button>
      {/each}
    </div>
  {/if}

  <div class="main">
    <Fader bind:value={module.params['level']!} defaultValue={levelSpec.default} max={levelSpec.max} height={150} />
    <div class="meters">
      <Meter level={meterValue(module.id, 'meterL')} height={150} width={8} label="Channel left" />
      <Meter level={meterValue(module.id, 'meterR')} height={150} width={8} label="Channel right" />
    </div>
  </div>

  <div class="row">
    <ParamKnob {module} {def} param="pan" size="sm" />
    <div class="buttons">
      <Toggle
        pressed={(module.params['mute'] ?? 0) >= 0.5}
        label="M"
        title="Mute"
        tone="danger"
        onchange={(p) => (module.params['mute'] = p ? 1 : 0)}
      />
      <Toggle
        pressed={(module.params['solo'] ?? 0) >= 0.5}
        label="S"
        title="Solo"
        tone="accent"
        onchange={(p) => (module.params['solo'] = p ? 1 : 0)}
      />
    </div>
  </div>

  <div class="row sends" title="Sends: active once there are effect channels">
    <ParamKnob {module} {def} param="send1" size="sm" />
    <ParamKnob {module} {def} param="send2" size="sm" />
  </div>
</div>

<style>
  .channel {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .name-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 6px;
    border-radius: var(--radius-sm);
    border-left: 4px solid var(--channel-color);
    background: color-mix(in srgb, var(--channel-color) 18%, transparent);
  }
  .swatch {
    flex: none;
    width: 14px;
    height: 14px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: var(--channel-color);
    cursor: pointer;
  }
  .name,
  .name-input {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-strong);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
    cursor: text;
  }
  .name-input {
    height: 20px;
    padding: 0 4px;
    border: 1px solid var(--border-focus);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    font-family: inherit;
  }
  .palette {
    position: absolute;
    top: 28px;
    left: 0;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(6, 18px);
    gap: 6px;
    padding: 8px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-default);
    background: var(--surface-raised, var(--surface-control));
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.45);
  }
  .chip {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }
  .chip.current {
    border-color: var(--text-strong);
  }
  .main {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 6px;
  }
  .meters {
    display: flex;
    gap: 3px;
  }
  .row {
    display: flex;
    justify-content: space-around;
    align-items: center;
  }
  .buttons {
    display: flex;
    gap: 4px;
  }
  .sends {
    padding-top: var(--space-2);
    border-top: 1px solid var(--border-subtle);
  }
</style>
