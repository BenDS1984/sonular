<!--
  Tempo in the top bar. Type a number and press Enter, click the ▲▼ buttons (hold to keep going),
  use the arrow keys (Shift = 10 BPM), or hover and scroll. Out-of-range values are clamped; anything that is not a number is ignored.
-->
<script lang="ts">
  import { clampTempo, MAX_TEMPO, MIN_TEMPO } from '../../engine/core/Transport';

  interface Props {
    value: number;
    onchange: (bpm: number) => void;
  }

  let { value, onchange }: Props = $props();

  let input: HTMLInputElement | undefined = $state();
  let editing = $state(false);
  let draft = $state('');

  const shown = $derived(editing ? draft : String(Math.round(value)));

  function commit() {
    const n = Number(draft.replace(',', '.'));
    if (draft.trim() !== '' && Number.isFinite(n)) onchange(Math.round(clampTempo(n)));
    editing = false;
  }

  function nudge(delta: number) {
    onchange(clampTempo(Math.round(value) + delta));
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commit();
      input?.blur();
    } else if (e.key === 'Escape') {
      editing = false;
      input?.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      editing = false;
      nudge((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    }
  }

  // Holding a ▲▼ button repeats after a short pause, like a spin box.
  let repeatTimer: ReturnType<typeof setTimeout> | null = null;

  function stopRepeat() {
    if (repeatTimer) clearTimeout(repeatTimer);
    repeatTimer = null;
  }

  function startRepeat(e: PointerEvent, delta: number) {
    if (e.button !== 0) return;
    e.preventDefault(); // keep focus where it is
    stopRepeat();
    nudge(delta);
    const again = () => {
      nudge(delta);
      repeatTimer = setTimeout(again, 70);
    };
    repeatTimer = setTimeout(again, 400);
  }

  $effect(() => stopRepeat);

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    nudge(e.deltaY < 0 ? 1 : -1);
  }
</script>

<div class="tempo" role="group" aria-label="Tempo" title={`Tempo (${MIN_TEMPO}–${MAX_TEMPO} BPM): type, click ▲▼, use ↑ ↓ or scroll`} {onwheel}>
  <input
    bind:this={input}
    value={shown}
    inputmode="numeric"
    aria-label="Tempo in BPM"
    spellcheck="false"
    autocomplete="off"
    onfocus={() => {
      draft = String(Math.round(value));
      editing = true;
      requestAnimationFrame(() => input?.select());
    }}
    oninput={(e) => (draft = e.currentTarget.value)}
    onblur={() => editing && commit()}
    {onkeydown}
  />
  <span>BPM</span>
  <div class="arrows">
    <button
      type="button"
      tabindex="-1"
      aria-label="Tempo up"
      onpointerdown={(e) => startRepeat(e, 1)}
      onpointerup={stopRepeat}
      onpointerleave={stopRepeat}
      onpointercancel={stopRepeat}
    >
      <svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true"><path d="M0 5 4 0 8 5z" fill="currentColor" /></svg>
    </button>
    <button
      type="button"
      tabindex="-1"
      aria-label="Tempo down"
      onpointerdown={(e) => startRepeat(e, -1)}
      onpointerup={stopRepeat}
      onpointerleave={stopRepeat}
      onpointercancel={stopRepeat}
    >
      <svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true"><path d="M0 0 4 5 8 0z" fill="currentColor" /></svg>
    </button>
  </div>
</div>

<style>
  .tempo {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 28px;
    padding: 0 3px 0 6px;
    background: var(--surface-control);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--text-muted);
  }
  .tempo:hover {
    border-color: var(--text-muted);
  }
  .tempo:focus-within {
    border-color: var(--border-focus);
  }
  .arrows {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-left: 3px;
  }
  .arrows button {
    display: grid;
    place-items: center;
    width: 16px;
    height: 11px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .arrows button:hover {
    background: var(--surface-control-hover);
    color: var(--text-strong);
  }
  input {
    width: calc(3ch + 6px);
    padding: 0 2px;
    box-sizing: border-box;
    border: 0;
    background: transparent;
    color: var(--text-strong);
    font: inherit;
    text-align: right;
    cursor: text;
    outline: none;
  }
</style>
