<!--
  A compact level control for a track on the timeline: a thin stereo peak meter above a level slider.
  Both use the mixer fader's dB scale, so the slider is the same control as the mixer's fader
  (+6 dB at the right end, 0 dB at 80 %). Double-click the slider for its default.
  `meterL` and `meterR` are linear peak amplitudes (1.0 = 0 dBFS).
-->
<script lang="ts">
  import { dbToPos, gainToPos, posToDb } from '../faderScale';
  import { formatGainDb } from '../format';

  interface Props {
    /** Linear gain, 0 … `max`. */
    value: number;
    onchange: (value: number) => void;
    defaultValue?: number;
    max?: number;
    meterL: number;
    meterR: number;
    label: string;
  }

  let { value, onchange, defaultValue = 1, max = 2, meterL, meterR, label }: Props = $props();

  const maxDb = $derived(20 * Math.log10(max));
  const pos = $derived(gainToPos(value));

  function posToGain(p: number): number {
    if (p <= 0) return 0;
    const db = Math.min(posToDb(p), maxDb);
    return db === -Infinity ? 0 : Math.pow(10, db / 20);
  }

  /** How much of a meter bar is lit, 0..1 (on the fader's dB scale). */
  const lit = (level: number) => gainToPos(level);

  // Colour zones: green below −12 dB, yellow up to 0 dB, red above (the mixer meters' own colours).
  const warn = `${(dbToPos(-12) * 100).toFixed(1)}%`;
  const clip = `${(dbToPos(0) * 100).toFixed(1)}%`;
</script>

<div class="level" title={`${label}: ${formatGainDb(value)}`}>
  <div class="meters" aria-hidden="true" style:--warn={warn} style:--clip={clip}>
    <div class="bar"><div class="lit" style:clip-path={`inset(0 ${(1 - lit(meterL)) * 100}% 0 0)`}></div></div>
    <div class="bar"><div class="lit" style:clip-path={`inset(0 ${(1 - lit(meterR)) * 100}% 0 0)`}></div></div>
  </div>
  <input
    type="range"
    min="0"
    max="1"
    step="0.001"
    value={pos}
    aria-label={label}
    aria-valuetext={formatGainDb(value)}
    oninput={(e) => onchange(posToGain(Number((e.currentTarget as HTMLInputElement).value)))}
    ondblclick={() => onchange(defaultValue)}
  />
</div>

<style>
  .level {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .meters {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .bar {
    height: 3px;
    border-radius: 1px;
    background: var(--surface-inset);
  }
  .lit {
    height: 100%;
    background: linear-gradient(
      to right,
      var(--meter-low) 0%,
      var(--meter-low) var(--warn),
      var(--meter-mid) var(--warn),
      var(--meter-mid) var(--clip),
      var(--meter-high) var(--clip)
    );
    transition: clip-path 60ms linear;
  }
  input {
    width: 100%;
    height: 12px;
    margin: 0;
    accent-color: var(--track-color, var(--border-focus));
  }
</style>
