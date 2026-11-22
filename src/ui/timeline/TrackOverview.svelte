<!--
  The overview at the bottom of the timeline: the whole song in miniature, one thin line per track
  (patches and audio tracks) with its blocks and clips, and a window showing what the timeline above
  shows. Like the song overview in Reason:
  - drag the window to scroll the timeline; click anywhere to centre the window there
  - drag the window's left or right edge to zoom (the timeline shows that stretch)
  - double-click to fit the whole song
  The playhead, the loop and the end of the song are drawn in it too.
-->
<script lang="ts">
  import { project } from '../../patch/patch.svelte';
  import { BEATS_PER_BAR } from '../../patch/timeline';
  import { channelColor } from '../channelColors';
  import { MAX_PPB } from './timelineGeometry';
  import { timelineView } from './timelineScreen.svelte';

  interface Props {
    /** Width of the timeline's visible area in pixels. */
    viewW: number;
    /** Where the playhead is, in beats. */
    shownBeat: number;
    /** Show this zoom (pixels per beat) and scroll position (pixels). */
    onview: (ppb: number, scrollLeft: number) => void;
    /** Zoom so the whole song fits. */
    onfit: () => void;
  }

  let { viewW, shownBeat, onview, onfit }: Props = $props();

  /** Height of the drawing, and the thickest and thinnest a track's line can be (pixels). */
  const HEIGHT = 44;
  const MAX_LINE = 7;
  const MIN_LINE = 1.5;
  const EDGE_PX = 6;

  let width = $state(0);

  /** One entry per track, in the order of the timeline: its colour and where its blocks are. */
  const tracks = $derived([
    ...project.patches.map((p) => ({
      color: channelColor(p.color),
      spans: p.clips.map((c) => ({ start: c.start, end: c.start + c.length })),
    })),
    ...project.audioTracks.map((t) => ({
      color: channelColor(t.color),
      spans: t.clips.map((c) => ({ start: c.start, end: c.start + c.length })),
    })),
  ]);

  /** The stretch of song the overview shows: the end of the song or the last block, whichever is later. */
  const songBeats = $derived.by(() => {
    let end = project.timeline.end;
    for (const t of tracks) for (const s of t.spans) end = Math.max(end, s.end);
    return Math.max(end, 4 * BEATS_PER_BAR);
  });

  const lineH = $derived(Math.min(MAX_LINE, Math.max(MIN_LINE, (HEIGHT - 4) / Math.max(1, tracks.length))));
  const drawnH = $derived(tracks.length * lineH);

  const ppb = $derived(timelineView.ppb);
  /** The window: the stretch of song the timeline shows now, in beats. */
  const winStart = $derived(timelineView.scrollLeft / ppb);
  const winBeats = $derived(viewW / ppb);

  const px = (beats: number) => (beats / songBeats) * width;
  const winLeftPx = $derived(Math.min(width, px(winStart)));
  const winRightPx = $derived(Math.min(width, Math.max(winLeftPx + 6, px(winStart + winBeats))));

  let root: HTMLDivElement | undefined = $state();
  type Drag = { kind: 'move'; grab: number } | { kind: 'left'; right: number } | { kind: 'right'; left: number };
  let drag = $state<Drag | null>(null);
  let hover = $state<'edge' | 'inside' | null>(null);

  const beatAt = (e: PointerEvent) => {
    const r = root!.getBoundingClientRect();
    return Math.max(0, ((e.clientX - r.left) / Math.max(1, width)) * songBeats);
  };
  /** The smallest stretch the window can show (the timeline's highest zoom). */
  const minBeats = $derived(viewW / MAX_PPB);

  function what(e: PointerEvent): 'left' | 'right' | 'inside' | 'outside' {
    const x = e.clientX - root!.getBoundingClientRect().left;
    if (Math.abs(x - winLeftPx) <= EDGE_PX) return 'left';
    if (Math.abs(x - winRightPx) <= EDGE_PX) return 'right';
    return x > winLeftPx && x < winRightPx ? 'inside' : 'outside';
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0 || !root) return;
    e.preventDefault();
    root.setPointerCapture(e.pointerId);
    const kind = what(e);
    const b = beatAt(e);
    if (kind === 'left') drag = { kind, right: winStart + winBeats };
    else if (kind === 'right') drag = { kind, left: winStart };
    else if (kind === 'inside') drag = { kind: 'move', grab: b - winStart };
    else {
      // A click outside the window: centre it there, then keep dragging it.
      drag = { kind: 'move', grab: winBeats / 2 };
      move(b);
    }
  }

  function move(b: number) {
    if (drag?.kind !== 'move') return;
    onview(ppb, Math.max(0, b - drag.grab) * ppb);
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) {
      const k = root ? what(e) : 'outside';
      hover = k === 'left' || k === 'right' ? 'edge' : k === 'inside' ? 'inside' : null;
      return;
    }
    const b = beatAt(e);
    if (drag.kind === 'move') move(b);
    else if (drag.kind === 'right') {
      // Zoom with the left edge staying where it is.
      const visible = Math.max(minBeats, b - drag.left);
      const next = Math.min(MAX_PPB, viewW / visible);
      onview(next, drag.left * next);
    } else {
      // Zoom with the right edge staying where it is.
      const left = Math.min(Math.max(0, b), drag.right - minBeats);
      const next = Math.min(MAX_PPB, viewW / (drag.right - left));
      onview(next, Math.max(0, drag.right - viewW / next) * next);
    }
  }

  function onpointerup() {
    drag = null;
  }

  const cursor = $derived(drag ? (drag.kind === 'move' ? 'grabbing' : 'ew-resize') : hover === 'edge' ? 'ew-resize' : hover === 'inside' ? 'grab' : 'pointer');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions (a pointer gesture; the timeline above scrolls and zooms with the keyboard and wheel too) -->
<div
  class="overview"
  bind:this={root}
  bind:clientWidth={width}
  style:cursor
  title="Overview of the song: drag the window to scroll, drag its edges to zoom, double-click to fit the song"
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
  onpointerleave={() => (hover = null)}
  ondblclick={onfit}
>
  <svg class="map" viewBox={`0 0 ${songBeats} ${Math.max(1, drawnH)}`} preserveAspectRatio="none" aria-hidden="true">
    {#each tracks as t, i (i)}
      {#each t.spans as s, k (k)}
        <rect x={s.start} y={i * lineH + 0.5} width={Math.max(0.05, s.end - s.start)} height={Math.max(0.5, lineH - 1)} fill={t.color} />
      {/each}
    {/each}
  </svg>
  {#if project.timeline.loop.on}
    <div
      class="loop"
      style:left={`${px(project.timeline.loop.start)}px`}
      style:width={`${px(project.timeline.loop.end - project.timeline.loop.start)}px`}
    ></div>
  {/if}
  <div class="end" style:left={`${px(project.timeline.end)}px`}></div>
  <div class="dim" style:left="0" style:width={`${winLeftPx}px`}></div>
  <div class="dim" style:left={`${winRightPx}px`} style:right="0"></div>
  <div class="window" style:left={`${winLeftPx}px`} style:width={`${Math.max(0, winRightPx - winLeftPx)}px`}></div>
  <div class="playhead" style:left={`${px(shownBeat)}px`}></div>
</div>

<style>
  .overview {
    position: relative;
    height: 52px;
    overflow: hidden;
    background: var(--surface-bar);
    touch-action: none;
  }
  .map {
    position: absolute;
    left: 0;
    right: 0;
    top: 4px;
    width: 100%;
    height: calc(100% - 8px);
    opacity: 0.85;
    pointer-events: none;
  }
  .loop {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--signal-cv) 14%, transparent);
    border-left: 1px solid color-mix(in srgb, var(--signal-cv) 50%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--signal-cv) 50%, transparent);
    pointer-events: none;
  }
  .end {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 2px solid var(--text-secondary);
    pointer-events: none;
  }
  .dim {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgb(0 0 0 / 0.42);
    pointer-events: none;
  }
  .window {
    position: absolute;
    top: 1px;
    bottom: 1px;
    border: 1px solid var(--text-strong);
    border-radius: 3px;
    box-sizing: border-box;
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--signal-audio);
    pointer-events: none;
  }
</style>
