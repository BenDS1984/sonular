<!--
  The mixer strip of an audio track: its name and colour, a stereo meter with a fader, and mute and
  solo. The same settings as on the track's name on the timeline. Click the name to rename it.
-->
<script lang="ts">
  import { engineState, meterValueIn } from '../../engine/engine.svelte';
  import { AUDIO_MAX_LEVEL, renameAudioTrack } from '../../patch/audioTracks';
  import type { AudioTrack } from '../../patch/types';
  import { channelColor } from '../channelColors';
  import Fader from '../components/Fader.svelte';
  import Meter from '../components/Meter.svelte';
  import Toggle from '../components/Toggle.svelte';

  let { track }: { track: AudioTrack } = $props();

  /** Same height as the patch channels' meters, so the strips read alike. */
  const METER_HEIGHT = 168;

  let editing = $state(false);
  let draft = $state('');
  let input: HTMLInputElement | undefined = $state();

  function startRename() {
    draft = track.name;
    editing = true;
    queueMicrotask(() => input?.select());
  }

  function finishRename(save: boolean) {
    if (!editing) return;
    editing = false;
    if (save) renameAudioTrack(track, draft);
  }

  // Clip lamps: clicking either one clears both.
  let clipL = $state(false);
  let clipR = $state(false);
  const resetClip = () => {
    clipL = false;
    clipR = false;
  };

  const meterL = $derived(engineState.playing ? meterValueIn('audio', track.id, 'meterL') : 0);
  const meterR = $derived(engineState.playing ? meterValueIn('audio', track.id, 'meterR') : 0);
</script>

<div class="channel" style:--channel-color={channelColor(track.color)}>
  <div class="name-bar">
    <span class="swatch" aria-hidden="true"></span>
    {#if editing}
      <input
        class="name-input"
        bind:this={input}
        bind:value={draft}
        aria-label="Audio track name"
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
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events (the name can also be changed on the timeline) -->
      <span class="name" title="Click to rename" onclick={startRename}>{track.name}</span>
    {/if}
  </div>

  <div class="main">
    <div class="meters">
      <Meter level={meterL} height={METER_HEIGHT} width={8} label="Channel left" faderScale bind:clipped={clipL} onresetclip={resetClip} />
      <Meter level={meterR} height={METER_HEIGHT} width={8} label="Channel right" faderScale bind:clipped={clipR} onresetclip={resetClip} />
    </div>
    <div class="fader">
      <Fader bind:value={track.level} defaultValue={1} max={AUDIO_MAX_LEVEL} height={METER_HEIGHT} label={`Level of ${track.name}`} />
    </div>
  </div>

  <div class="buttons">
    <Toggle pressed={track.mute} label="M" title="Mute" tone="danger" onchange={(p) => (track.mute = p)} />
    <Toggle pressed={track.solo} label="S" title="Solo" tone="accent" onchange={(p) => (track.solo = p)} />
  </div>
</div>

<style>
  .channel {
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
    border-radius: 50%;
    border: 1px solid var(--border-strong);
    background: var(--channel-color);
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
  .fader {
    padding-top: 7px;
  }
  .buttons {
    display: flex;
    justify-content: center;
    gap: 4px;
  }
</style>
