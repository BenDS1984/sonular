<!--
  Small inset screen showing an idealised waveform shape.
  (A live scope fed by the audio engine replaces the static shape later.)
-->
<script lang="ts">
  import type { SignalType } from '../signals';
  import type { Waveform } from '../waveform';

  interface Props {
    wave: Waveform;
    /** 0..1, scales the drawn amplitude. */
    amplitude?: number;
    height?: number;
    signal?: SignalType;
  }

  let { wave, amplitude = 1, height = 48, signal = 'audio' }: Props = $props();

  const W = 200;
  const CYCLES = 2;
  const POINTS = 240;

  function sample(w: Waveform, phase: number): number {
    switch (w) {
      case 'sine':
        return Math.sin(2 * Math.PI * phase);
      case 'triangle':
        return phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
      case 'saw':
        return phase < 0.5 ? 2 * phase : 2 * phase - 2;
      case 'square':
        return phase < 0.5 ? 1 : -1;
    }
  }

  const path = $derived.by(() => {
    const mid = height / 2;
    const amp = (height / 2 - 5) * Math.max(0, Math.min(1, amplitude));
    let d = '';
    let prev: number | null = null;
    for (let i = 0; i <= POINTS; i++) {
      const x = (i / POINTS) * W;
      const phase = ((i / POINTS) * CYCLES) % 1;
      const y = mid - sample(wave, phase) * amp;
      // Draw vertical edges for discontinuous shapes instead of slanted lines.
      if (prev !== null && Math.abs(y - prev) > amp) d += ` L${x.toFixed(1)} ${prev.toFixed(1)}`;
      d += `${i ? ' L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      prev = y;
    }
    return d;
  });
</script>

<div class="screen" style:height={`${height}px`} style:--wave-color={`var(--signal-${signal})`}>
  <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <line class="axis" x1="0" y1={height / 2} x2={W} y2={height / 2} />
    <path class="wave" d={path} />
  </svg>
</div>

<style>
  .screen {
    background: var(--surface-inset);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .axis {
    stroke: var(--border-subtle);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .wave {
    fill: none;
    stroke: var(--wave-color);
    stroke-width: 1.75;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
</style>
