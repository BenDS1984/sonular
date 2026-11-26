<script lang="ts">
  import WaveDisplay from '../../ui/components/WaveDisplay.svelte';
  import { WAVEFORM_OPTIONS } from '../../ui/waveform';
  import ParamKnob from '../ParamKnob.svelte';
  import ParamSlider from '../ParamSlider.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const waveIndex = $derived(Math.max(0, Math.min(WAVEFORM_OPTIONS.length - 1, Math.round(module.params.wave ?? 0))));
  const wave = $derived(WAVEFORM_OPTIONS[waveIndex]!.value);
  /** Only the square has a width. */
  const isSquare = $derived(wave === 'square');
</script>

<div class="osc">
  <!-- The wave screen and the wave choice are one piece: the buttons sit in a strip under the wave. -->
  <div class="screenbox lcd">
    <WaveDisplay {wave} pulseWidth={module.params.pw ?? 0.5} amplitude={Math.min(1, (module.params.level ?? 0) / 0.8)} height={58} bare />
    <div class="choice" role="radiogroup" aria-label="Waveform">
      {#each WAVEFORM_OPTIONS as opt (opt.value)}
        <button
          type="button"
          role="radio"
          aria-checked={opt.value === wave}
          class:selected={opt.value === wave}
          title={opt.title}
          onclick={() => (module.params.wave = WAVEFORM_OPTIONS.findIndex((o) => o.value === opt.value))}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>
  <div class="controls">
    <div class="knobs">
      <ParamKnob {module} {def} param="tune" />
      <ParamKnob {module} {def} param="fine" />
      <ParamKnob {module} {def} param="pw" disabled={!isSquare} />
      <ParamKnob {module} {def} param="fm" />
    </div>
    <ParamSlider {module} {def} param="level" height={118} />
  </div>
</div>

<style>
  .osc {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .screenbox {
    background: var(--surface-inset);
    /* Outer corner 10, strip padding 2, buttons 8: the rounded corners are concentric. */
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .choice {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 2px;
    padding: 2px;
    border-top: 2px solid var(--border-subtle);
  }
  .choice button {
    height: 18px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .choice button:hover {
    color: var(--text-default);
  }
  .choice button.selected {
    background: var(--signal-audio-bg);
    border-color: var(--signal-audio);
    color: var(--signal-audio-soft);
  }
  .controls {
    margin-top: 2px;
    /* Three equal columns: the two knob columns and the Level slider, evenly spread. */
    display: grid;
    grid-template-columns: 2fr 1fr;
    align-items: start;
    justify-items: center;
  }
  .knobs {
    display: grid;
    width: 100%;
    justify-items: center;
    grid-template-columns: repeat(2, 1fr);
    row-gap: 5px;
  }
</style>
