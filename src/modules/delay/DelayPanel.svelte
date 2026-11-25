<script lang="ts">
  import Segmented from '../../ui/components/Segmented.svelte';
  import Toggle from '../../ui/components/Toggle.svelte';
  import { DELAY_DIVISIONS, DELAY_MODES } from '../../engine/modules/Delay';
  import { patch } from '../../patch/patch.svelte';
  import ParamKnob from '../ParamKnob.svelte';
  import type { ModulePanelProps } from '../types';

  let { module, def }: ModulePanelProps = $props();

  const W = 438;
  const H = 58;
  const PAD = 6;
  const SIDES = ['L', 'R'] as const;
  const ROUTING = [
    { value: '0', label: 'Stereo', title: 'Each side delays its own input' },
    { value: '1', label: 'Ping-pong', title: 'The echoes bounce between left and right' },
  ];

  const param = (id: string, fallback: number) => module.params[id] ?? fallback;
  const sync = $derived(param('sync', 1) >= 0.5);
  const ping = $derived(Math.round(param('routing', 0)) === 1);

  /** One side's delay time in ms: a note of the project tempo, or the knob. */
  function timeMs(side: 'L' | 'R'): number {
    if (!sync) return param(`time${side}`, side === 'L' ? 375 : 500);
    const note = DELAY_DIVISIONS[Math.round(param(`div${side}`, side === 'L' ? 2 : 3))]!;
    const mode = DELAY_MODES[Math.round(param(`mode${side}`, side === 'L' ? 2 : 0))]!;
    return (note.beats * mode.factor * 60000) / patch.tempo;
  }

  interface Echo {
    t: number;
    height: number;
    side: 0 | 1 | 2;
  }

  /** Every echo that is loud enough to draw: its time in ms and its height (1 = full level). */
  const picture = $derived.by(() => {
    const tL = timeMs('L');
    const tR = timeMs('R');
    const fb = param('feedback', 0.4);
    const mix = param('mix', 0.35);
    const wet = Math.sin(mix * Math.PI * 0.5);
    const span = ping ? (tL + tR) * 2 : Math.max(tL, tR) * 3.2;
    const echoes: Echo[] = [{ t: 0, height: Math.cos(mix * Math.PI * 0.5), side: 0 }];
    const MIN = 0.03; // about −30 dB
    if (ping) {
      // Ping-pong: the left line echoes, the right repeats each one, the left repeats that again, and so on.
      let t = 0;
      let a = 1;
      for (let k = 0; k < 40; k++) {
        const left = k % 2 === 0;
        t += left ? tL : tR;
        if (k > 0) a *= fb;
        if (t > span || a * wet < MIN) break;
        echoes.push({ t, height: a * wet, side: left ? 1 : 2 });
      }
    } else {
      for (const [side, t1] of [
        [1, tL],
        [2, tR],
      ] as const) {
        for (let n = 1, a = 1; n < 60 && n * t1 <= span && a * wet >= MIN; n++, a *= fb) {
          echoes.push({ t: n * t1, height: a * wet, side });
        }
      }
    }
    return { echoes, span };
  });

  const x = (t: number) => PAD + (t / picture.span) * (W - 2 * PAD);
  /** Bar heights follow loudness (dB), so faint repeats stay visible: −30 dB is the bottom, 0 dB the top. */
  const barTop = (h: number) => H - PAD - Math.min(1, Math.max(0, (20 * Math.log10(Math.max(h, 1e-6)) + 30) / 30)) * (H - 2 * PAD - 4);

  /** The end of the time axis, as text. */
  const spanText = $derived(picture.span >= 1000 ? `${(picture.span / 1000).toFixed(1)} s` : `${Math.round(picture.span)} ms`);

  function nextMode(side: 'L' | 'R') {
    module.params[`mode${side}`] = (Math.round(param(`mode${side}`, 0)) + 1) % DELAY_MODES.length;
  }
</script>

<div class="delay">
  <div class="screen lcd">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Echoes of the left and right delay over time">
      <line class="axis" x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} />
      {#each [1, 2, 3] as q (q)}
        <line class="grid" x1={PAD + (q * (W - 2 * PAD)) / 4} y1="4" x2={PAD + (q * (W - 2 * PAD)) / 4} y2={H - PAD} />
      {/each}
      {#each picture.echoes as e, i (i)}
        <line class={`echo s${e.side}`} x1={x(e.t)} y1={H - PAD} x2={x(e.t)} y2={barTop(e.height)} />
      {/each}
    </svg>
    <div class="top">
      <span class="end">{spanText}</span>
    </div>
  </div>

  <div class="knobs">
    {#each SIDES as side (side)}
      <div class={`side ${side}`}>
        <!-- One time knob: a note length while synced, milliseconds when free. -->
        <ParamKnob {module} {def} param={sync ? `div${side}` : `time${side}`} />
        <button
          type="button"
          class="mode"
          disabled={!sync}
          title="Straight, triplet or dotted: click to change"
          onclick={() => nextMode(side)}
        >
          {DELAY_MODES[Math.round(param(`mode${side}`, side === 'L' ? 2 : 0))]!.label}
        </button>
      </div>
    {/each}
    <div class="rest">
      <div class="restknobs">
        <div class="cell"><ParamKnob {module} {def} param="feedback" /></div>
        <div class="cell"><ParamKnob {module} {def} param="hp" /></div>
        <div class="cell"><ParamKnob {module} {def} param="lp" /></div>
        <div class="cell"><ParamKnob {module} {def} param="tape" /></div>
        <div class="cell"><ParamKnob {module} {def} param="mix" /></div>
      </div>
      <!-- At the height of the note buttons: tempo sync and the routing. -->
      <div class="controls">
        <Toggle
          pressed={sync}
          label="Sync"
          title="On: delay times are notes of the project tempo. Off: free times in milliseconds."
          onchange={(p) => (module.params.sync = p ? 1 : 0)}
        />
        <Segmented
          value={String(ping ? 1 : 0)}
          options={ROUTING}
          label="Routing"
          onchange={(v) => (module.params.routing = Number(v))}
        />
      </div>
    </div>
  </div>
</div>

<style>
  .delay {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .screen {
    position: relative;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
    overflow: hidden;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .axis {
    stroke: var(--border-default);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .grid {
    stroke: var(--border-subtle);
    stroke-width: 1;
    stroke-dasharray: 2 3;
    opacity: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .echo {
    stroke-width: 4;
    stroke-linecap: round;
  }
  /* Dry signal white, the left delay amber, the right delay teal. */
  .echo.s0 {
    stroke: var(--text-strong);
    opacity: 0.75;
  }
  .echo.s1 {
    stroke: var(--signal-audio);
    filter: drop-shadow(0 0 3px var(--signal-audio));
  }
  .echo.s2 {
    stroke: var(--signal-cv);
    filter: drop-shadow(0 0 3px var(--signal-cv));
  }
  /* Top right, where the late (faint) echoes are: the length of the axis. */
  .top {
    position: absolute;
    right: 4px;
    top: 3px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .end {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .knobs {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
  }
  .rest {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    margin-left: var(--space-2);
  }
  .restknobs {
    display: flex;
    justify-content: space-between;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-bottom: 2px;
  }
  .side,
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  /* Each side keeps the colour of its echoes. */
  .side {
    min-width: 58px;
    padding-bottom: 2px;
    border-bottom: 2px solid var(--side-color);
    border-radius: 2px;
  }
  .side.L {
    --side-color: var(--signal-audio);
  }
  .side.R {
    --side-color: var(--signal-cv);
  }
  .mode {
    width: 100%;
    height: 20px;
    padding: 0 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-xs);
    cursor: pointer;
  }
  .mode:hover:not(:disabled) {
    background: var(--surface-control-hover);
  }
  .mode:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
