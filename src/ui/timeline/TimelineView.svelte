<!--
  The timeline: one track per patch (in tab order and colour), with a row for each of the patch's
  sequencers. Blocks on those rows come in a later step.
  - ruler: click or drag to place the playhead (Play starts there; while playing it jumps)
  - the strip above the numbers holds the loop: drag it to move, drag its edges to resize, drag
    on an empty part to draw a new one, double-click it to switch it on or off
  - the End flag marks the end of the song; drag it to change the length
  - Ctrl + mouse wheel zooms around the pointer; the wheel scrolls (Shift: sideways)
  Dragging snaps to the grid (bar, beat or sixteenth, depending on the zoom); hold Alt to place
  freely on sixteenths.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { engineState, setPlayhead, transportState } from '../../engine/engine.svelte';
  import { getDefinition } from '../../modules/registry';
  import { project } from '../../patch/patch.svelte';
  import { BEATS_PER_BAR, hasPattern, MAX_BEATS } from '../../patch/timeline';
  import { channelColor } from '../channelColors';
  import {
    clampPpb,
    formatLength,
    formatPosition,
    labelEvery,
    showsBeats,
    snap,
    snapUnit,
    zoomAround,
  } from './timelineGeometry';
  import { timelineView } from './timelineScreen.svelte';

  const TRACK_H = 26;
  const ROW_H = 44;
  const EMPTY_H = 28;
  const LOOP_H = 14;
  const EDGE_PX = 6;

  // ---------- Tracks ----------
  const tracks = $derived(
    project.patches.map((patch) => {
      const seqs = patch.modules.filter((m) => hasPattern(getDefinition(m.type)));
      const rows = seqs.map((module, i) => {
        const title = getDefinition(module.type)?.title ?? module.type;
        const sameType = seqs.filter((s) => s.type === module.type);
        const n = sameType.indexOf(module) + 1;
        return { module, label: sameType.length > 1 ? `${title} ${n}` : title, index: i };
      });
      return { patch, rows };
    }),
  );

  // ---------- Size, scroll and zoom ----------
  let body: HTMLDivElement | undefined = $state();
  let viewW = $state(0);
  const ppb = $derived(timelineView.ppb);
  const timeline = $derived(project.timeline);
  const loop = $derived(project.timeline.loop);

  /** Width of the scrollable song area in beats: past the end, and at least the window. */
  const contentBeats = $derived(
    Math.min(MAX_BEATS, Math.max(timeline.end + 8 * BEATS_PER_BAR, loop.end + 4 * BEATS_PER_BAR, Math.ceil(viewW / ppb))),
  );
  const contentW = $derived(contentBeats * ppb);

  function onscroll() {
    if (!body) return;
    timelineView.scrollLeft = body.scrollLeft;
    timelineView.scrollTop = body.scrollTop;
  }

  // Restore the scroll position when the view opens again.
  $effect(() => {
    if (!body) return;
    untrack(() => {
      body!.scrollLeft = timelineView.scrollLeft;
      body!.scrollTop = timelineView.scrollTop;
    });
  });

  function zoomTo(factor: number, x = viewW / 2) {
    const z = zoomAround(timelineView.ppb, timelineView.scrollLeft, x, factor);
    timelineView.ppb = z.ppb;
    // Scroll once the content has its new width.
    requestAnimationFrame(() => {
      if (!body) return;
      body.scrollLeft = z.scrollLeft;
      onscroll();
    });
  }

  /** Ctrl + wheel zooms around the pointer; the ruler scrolls sideways with the plain wheel. */
  function onwheel(e: WheelEvent, area: 'body' | 'ruler') {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = body?.getBoundingClientRect();
      zoomTo(Math.exp(-e.deltaY * 0.0015), rect ? e.clientX - rect.left : viewW / 2);
    } else if (area === 'ruler' && body) {
      e.preventDefault();
      body.scrollLeft += e.deltaY || e.deltaX;
    }
  }

  /** Zoom so the whole song fits the window. */
  function fitSong() {
    timelineView.ppb = clampPpb((viewW - 24) / Math.max(BEATS_PER_BAR, timeline.end));
    requestAnimationFrame(() => {
      if (!body) return;
      body.scrollLeft = 0;
      onscroll();
    });
  }

  // ---------- The grid ----------
  const visibleBars = $derived.by(() => {
    const barPx = ppb * BEATS_PER_BAR;
    const every = labelEvery(ppb);
    const first = Math.floor(timelineView.scrollLeft / barPx / every) * every;
    const last = Math.min(contentBeats / BEATS_PER_BAR, Math.ceil((timelineView.scrollLeft + viewW) / barPx));
    const bars: number[] = [];
    for (let b = first; b <= last; b += every) bars.push(b);
    return bars;
  });

  // ---------- Playhead ----------
  /** Where the playhead is drawn: the start position when stopped, the live position when playing. */
  let shownBeat = $state(0);
  /** Latest position from the engine and when it arrived, to move smoothly between messages. */
  const anchor = { beat: 0, time: 0 };

  $effect(() => {
    void engineState.statsTick;
    anchor.beat = engineState.beat;
    anchor.time = performance.now();
  });

  $effect(() => {
    if (!engineState.playing) {
      shownBeat = transportState.start;
      return;
    }
    let raf = 0;
    const frame = () => {
      const elapsed = Math.min(0.25, (performance.now() - anchor.time) / 1000);
      let b = anchor.beat + (elapsed * project.tempo) / 60;
      const l = project.timeline.loop;
      if (l.on && anchor.beat < l.end && b >= l.end) b -= l.end - l.start;
      shownBeat = b;
      follow(b);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });

  /** While playing, turn the page when the playhead runs out of view (not while dragging). */
  function follow(beat: number) {
    if (!body || drag) return;
    const x = beat * timelineView.ppb;
    const left = body.scrollLeft;
    if (x > left + body.clientWidth - 24 || x < left) {
      body.scrollLeft = Math.max(0, x - 24);
      onscroll();
    }
  }

  // ---------- Dragging in the ruler ----------
  type Drag =
    | { kind: 'playhead' }
    | { kind: 'end' }
    | { kind: 'loop-start' | 'loop-end' }
    | { kind: 'loop-move'; grab: number; length: number }
    | { kind: 'loop-new'; anchor: number };
  let drag: Drag | null = $state(null);
  let ruler: HTMLDivElement | undefined = $state();

  /** Beat under the pointer. */
  function beatAt(e: PointerEvent): number {
    const left = ruler?.getBoundingClientRect().left ?? 0;
    return Math.max(0, (e.clientX - left + timelineView.scrollLeft) / timelineView.ppb);
  }

  const unitFor = (e: PointerEvent) => (e.altKey ? 0.25 : snapUnit(timelineView.ppb));
  const near = (e: PointerEvent, beat: number) =>
    Math.abs(e.clientX - ((ruler?.getBoundingClientRect().left ?? 0) + beat * timelineView.ppb - timelineView.scrollLeft)) <=
    EDGE_PX;

  /** What a press at this spot of the ruler would grab, for the cursor and the drag. */
  function hit(e: PointerEvent): Drag['kind'] {
    const top = ruler?.getBoundingClientRect().top ?? 0;
    const inLoopStrip = e.clientY - top < LOOP_H;
    if (inLoopStrip) {
      if (near(e, loop.start)) return 'loop-start';
      if (near(e, loop.end)) return 'loop-end';
      const b = beatAt(e);
      return b > loop.start && b < loop.end ? 'loop-move' : 'loop-new';
    }
    return near(e, timeline.end) ? 'end' : 'playhead';
  }

  let hover: Drag['kind'] | null = $state(null);

  function onrulerpointerdown(e: PointerEvent) {
    if (e.button !== 0 || !ruler) return;
    e.preventDefault();
    ruler.setPointerCapture(e.pointerId);
    const kind = hit(e);
    const b = beatAt(e);
    if (kind === 'loop-move') drag = { kind, grab: b - loop.start, length: loop.end - loop.start };
    else if (kind === 'loop-new') drag = { kind, anchor: snap(b, unitFor(e)) };
    else drag = { kind };
    if (kind === 'playhead') setPlayhead(snap(b, unitFor(e)));
  }

  function onrulerpointermove(e: PointerEvent) {
    if (!drag) {
      hover = hit(e);
      return;
    }
    const unit = unitFor(e);
    const b = beatAt(e);
    const l = project.timeline.loop;
    switch (drag.kind) {
      case 'playhead':
        setPlayhead(snap(b, unit));
        break;
      case 'end':
        project.timeline.end = Math.min(MAX_BEATS, Math.max(unit, snap(b, unit)));
        break;
      case 'loop-start':
        l.start = Math.max(0, Math.min(l.end - unit, snap(b, unit)));
        break;
      case 'loop-end':
        l.end = Math.min(MAX_BEATS, Math.max(l.start + unit, snap(b, unit)));
        break;
      case 'loop-move': {
        const start = Math.max(0, Math.min(MAX_BEATS - drag.length, snap(b - drag.grab, unit)));
        l.start = start;
        l.end = start + drag.length;
        break;
      }
      case 'loop-new': {
        const at = snap(b, unit);
        if (at === drag.anchor) break;
        l.start = Math.min(at, drag.anchor);
        l.end = Math.max(at, drag.anchor);
        l.on = true;
        break;
      }
    }
  }

  function onrulerpointerup() {
    drag = null;
  }

  function ondblclick(e: MouseEvent) {
    const top = ruler?.getBoundingClientRect().top ?? 0;
    if (e.clientY - top >= LOOP_H) return;
    const b = (e.clientX - (ruler?.getBoundingClientRect().left ?? 0) + timelineView.scrollLeft) / timelineView.ppb;
    if (b > loop.start && b < loop.end) project.timeline.loop.on = !loop.on;
  }

  const cursor = $derived.by(() => {
    const k = drag?.kind ?? hover;
    if (k === 'loop-start' || k === 'loop-end' || k === 'end') return 'ew-resize';
    if (k === 'loop-move') return drag ? 'grabbing' : 'grab';
    return 'pointer';
  });
</script>

<main class="timeline" aria-label="Timeline" style:--ppb={`${ppb}px`} style:--bar={`${ppb * BEATS_PER_BAR}px`}>
  <!-- Top left: loop switch and zoom -->
  <div class="corner">
    <button
      class="tool loop-toggle"
      class:on={loop.on}
      type="button"
      aria-pressed={loop.on}
      title={`Loop ${formatPosition(loop.start)} – ${formatPosition(loop.end)} (${formatLength(loop.end - loop.start)})`}
      onclick={() => (project.timeline.loop.on = !loop.on)}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M4.5 5.5h6a2.5 2.5 0 0 1 0 5h-1M11.5 10.5h-6a2.5 2.5 0 0 1 0-5h1"
          stroke="currentColor"
          stroke-width="1.4"
          fill="none"
          stroke-linecap="round"
        />
        <path d="M9 3.5l2 2-2 2M7 12.5l-2-2 2-2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Loop
    </button>
    <span class="grow"></span>
    <button class="tool icon" type="button" title="Zoom out (Ctrl + wheel)" aria-label="Zoom out" onclick={() => zoomTo(1 / 1.5)}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
    <button class="tool icon" type="button" title="Zoom in (Ctrl + wheel)" aria-label="Zoom in" onclick={() => zoomTo(1.5)}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
    <button class="tool icon" type="button" title="Show the whole song" aria-label="Show the whole song" onclick={fitSong}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" />
      </svg>
    </button>
  </div>

  <!-- Ruler: loop strip, bar numbers, playhead and end flag -->
  <div
    class="ruler"
    bind:this={ruler}
    role="slider"
    tabindex="-1"
    aria-label="Playhead position"
    aria-valuemin={0}
    aria-valuemax={timeline.end}
    aria-valuenow={shownBeat}
    aria-valuetext={formatPosition(shownBeat)}
    style:cursor
    onpointerdown={onrulerpointerdown}
    onpointermove={onrulerpointermove}
    onpointerup={onrulerpointerup}
    onpointercancel={onrulerpointerup}
    onpointerleave={() => (hover = null)}
    {ondblclick}
    onwheel={(e) => onwheel(e, 'ruler')}
  >
    <div class="ruler-inner" style:width={`${contentW}px`} style:transform={`translateX(${-timelineView.scrollLeft}px)`}>
      <div
        class="loop-range"
        class:on={loop.on}
        style:left={`${loop.start * ppb}px`}
        style:width={`${(loop.end - loop.start) * ppb}px`}
        title={loop.on ? 'Loop on — double-click to switch off' : 'Loop off — double-click to switch on'}
      ></div>
      {#each visibleBars as bar (bar)}
        <span class="bar-label" style:left={`${bar * BEATS_PER_BAR * ppb}px`}>{bar + 1}</span>
      {/each}
      <div class="end-shade" style:left={`${timeline.end * ppb}px`}></div>
      <div class="end-flag" style:left={`${timeline.end * ppb}px`} title={`End of the song: ${formatLength(timeline.end)}`}>End</div>
      <div class="playhead-mark" style:left={`${shownBeat * ppb}px`}></div>
    </div>
  </div>

  <!-- Track names, scrolled along with the tracks -->
  <div class="heads">
    <div class="heads-inner" style:transform={`translateY(${-timelineView.scrollTop}px)`}>
      {#each tracks as t (t.patch.id)}
        <div class="track-head" style:--track-color={channelColor(t.patch.color)}>
          <div class="track-name" style:height={`${TRACK_H}px`} title={t.patch.name}>
            <span class="dot" aria-hidden="true"></span>
            <span class="name">{t.patch.name}</span>
          </div>
          {#each t.rows as r (r.module.id)}
            <div class="row-name" style:height={`${ROW_H}px`}>{r.label}</div>
          {:else}
            <div class="row-name empty" style:height={`${EMPTY_H}px`}>No sequencer</div>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <!-- The tracks -->
  <div class="body" bind:this={body} bind:clientWidth={viewW} {onscroll} onwheel={(e) => onwheel(e, 'body')}>
    <div class="content" class:beats={showsBeats(ppb)} style:width={`${contentW}px`}>
      {#each tracks as t (t.patch.id)}
        <div class="track" style:--track-color={channelColor(t.patch.color)}>
          <div class="track-top" style:height={`${TRACK_H}px`}></div>
          {#each t.rows as r (r.module.id)}
            <div class="row" style:height={`${ROW_H}px`} aria-label={`${t.patch.name}: ${r.label}`}></div>
          {:else}
            <div class="row empty" style:height={`${EMPTY_H}px`}></div>
          {/each}
        </div>
      {/each}
      {#if loop.on}
        <div class="loop-shade" style:left={`${loop.start * ppb}px`} style:width={`${(loop.end - loop.start) * ppb}px`}></div>
      {/if}
      <div class="end-shade" style:left={`${timeline.end * ppb}px`}></div>
      <div class="playhead" style:left={`${shownBeat * ppb}px`}></div>
    </div>
  </div>
</main>

<style>
  .timeline {
    --header-w: 184px;
    --ruler-h: 36px;
    --grid-bar: rgb(255 255 255 / 0.1);
    --grid-beat: rgb(255 255 255 / 0.04);
    --loop-color: var(--signal-cv);
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: var(--header-w) 1fr;
    grid-template-rows: var(--ruler-h) 1fr;
    background: var(--bg-canvas);
    overflow: hidden;
    user-select: none;
  }

  /* ---------- Corner toolbar ---------- */
  .corner {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    background: var(--surface-bar);
    border-right: 1px solid var(--border-subtle);
    border-bottom: 1px solid var(--border-subtle);
  }
  .grow {
    flex: 1;
  }
  .tool {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .tool:hover {
    background: var(--surface-control-hover);
  }
  .tool.icon {
    width: 24px;
    padding: 0;
    justify-content: center;
  }
  .loop-toggle.on {
    background: var(--loop-color);
    border-color: var(--loop-color);
    color: var(--text-on-accent);
  }

  /* ---------- Ruler ---------- */
  .ruler {
    position: relative;
    overflow: hidden;
    background: var(--surface-bar);
    border-bottom: 1px solid var(--border-subtle);
    touch-action: none;
  }
  .ruler-inner {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    background-image: repeating-linear-gradient(to right, var(--grid-bar) 0 1px, transparent 1px var(--bar));
    background-size: 100% 10px;
    background-position: 0 100%;
    background-repeat: repeat-x;
  }
  .loop-range {
    position: absolute;
    top: 2px;
    height: 10px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--loop-color) 22%, transparent);
    border: 1px solid color-mix(in srgb, var(--loop-color) 45%, transparent);
  }
  .loop-range.on {
    background: color-mix(in srgb, var(--loop-color) 70%, transparent);
    border-color: var(--loop-color);
  }
  .bar-label {
    position: absolute;
    top: 15px;
    padding-left: 4px;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    pointer-events: none;
  }
  .end-flag {
    position: absolute;
    top: 15px;
    height: 16px;
    padding: 0 5px 0 4px;
    transform: translateX(-100%);
    border-right: 2px solid var(--text-strong);
    font-size: var(--text-xs);
    line-height: 16px;
    color: var(--text-strong);
    background: var(--surface-control);
    border-radius: 3px 0 0 3px;
    pointer-events: none;
  }
  .playhead-mark {
    position: absolute;
    bottom: 0;
    width: 0;
    height: 0;
    margin-left: -6px;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 9px solid var(--signal-audio);
    pointer-events: none;
  }

  /* ---------- Track names ---------- */
  .heads {
    position: relative;
    overflow: hidden;
    background: var(--surface-bar);
    border-right: 1px solid var(--border-subtle);
  }
  .track-head {
    border-bottom: 1px solid var(--border-default);
    border-left: 3px solid var(--track-color);
  }
  .track-name {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--text-strong);
    background: color-mix(in srgb, var(--track-color) 14%, transparent);
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--track-color);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-name {
    display: flex;
    align-items: center;
    padding: 0 8px 0 22px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    border-top: 1px solid var(--border-subtle);
  }
  .row-name.empty {
    color: var(--text-muted);
    font-style: italic;
  }

  /* ---------- Tracks ---------- */
  .body {
    position: relative;
    overflow: auto;
  }
  .content {
    position: relative;
    min-height: 100%;
    background-image: repeating-linear-gradient(to right, var(--grid-bar) 0 1px, transparent 1px var(--bar));
  }
  .content.beats {
    background-image:
      repeating-linear-gradient(to right, var(--grid-bar) 0 1px, transparent 1px var(--bar)),
      repeating-linear-gradient(to right, var(--grid-beat) 0 1px, transparent 1px var(--ppb));
  }
  .track {
    border-bottom: 1px solid var(--border-default);
  }
  .track-top {
    background: color-mix(in srgb, var(--track-color) 10%, transparent);
  }
  .row {
    border-top: 1px solid var(--border-subtle);
  }
  .row.empty {
    background: rgb(0 0 0 / 0.12);
  }
  .loop-shade {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--loop-color) 7%, transparent);
    border-left: 1px solid color-mix(in srgb, var(--loop-color) 50%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--loop-color) 50%, transparent);
    pointer-events: none;
  }
  .end-shade {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    background: rgb(0 0 0 / 0.28);
    border-left: 2px solid var(--text-strong);
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
