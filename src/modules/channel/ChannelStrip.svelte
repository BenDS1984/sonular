<!--
  A channel strip: the patch's name and colour, a stereo meter with a fader whose dB scale
  applies to both, pan with small mute/solo buttons, and two sends (not active yet). Used by the
  Channel module on the canvas and by the mixer view; the name and colour belong to the patch, so
  they also show on its tab.
-->
<script lang="ts">
  import Fader from '../../ui/components/Fader.svelte';
  import Meter from '../../ui/components/Meter.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import { isAutomated, isOverridden, isRecordingControl, openControlMenu, setControl, shownValue } from '../../ui/automation.svelte';
  import type { ModuleInstance, Patch } from '../../patch/types';
  import { CHANNEL_COLORS, channelColor } from '../../ui/channelColors';
  import type { ModuleDefinition } from '../types';

  interface Props {
    /** The patch this channel belongs to: its name and colour. */
    target: Patch;
    /** The patch's Channel module. */
    module: ModuleInstance;
    def: ModuleDefinition;
    /** Live peak levels (linear). */
    meterL: number;
    meterR: number;
    /** Rename with a single click (mixer) instead of a double-click (module on the canvas). */
    renameOnClick?: boolean;
  }

  let { target, module, def, meterL, meterR, renameOnClick = false }: Props = $props();

  /** Height of the meters and the fader travel: equal, so the fader's scale fits both. */
  const METER_HEIGHT = 168;

  const levelSpec = $derived(def.params.find((p) => p.id === 'level')!);

  // ---------- Name (double-click to rename) ----------
  let editing = $state(false);
  let draft = $state('');
  let input: HTMLInputElement | undefined = $state();

  function startRename() {
    draft = target.name;
    editing = true;
    queueMicrotask(() => input?.select());
  }

  function finishRename(save: boolean) {
    if (!editing) return;
    editing = false;
    const name = draft.trim();
    if (save && name) target.name = name;
  }

  // ---------- Clip lamps: clicking either one clears both ----------
  let clipL = $state(false);
  let clipR = $state(false);
  const resetClip = () => {
    clipL = false;
    clipR = false;
  };

  // ---------- Colour ----------
  let paletteOpen = $state(false);
</script>

<div class="channel" style:--channel-color={channelColor(target.color)}>
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
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events (the name is also renamed from the tabs) -->
      <span
        class="name"
        title={renameOnClick ? 'Click to rename' : 'Double-click to rename'}
        onclick={renameOnClick ? startRename : undefined}
        ondblclick={renameOnClick ? undefined : startRename}>{target.name}</span
      >
    {/if}
  </div>

  {#if paletteOpen}
    <div class="palette" role="listbox" aria-label="Channel colour">
      {#each CHANNEL_COLORS as c, i (c.name)}
        <button
          class="chip"
          class:current={i === target.color}
          type="button"
          role="option"
          aria-selected={i === target.color}
          title={c.name}
          aria-label={c.name}
          style:background={c.value}
          onclick={() => {
            target.color = i;
            paletteOpen = false;
          }}
        ></button>
      {/each}
    </div>
  {/if}

  <div class="main">
    <div class="meters">
      <Meter level={meterL} height={METER_HEIGHT} width={8} label="Channel left" faderScale bind:clipped={clipL} onresetclip={resetClip} />
      <Meter level={meterR} height={METER_HEIGHT} width={8} label="Channel right" faderScale bind:clipped={clipR} onresetclip={resetClip} />
    </div>
    <div class="fader">
      <!-- svelte-ignore a11y_no_static_element_interactions (right-click menu; keyboard users reach automation from the timeline) -->
      <div
        class="fader-wrap"
        class:automated={isAutomated(module, 'level')}
        class:overridden={isAutomated(module, 'level') && !isRecordingControl(module, 'level') && isOverridden(module, 'level')}
        class:recording={isRecordingControl(module, 'level')}
        oncontextmenu={(e) => openControlMenu(e, module, 'level', `${target.name} · ${levelSpec.label}`)}
      >
        <Fader
          value={shownValue(module, 'level')}
          onchange={(v) => setControl(module, 'level', v)}
          defaultValue={levelSpec.default}
          max={levelSpec.max}
          height={METER_HEIGHT}
        />
      </div>
    </div>
  </div>

  <div class="row">
    <ParamKnob {module} {def} param="pan" />
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
    gap: 4px;
  }
  .meters {
    display: flex;
    gap: 3px;
  }
  /* Line the fader's travel up with the meter bars (below their clip lamps). */
  .fader {
    padding-top: 7px;
  }
  .buttons {
    display: flex;
    gap: 4px;
  }
  .row {
    display: flex;
    justify-content: space-around;
    align-items: center;
  }
  .sends {
    padding-top: var(--space-2);
    border-top: 1px solid var(--border-subtle);
  }
  .fader-wrap {
    display: contents;
  }
  .fader-wrap.automated :global(.fader) {
    border-radius: var(--radius-sm);
    box-shadow: 0 0 0 2px var(--automation);
  }
  .fader-wrap.overridden :global(.fader) {
    box-shadow: none;
    outline: 2px dashed var(--automation);
  }
  .fader-wrap.recording :global(.fader) {
    border-radius: var(--radius-sm);
    box-shadow: 0 0 0 2px var(--danger);
  }
</style>
