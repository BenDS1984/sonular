<script lang="ts">
  import Led from '../../ui/components/Led.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';
  import { bankClipboard, bankColor } from './bankClipboard.svelte';
  import { bankLetter, copyBankValues, readBank, SEQUENCER_BANKS, SEQUENCER_STEPS, stepParam } from './banks';

  let { module, def }: ModulePanelProps = $props();

  const STEPS = Array.from({ length: SEQUENCER_STEPS }, (_, i) => i + 1);
  const BANKS = Array.from({ length: SEQUENCER_BANKS }, (_, i) => i);

  // The bank being edited (and played when there are no timeline blocks).
  const bank = $derived(Math.round(module.params['bank'] ?? 0));
  // Meter "bank" is 1..8 for the bank playing, 0 when none plays (between timeline blocks).
  const playing = $derived(Math.round(meterValue(module.id, 'bank')) - 1);
  // Meter "step" is 1..8 for the step playing, 0 before the first clock pulse. Shown only while
  // the bank on screen is the one playing.
  const current = $derived(playing === bank ? Math.round(meterValue(module.id, 'step')) : 0);

  function copy() {
    bankClipboard.steps = readBank(module.params, bank);
    bankClipboard.from = bank;
  }

  function paste() {
    if (bankClipboard.steps) copyBankValues(module.params, bankClipboard.steps, bank);
  }
</script>

<div class="banks" role="radiogroup" aria-label="Pattern">
  <span class="caption">Pattern</span>
  {#each BANKS as b (b)}
    <button
      type="button"
      role="radio"
      class="bank"
      class:selected={b === bank}
      aria-checked={b === bank}
      style:--bank-color={bankColor(b)}
      style:--bank-bg={bankColor(b, 30, 0.45)}
      title={`Edit pattern ${bankLetter(b)}${b === playing ? ' (playing)' : ''}`}
      onclick={() => (module.params['bank'] = b)}
    >
      <span class="lamp" class:lit={b === playing} aria-hidden="true"></span>
      {bankLetter(b)}
    </button>
  {/each}
  <button type="button" class="btn" title={`Copy pattern ${bankLetter(bank)}`} onclick={copy}>Copy</button>
  <button
    type="button"
    class="btn"
    disabled={!bankClipboard.steps}
    title={bankClipboard.steps ? `Paste the copied pattern ${bankLetter(bankClipboard.from)} into pattern ${bankLetter(bank)}` : 'Copy a pattern first'}
    onclick={paste}
  >
    Paste
  </button>
</div>

<div class="steps">
  {#each STEPS as n (n)}
    {@const onId = stepParam(bank, 'on', n)}
    {@const on = (module.params[onId] ?? 0) >= 0.5}
    <div class="step" class:off={!on}>
      <Led level={current === n ? 1 : 0} signal="pitch" label={current === n ? `Step ${n} playing` : ''} />
      <ParamKnob {module} {def} param={stepParam(bank, 'pitch', n)} size="sm" />
      <Toggle
        pressed={on}
        label={on ? 'On' : 'Off'}
        title={`Step ${n} on/off`}
        tone="gate"
        onchange={(p) => (module.params[onId] = p ? 1 : 0)}
      />
    </div>
  {/each}
</div>

<style>
  .banks {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: var(--space-2);
  }
  .caption {
    margin-right: 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .bank {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    width: 30px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    cursor: pointer;
  }
  .bank:hover {
    background: var(--surface-control-hover);
    color: var(--text-default);
  }
  .bank.selected {
    border-color: var(--bank-color);
    background: var(--bank-bg);
    color: var(--text-default);
  }
  .lamp {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.12);
  }
  .lamp.lit {
    background: var(--bank-color);
    box-shadow: 0 0 5px var(--bank-color);
  }
  .btn {
    flex: 1;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    background: var(--surface-control-hover);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .steps {
    display: flex;
    justify-content: space-between;
  }
  .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 44px;
  }
  .step :global(.toggle) {
    width: 34px;
  }
  .step.off :global(.knob) {
    opacity: 0.45;
  }
</style>
