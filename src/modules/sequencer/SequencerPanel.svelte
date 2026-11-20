<script lang="ts">
  import Led from '../../ui/components/Led.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import { engineState, meterValue } from '../../engine/engine.svelte';
  import { activePatch } from '../../patch/patch.svelte';
  import { showOnTimeline } from '../../ui/focus.svelte';
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

  // Who decides what plays: the timeline (when this sequencer has blocks and the patch is not
  // Free), or the pattern chosen here.
  const owner = $derived(activePatch());
  const hasBlocks = $derived(owner.clips.some((c) => c.module === module.id));
  const status = $derived.by(() => {
    if (owner.free) return { kind: 'free', text: `Free: plays pattern ${bankLetter(bank)}` };
    if (!hasBlocks) return { kind: 'own', text: `No blocks on the timeline: plays pattern ${bankLetter(bank)}` };
    if (!engineState.playing) return { kind: 'follows', text: 'Timeline: plays its blocks' };
    if (playing >= 0) return { kind: 'timeline', text: `Timeline: plays pattern ${bankLetter(playing)}` };
    return { kind: 'silent', text: 'Timeline: silent here (no block)' };
  });

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
      class:playing={b === playing}
      aria-checked={b === bank}
      style:--bank-color={bankColor(b)}
      style:--bank-bg={bankColor(b, 30, 0.45)}
      style:--bank-dim={bankColor(b, 26, 0.3)}
      title={`Edit pattern ${bankLetter(b)}${b === playing ? ' (playing now)' : ''}`}
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

<button
  type="button"
  class="status {status.kind}"
  style:--bank-color={bankColor(status.kind === 'timeline' ? playing : bank)}
  title="Show this sequencer on the timeline"
  onclick={() => showOnTimeline(owner.id, module.id)}
>
  <span class="status-dot" aria-hidden="true"></span>
  <span class="status-text">{status.text}</span>
  <span class="status-link">Timeline ↗</span>
</button>

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
  /* Each pattern keeps its own colour, the same as its blocks on the timeline. */
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
  /* The pattern playing now: lit. */
  .bank.playing {
    background: var(--bank-color);
    color: #101215;
    box-shadow: 0 0 6px var(--bank-color);
  }
  .bank.playing.selected {
    border-color: var(--text-strong);
  }
  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 20px;
    margin-bottom: var(--space-2);
    padding: 0 6px;
    border: 0;
    border-radius: var(--radius-sm);
    background: rgb(255 255 255 / 0.04);
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-align: left;
    cursor: pointer;
  }
  .status:hover {
    background: rgb(255 255 255 / 0.09);
    color: var(--text-default);
  }
  .status-dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
  }
  .status.timeline,
  .status.own,
  .status.follows {
    color: var(--text-default);
  }
  .status.timeline .status-dot {
    background: var(--bank-color);
    box-shadow: 0 0 5px var(--bank-color);
  }
  .status.own .status-dot {
    background: var(--bank-color);
  }
  .status.free .status-dot {
    background: var(--border-focus);
  }
  .status-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-link {
    flex: none;
    opacity: 0.7;
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
