<!--
  Tape Recorder panel: a small tape deck. The reels turn while recording; the left reel slowly
  empties and the right one fills as the take grows.
-->
<script lang="ts">
  import Meter from '../../ui/components/Meter.svelte';
  import { engineState, meterValue } from '../../engine/engine.svelte';
  import {
    MAX_RECORDING_SECONDS,
    clearRecording,
    recorderState,
    recorders,
    saveRecording,
    setArmed,
  } from '../../engine/recordings.svelte';
  import { patch } from '../../patch/patch.svelte';
  import { showToast } from '../../ui/toast.svelte';
  import type { ModulePanelProps } from '../types';

  let { module }: ModulePanelProps = $props();

  // Make sure this recorder has a state entry before the markup reads it.
  // svelte-ignore state_referenced_locally
  recorderState(module.id);
  const st = $derived(recorders[module.id] ?? { armed: false, frames: 0, sampleRate: 48000, saved: true, full: false });

  const recording = $derived(st.armed && engineState.playing);
  const seconds = $derived(st.frames / st.sampleRate);

  const counter = $derived.by(() => {
    const tenths = Math.floor(seconds * 10);
    const m = Math.floor(tenths / 600);
    const s = Math.floor(tenths / 10) % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths % 10}`;
  });

  const status = $derived(
    recording
      ? 'Recording'
      : st.armed
        ? 'Armed — press Play'
        : st.full
          ? 'Full (15 min) — stopped'
          : st.frames > 0
            ? st.saved
              ? 'Saved'
              : 'Not saved yet'
            : 'Press Rec, then Play',
  );

  // ---------- Reels ----------
  const W = 240;
  const H = 112;
  const REEL_Y = 50;
  const LEFT_X = 62;
  const RIGHT_X = 178;
  const R_FLANGE = 44;
  const R_HUB = 13;
  const R_MAX = 40;
  const R_MIN = 17;

  // How much tape has moved from the left reel to the right one (0..1 over the longest take).
  const progress = $derived(Math.min(1, seconds / MAX_RECORDING_SECONDS));
  // Equal areas of tape: the radius follows the square root.
  const packRadius = (share: number) => Math.sqrt(R_MIN * R_MIN + (R_MAX * R_MAX - R_MIN * R_MIN) * share);
  const rLeft = $derived(packRadius(1 - progress));
  const rRight = $derived(packRadius(progress));

  let angleLeft = $state(0);
  let angleRight = $state(0);
  /** Tape speed in pixels per second: a fuller reel turns more slowly, like real tape. */
  const TAPE_SPEED = 70;

  $effect(() => {
    if (!recording) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      angleLeft = (angleLeft + ((TAPE_SPEED * dt) / rLeft) * (180 / Math.PI)) % 360;
      angleRight = (angleRight + ((TAPE_SPEED * dt) / rRight) * (180 / Math.PI)) % 360;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });

  const SPOKES = [0, 120, 240];

  // Tape: from the bottom of the left pack, over two guides and the head, to the right pack.
  const GUIDE_Y = 100;
  const tape = $derived(
    `M${LEFT_X - rLeft * 0.5} ${REEL_Y + rLeft * 0.87} L34 ${GUIDE_Y} L206 ${GUIDE_Y} L${RIGHT_X + rRight * 0.5} ${REEL_Y + rRight * 0.87}`,
  );

  function toggleRec() {
    setArmed(module.id, !st.armed);
  }

  function save() {
    const name = saveRecording(module.id, patch.name);
    if (name) showToast(`Saved “${name}” to your downloads`);
  }
</script>

<div class="recorder">
  <div class="deck" class:recording>
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path class="tape" d={tape} />
      {#each [{ x: LEFT_X, r: rLeft, a: angleLeft }, { x: RIGHT_X, r: rRight, a: angleRight }] as reel, i (i)}
        <g transform={`rotate(${reel.a} ${reel.x} ${REEL_Y})`}>
          <circle class="flange" cx={reel.x} cy={REEL_Y} r={R_FLANGE} />
          <circle class="pack" cx={reel.x} cy={REEL_Y} r={reel.r} />
          <circle class="pack-shine" cx={reel.x} cy={REEL_Y} r={reel.r - 2} />
          {#each SPOKES as s (s)}
            <path
              class="window"
              transform={`rotate(${s} ${reel.x} ${REEL_Y})`}
              d={`M${reel.x - 9} ${REEL_Y - R_HUB - 3} L${reel.x + 9} ${REEL_Y - R_HUB - 3} L${reel.x + 5} ${REEL_Y - R_FLANGE + 6} L${reel.x - 5} ${REEL_Y - R_FLANGE + 6} Z`}
            />
          {/each}
          <circle class="hub" cx={reel.x} cy={REEL_Y} r={R_HUB} />
          {#each SPOKES as s (s)}
            <rect
              class="tooth"
              x={reel.x - 1.5}
              y={REEL_Y - R_HUB + 1}
              width="3"
              height="5"
              transform={`rotate(${s} ${reel.x} ${REEL_Y})`}
            />
          {/each}
          <circle class="spindle" cx={reel.x} cy={REEL_Y} r="3.5" />
        </g>
      {/each}
      <circle class="guide" cx="34" cy={GUIDE_Y} r="4" />
      <circle class="guide" cx="206" cy={GUIDE_Y} r="4" />
      <rect class="head" x="108" y={GUIDE_Y - 2} width="24" height="10" rx="2" />
      <circle class="head-led" cx="120" cy={GUIDE_Y + 3} r="2" />
    </svg>
  </div>

  <div class="info">
    <div class="counter lcd small">
      <span class="time">{counter}</span>
      <span class="status" class:warn={st.full || (st.frames > 0 && !st.saved && !recording)}>{status}</span>
    </div>
    <div class="meters">
      <Meter level={meterValue(module.id, 'peakL')} height={40} width={5} label="Left level" />
      <Meter level={meterValue(module.id, 'peakR')} height={40} width={5} label="Right level" />
    </div>
  </div>

  <div class="buttons">
    <button
      type="button"
      class="rec"
      class:armed={st.armed}
      class:recording
      aria-pressed={st.armed}
      title={st.armed ? 'Stop recording' : 'Arm: recording starts with Play (or now, while playing)'}
      onclick={toggleRec}
    >
      <span class="dot"></span>Rec
    </button>
    <button type="button" class="btn" disabled={st.frames === 0 || recording} onclick={save} title="Download the take as a 24-bit WAV file">
      Save
    </button>
    <button
      type="button"
      class="btn"
      disabled={st.frames === 0 || recording}
      onclick={() => clearRecording(module.id)}
      title="Delete the take"
    >
      Clear
    </button>
  </div>
</div>

<style>
  .recorder {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .deck {
    border-radius: var(--radius-md);
    background: linear-gradient(180deg, #2a2f37, #1b1f25);
    box-shadow: var(--shadow-recess);
    padding: 4px;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .flange {
    fill: rgb(200 210 225 / 0.07);
    stroke: rgb(200 210 225 / 0.28);
    stroke-width: 1.2;
  }
  .pack {
    fill: #4a3426;
    stroke: #2d1f16;
    stroke-width: 1;
  }
  .pack-shine {
    fill: none;
    stroke: rgb(255 220 180 / 0.12);
    stroke-width: 1.5;
  }
  .window {
    fill: #15181d;
    stroke: rgb(200 210 225 / 0.22);
    stroke-width: 1;
  }
  .hub {
    fill: #c9ced6;
    stroke: #8b929c;
    stroke-width: 1;
  }
  .tooth {
    fill: #6b727c;
  }
  .spindle {
    fill: #3a4048;
  }
  .tape {
    fill: none;
    stroke: #3d2a1f;
    stroke-width: 2.5;
  }
  .guide {
    fill: #9aa1ab;
    stroke: #5d646e;
  }
  .head {
    fill: #7c838d;
    stroke: #4b5159;
  }
  .head-led {
    fill: #3a2020;
  }
  .recording .head-led {
    fill: var(--danger, #ff5a5a);
    filter: drop-shadow(0 0 3px var(--danger, #ff5a5a));
  }
  .info {
    display: flex;
    gap: var(--space-2);
    align-items: stretch;
  }
  .counter {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 4px 10px;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
  }
  .time {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 20px;
    color: var(--signal-audio-soft);
    text-shadow: 0 0 6px rgb(245 173 66 / 0.35);
  }
  .status {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .status.warn {
    color: var(--signal-audio);
  }
  .meters {
    display: flex;
    gap: 4px;
    align-items: center;
    padding: 0 2px;
  }
  .buttons {
    display: flex;
    gap: 6px;
  }
  .rec,
  .btn {
    flex: 1;
    height: 28px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .rec:hover,
  .btn:hover:not(:disabled) {
    background: var(--surface-control-hover);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .rec {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: var(--weight-bold);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #6b2a2a;
    box-shadow: inset 0 1px 1px rgb(0 0 0 / 0.5);
  }
  .rec.armed {
    border-color: #c94444;
    color: #ffb3b3;
  }
  .rec.armed .dot {
    background: #ff4d4d;
    box-shadow: 0 0 6px #ff4d4d;
    animation: blink 1s steps(1) infinite;
  }
  .rec.recording .dot {
    animation: none;
  }
  @keyframes blink {
    50% {
      opacity: 0.25;
    }
  }
</style>
