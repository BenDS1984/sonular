<!--
  CPU graph: opens from the CPU meter in the top bar and stays open (also while working on the
  patch) until its close button or the CPU meter is clicked. Shows the engine's load over the last
  30 s, 2 min or 10 min, with the current value, the average and the peak over that time.
-->
<script lang="ts">
  import Segmented from './components/Segmented.svelte';
  import { cpuHistory, cpuHistoryState, engineState } from '../engine/engine.svelte';
  import { graphScale } from '../engine/cpuHistory';
  import { prefs } from './prefs.svelte';

  interface Props {
    /** The CPU meter button: the panel opens below it, kept inside the window. */
    anchor: HTMLElement;
    onclose: () => void;
  }

  let { anchor, onclose }: Props = $props();

  const PANEL_WIDTH = 332;
  // Follows the CPU meter when the window is resized.
  let resized = $state(0);
  $effect(() => {
    const onresize = () => resized++;
    window.addEventListener('resize', onresize);
    return () => window.removeEventListener('resize', onresize);
  });
  const place = $derived.by(() => {
    void resized;
    const r = anchor.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    return { top: r.bottom + 8, right: Math.min(right, window.innerWidth - PANEL_WIDTH - 8) };
  });

  const W = 300;
  const H = 110;

  const SPANS = [
    { value: '30', label: '30 s' },
    { value: '120', label: '2 min' },
    { value: '600', label: '10 min' },
  ];

  const span = $derived(prefs.cpuSpan);

  /** Everything the graph shows, recomputed whenever a point is added or the span changes. */
  const view = $derived.by(() => {
    void cpuHistoryState.version;
    // The right edge is "now": the newest point, or the current time while nothing is recorded.
    const latest = cpuHistory.latest;
    const now = Number.isNaN(latest) ? performance.now() / 1000 : latest;
    const from = now - span;
    const points = cpuHistory.since(from);
    const summary = cpuHistory.summary(from);
    const top = graphScale(summary?.peak ?? 0);
    const x = (t: number) => (((t - from) / span) * W).toFixed(1);
    const y = (v: number) => (H - Math.min(1, v / top) * (H - 2)).toFixed(1);

    // Line and filled area, broken wherever playback was stopped (NaN points).
    let line = '';
    let area = '';
    let run: { t: number; v: number }[] = [];
    const flush = () => {
      if (run.length > 1) {
        const seg = run.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)} ${y(p.v)}`).join('');
        line += seg;
        area += `${seg}L${x(run.at(-1)!.t)} ${H}L${x(run[0]!.t)} ${H}Z`;
      }
      run = [];
    };
    for (const p of points) {
      if (Number.isNaN(p.value)) flush();
      else run.push({ t: p.time, v: p.value });
    }
    flush();
    return { line, area, summary, top };
  });

  const pct = (v: number) => (v < 0.01 ? '<1%' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`);
  const scaleLabel = (v: number) => `${+(v * 100).toFixed(1)}%`;
  const current = $derived(engineState.playing ? pct(engineState.cpu) : '–');

</script>

<div
  class="panel"
  role="dialog"
  aria-label="CPU load over time"
  style:top={`${place.top}px`}
  style:right={`${Math.max(8, place.right)}px`}
>
  <div class="head">
    <span class="title">CPU load</span>
    <Segmented
      value={String(span)}
      options={SPANS}
      label="Time span"
      onchange={(v) => (prefs.cpuSpan = Number(v) as 30 | 120 | 600)}
    />
    <button class="close" type="button" title="Close" aria-label="Close CPU graph" onclick={onclose}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  <dl class="stats">
    <div><dt>Now</dt><dd>{current}</dd></div>
    <div><dt>Average</dt><dd>{view.summary ? pct(view.summary.average) : '–'}</dd></div>
    <div><dt>Peak</dt><dd>{view.summary ? pct(view.summary.peak) : '–'}</dd></div>
  </dl>

  <div class="screen lcd small">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {#each [0.25, 0.5, 0.75] as f (f)}
        <line class="grid" x1="0" y1={H - f * (H - 2)} x2={W} y2={H - f * (H - 2)} />
      {/each}
      <path class="area" d={view.area} />
      <path class="line" d={view.line} />
    </svg>
    <span class="scale top">{scaleLabel(view.top)}</span>
    <span class="scale mid">{scaleLabel(view.top / 2)}</span>
    {#if !view.line}
      <span class="empty">{engineState.playing ? 'Collecting…' : 'Press Play to measure'}</span>
    {/if}
  </div>

  <p class="note">
    Share of the time the audio engine may use. The browser gives no precise clock, so this is an
    estimate averaged over about a second: it shows the trend, not brief spikes.
  </p>
</div>

<style>
  .panel {
    position: fixed;
    z-index: 250001;
    width: 332px;
    max-width: calc(100vw - 16px);
    padding: var(--space-3);
    background: var(--sheen-module), var(--surface-bar);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-lg);
    box-shadow: 0 16px 40px rgb(0 0 0 / 0.5);
    cursor: default;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .title {
    flex: 1;
  }
  .close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .close:hover {
    background: var(--surface-control);
    color: var(--text-strong);
  }
  .title {
    font-weight: var(--weight-bold);
    color: var(--text-strong);
    font-size: var(--text-sm);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
    margin: 0 0 var(--space-2);
  }
  .stats div {
    padding: 4px 8px;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
  }
  dt {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  dd {
    margin: 0;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-sm);
    color: var(--text-strong);
  }
  .screen {
    position: relative;
    height: 110px;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .grid {
    stroke: var(--border-subtle);
    stroke-width: 1;
    stroke-dasharray: 2 3;
    vector-effect: non-scaling-stroke;
  }
  .line {
    fill: none;
    stroke: var(--signal-cv);
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 3px var(--signal-cv));
  }
  .area {
    fill: color-mix(in srgb, var(--signal-cv) 22%, transparent);
  }
  .scale {
    position: absolute;
    left: 6px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
  }
  .scale.top {
    top: 3px;
  }
  .scale.mid {
    top: calc(50% - 7px);
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .note {
    margin: var(--space-2) 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }
</style>
