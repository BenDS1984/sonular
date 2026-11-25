<script lang="ts">
  import Led from '../../ui/components/Led.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import { meterValue } from '../../engine/engine.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';
  import { bankClipboard, bankColor } from './bankClipboard.svelte';
  import { bankLetter, copyBankValues, readBank, SEQUENCER_BANKS, SEQUENCER_STEPS, lenParam, stepParam } from './banks';

  let { module, def }: ModulePanelProps = $props();

  const STEPS = Array.from({ length: SEQUENCER_STEPS }, (_, i) => i + 1);
  const BANKS = Array.from({ length: SEQUENCER_BANKS }, (_, i) => i);

  // The pattern shown and played.
  const bank = $derived(Math.round(module.params['bank'] ?? 0));
  // Meter "step" is 1..8 for the step playing, 0 before the first clock pulse.
  // How many steps of this pattern play (1..8).
  const len = $derived(Math.min(SEQUENCER_STEPS, Math.max(1, Math.round(module.params[lenParam(bank)] ?? SEQUENCER_STEPS))));
  const current = $derived(Math.round(meterValue(module.id, 'step')));

  function setLen(n: number) {
    module.params[lenParam(bank)] = Math.min(SEQUENCER_STEPS, Math.max(1, n));
  }

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
      style:--bank-dim={bankColor(b, 26, 0.3)}
      title={`Play and edit pattern ${bankLetter(b)}`}
      onclick={() => (module.params['bank'] = b)}
    >
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

<div class="length">
  <span class="caption">Length</span>
  <button type="button" class="btn small" disabled={len <= 1} title="Shorter pattern" aria-label="Shorter pattern" onclick={() => setLen(len - 1)}>−</button>
  <span class="len-value" aria-live="polite">{len}</span>
  <button type="button" class="btn small" disabled={len >= SEQUENCER_STEPS} title="Longer pattern" aria-label="Longer pattern" onclick={() => setLen(len + 1)}>+</button>
  <span class="hint">steps, then back to step 1</span>
</div>

<div class="steps">
  {#each STEPS as n (n)}
    {@const onId = stepParam(bank, 'on', n)}
    {@const on = (module.params[onId] ?? 0) >= 0.5}
    <div class="step" class:off={!on} class:beyond={n > len}>
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
    flex: none;
    width: 58px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  /* Each pattern keeps its own colour. */
  .bank {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 22px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: var(--bank-dim);
    color: var(--bank-color);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    cursor: pointer;
  }
  .bank:hover {
    background: var(--bank-bg);
  }
  /* The pattern being edited: outlined. */
  .bank.selected {
    border-color: var(--bank-color);
    background: var(--bank-bg);
    color: var(--text-strong);
  }
  .btn {
    flex: 1;
    min-width: 46px;
    height: 22px;
    padding: 0 6px;
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
  .length {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: var(--space-2);
  }
  .btn.small {
    flex: none;
    min-width: 0;
    width: 30px;
    padding: 0;
  }
  .len-value {
    width: 30px;
    text-align: center;
    color: var(--text-strong);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
  }
  .hint {
    margin-left: 6px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  /* Steps after the pattern's end never play. */
  .step.beyond {
    opacity: 0.35;
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
