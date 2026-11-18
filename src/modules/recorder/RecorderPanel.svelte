<!--
  Tape Recorder panel: a compact tape deck, reels on the left and the counter with level bars on
  the right. The reels turn while recording; the left reel slowly empties and the right one fills
  as the take grows.
-->
<script lang="ts">
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
        ? 'Armed'
        : st.full
          ? 'Full (15 min)'
          : st.frames > 0
            ? st.saved
              ? 'Saved'
              : 'Not saved'
            : 'Press Rec',
  );

  // ---------- Reels ----------
  const W = 104;
  const H = 60;
  const REEL_Y = 25;
  const LEFT_X = 26;
  const RIGHT_X = 78;
  const R_FLANGE = 22;
  const R_HUB = 6;
  const R_MAX = 19.5;
  const R_MIN = 8;

  // How much tape has moved from the left reel to the right one (0..1 over the longest take).
  const progress = $derived(Math.min(1, seconds / MAX_RECORDING_SECONDS));
  // Equal areas of tape: the radius follows the square root.
  const packRadius = (share: number) => Math.sqrt(R_MIN * R_MIN + (R_MAX * R_MAX - R_MIN * R_MIN) * share);
  const rLeft = $derived(packRadius(1 - progress));
  const rRight = $derived(packRadius(progress));

  let angleLeft = $state(0);
  let angleRight = $state(0);
  /** Tape speed in pixels per second: a fuller reel turns more slowly, like real tape. */
  const TAPE_SPEED = 36;

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

  // Tape: from the bottom of each pack down to a guide, along the head in the middle.
  const GUIDE_Y = 54;
  const tape = $derived(
    `M${LEFT_X - rLeft * 0.5} ${REEL_Y + rLeft * 0.87} L5 ${GUIDE_Y} L99 ${GUIDE_Y} L${RIGHT_X + rRight * 0.5} ${REEL_Y + rRight * 0.87}`,
  );

  // ---------- Level bars (dB scale −60 … +6, like the other meters) ----------
  const levelWidth = (gain: number) =>
    gain <= 1e-6 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(gain) + 60) / 66)) * 100;
  const levels = $derived([meterValue(module.id, 'peakL'), meterValue(module.id, 'peakR')]);

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
          {#each SPOKES as s (s)}
            <path
              class="window"
              transform={`rotate(${s} ${reel.x} ${REEL_Y})`}
              d={`M${reel.x - 4.5} ${REEL_Y - R_HUB - 1.5} L${reel.x + 4.5} ${REEL_Y - R_HUB - 1.5} L${reel.x + 2.5} ${REEL_Y - R_FLANGE + 3} L${reel.x - 2.5} ${REEL_Y - R_FLANGE + 3} Z`}
            />
          {/each}
          <circle class="hub" cx={reel.x} cy={REEL_Y} r={R_HUB} />
          {#each SPOKES as s (s)}
            <rect
              class="tooth"
              x={reel.x - 0.75}
              y={REEL_Y - R_HUB + 0.4}
              width="1.5"
              height="2.5"
              transform={`rotate(${s} ${reel.x} ${REEL_Y})`}
            />
          {/each}
          <circle class="spindle" cx={reel.x} cy={REEL_Y} r="1.8" />
        </g>
      {/each}
      <circle class="guide" cx="5" cy={GUIDE_Y} r="2.2" />
      <circle class="guide" cx="99" cy={GUIDE_Y} r="2.2" />
      <rect class="head" x="45" y={GUIDE_Y - 1.5} width="14" height="5" rx="1" />
      <circle class="head-led" cx="52" cy={GUIDE_Y + 1} r="1.1" />
    </svg>
    <div class="counter lcd small" title="Press Rec, then Play: recording starts on the first beat">
      <span class="time">{counter}</span>
      <span class="status" class:warn={st.full || (st.frames > 0 && !st.saved && !recording)}>{status}</span>
      <div class="levels" role="img" aria-label="Input level, left and right">
        {#each levels as level, i (i)}
          <div class="bar"><div class="fill" class:over={level > 1} style:width={`${levelWidth(level)}%`}></div></div>
        {/each}
      </div>
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
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 2px;
    border-radius: var(--radius-md);
    background: linear-gradient(180deg, #2a2f37, #1b1f25);
    box-shadow: var(--shadow-recess);
  }
  .deck > svg {
    display: block;
    width: 94px;
    height: 54px;
    flex: none;
  }
  .flange {
    fill: rgb(200 210 225 / 0.07);
    stroke: rgb(200 210 225 / 0.28);
    stroke-width: 0.8;
  }
  .pack {
    fill: #4a3426;
    stroke: #2d1f16;
    stroke-width: 0.8;
  }
  .window {
    fill: #15181d;
    stroke: rgb(200 210 225 / 0.22);
    stroke-width: 0.6;
  }
  .hub {
    fill: #c9ced6;
    stroke: #8b929c;
    stroke-width: 0.6;
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
    stroke-width: 1.6;
  }
  .guide {
    fill: #9aa1ab;
    stroke: #5d646e;
    stroke-width: 0.6;
  }
  .head {
    fill: #7c838d;
    stroke: #4b5159;
    stroke-width: 0.6;
  }
  .head-led {
    fill: #3a2020;
  }
  .recording .head-led {
    fill: var(--danger, #ff5a5a);
    filter: drop-shadow(0 0 2px var(--danger, #ff5a5a));
  }
  .counter {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 5px 6px;
    background: var(--surface-inset);
    border-radius: var(--radius-md);
  }
  .time {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 14px;
    line-height: 1.1;
    color: var(--signal-audio-soft);
    text-shadow: 0 0 6px rgb(245 173 66 / 0.35);
  }
  .status {
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .status.warn {
    color: var(--signal-audio);
  }
  .levels {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 2px;
  }
  .bar {
    height: 4px;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.06);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--signal-cv);
    transition: width 80ms linear;
  }
  .fill.over {
    background: var(--danger, #ff5a5a);
  }
  .buttons {
    display: flex;
    gap: 6px;
  }
  .rec,
  .btn {
    flex: 1;
    height: 26px;
    padding: 0;
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
    gap: 5px;
    font-weight: var(--weight-bold);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #8a3030;
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
