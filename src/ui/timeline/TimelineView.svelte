<!--
  The timeline: one track per patch (in tab order and colour), with a row for each of the patch's
  sequencers. Each block on a sequencer's row plays one of the sequencer's patterns (A–H; banks in
  the data) while the song is inside the block, starting at step 1; it shows the pattern's letter
  in the pattern's tint.
  - row: double-click an empty part to add a one-bar block (it plays the pattern chosen on the
    sequencer); drag on an empty part to select the blocks in a box, across rows and patches
    (Shift adds to the selection); a click on an empty part clears the selection
  - block: click to select it, Shift+click to add it to the selection or take it out; drag to move
    all selected blocks (blocked, they jump together to the nearest place where all fit); drag its
    edges to resize; double-click to open its pattern; right-click for a menu
  - keys: Ctrl+A selects all blocks, Escape clears; on the selection, A–H choose the pattern,
    Delete removes, Ctrl+D copies right after it, Ctrl+C copies and Ctrl+V pastes at the playhead
    (on the same sequencers, at the first place from there where all fit)
  - ruler: click or drag to place the playhead (Play starts there; while playing it jumps)
  - the strip above the numbers holds the loop: drag it to move, drag its edges to resize, drag
    on an empty part to draw a new one, double-click it to switch it on or off
  - the End flag marks the end of the song; drag it to change the length
  - the − and + buttons zoom around the playhead; Ctrl + mouse wheel zooms around the pointer; the wheel scrolls (Shift: sideways)
  Dragging snaps to the grid (bar, beat or sixteenth, depending on the zoom); hold Alt to place
  freely on sixteenths.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { engineState, setPlayhead, transportState } from '../../engine/engine.svelte';
  import { getDefinition } from '../../modules/registry';
  import { project } from '../../patch/patch.svelte';
  import {
    addClip,
    BEATS_PER_BAR,
    duplicateClip,
    freeRange,
    nearestGroupShift,
    nextClipId,
    clampBank,
    hasBanks,
    MAX_BEATS,
    moduleLabel,
    moduleTooltip,
    numberedTitle,
    renameModule,
    MIN_CLIP_LENGTH,
    removeClip,
    removeLane,
    addAutomation,
    laneOf,
    LANE_HEIGHT,
    laneHeight,
    setLaneHeight,
  } from '../../patch/timeline';
  import { overrideKey, overrides } from '../../engine/overrides.svelte';
  import type { AutomationLane, Clip, Patch } from '../../patch/types';
  import AutomationLaneRow from './AutomationLaneRow.svelte';
  import { placeMenu } from '../placeMenu';
  import { endDragLook, startDragLook } from '../dragLook';
  import {
    clearClipSelection,
    clipKey,
    clipSelection,
    isClipSelected,
    selectClip,
    setClipSelection,
    toggleClip,
  } from './clipSelection.svelte';
  import { blockClipboard } from './blockClipboard';
  import { bankColor } from '../../modules/sequencer/bankClipboard.svelte';
  import { bankLetter } from '../../modules/sequencer/banks';
  import { channelColor } from '../channelColors';
  import EditableName from '../components/EditableName.svelte';
  import { flash, showModule } from '../focus.svelte';
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

  // ---------- Lane heights: drag a lane's bottom edge, double-click it for the standard height ----------
  let laneResize: { patch: Patch; lane: AutomationLane; y0: number; h0: number } | null = $state(null);

  function onresizedown(e: PointerEvent, patch: Patch, lane: AutomationLane) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    laneResize = { patch, lane, y0: e.clientY, h0: laneHeight(patch, lane.module, lane.param) };
    startDragLook('ns-resize');
  }

  function onresizemove(e: PointerEvent) {
    if (!laneResize) return;
    const { patch, lane, y0, h0 } = laneResize;
    setLaneHeight(patch, lane.module, lane.param, h0 + e.clientY - y0);
  }

  function onresizeend() {
    if (laneResize) endDragLook();
    laneResize = null;
  }

  // ---------- Tracks ----------
  const tracks = $derived(
    project.patches.map((patch) => {
      const seqs = patch.modules.filter((m) => hasBanks(getDefinition(m.type)));
      const rows = seqs
        .map((module) => {
          const def = getDefinition(module.type);
          return { module, def, label: moduleLabel(def, module), numbered: numberedTitle(def, module) };
        })
        // In order of their numbers, so a renamed sequencer keeps its place.
        .sort((a, b) => a.numbered.localeCompare(b.numbered, undefined, { numeric: true }));
      // Automation lanes, in module order, then in the order of the module's controls.
      const lanes = patch.lanes
        .map((lane) => {
          const mi = patch.modules.findIndex((m) => m.id === lane.module);
          const module = patch.modules[mi];
          const def = module && getDefinition(module.type);
          const pi = def ? def.params.findIndex((s) => s.id === lane.param) : -1;
          if (!module || !def || pi < 0) return null;
          return { lane, module, spec: def.params[pi]!, label: moduleLabel(def, module), order: mi * 1000 + pi };
        })
        .filter((l) => l !== null)
        .sort((a, b) => a.order - b.order);
      return { patch, rows, lanes };
    }),
  );

  // Right-click menu on a lane's name.
  let laneMenu: { x: number; y: number; patch: Patch; lane: AutomationLane } | null = $state(null);

  // "+ Automation" menu of a track: every control of the patch that can be automated, by module.
  // Sequencers are left out (their 128 step controls would bury the rest; right-click a step
  // knob to automate it).
  let addMenu: { x: number; y: number; above: number; patch: Patch } | null = $state(null);

  function automatableControls(patch: Patch) {
    return patch.modules
      .map((module) => {
        const def = getDefinition(module.type);
        if (!def || hasBanks(def)) return null;
        const params = def.params.filter((s) => s.automatable !== false);
        return params.length ? { module, label: moduleLabel(def, module), params } : null;
      })
      .filter((g) => g !== null);
  }

  function addLane(patch: Patch, moduleId: string, param: string, value: number) {
    addAutomation(patch, moduleId, param, value);
    delete timelineView.folded[patch.id];
    addMenu = null;
  }

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

  /**
   * The zoom buttons zoom around the playhead: it keeps its place on screen, or, when it is out
   * of view, ends up in the middle.
   */
  function zoomAtPlayhead(factor: number) {
    const x = shownBeat * timelineView.ppb - timelineView.scrollLeft;
    if (x >= 0 && x <= viewW) {
      zoomTo(factor, x);
      return;
    }
    const z = zoomAround(timelineView.ppb, timelineView.scrollLeft, 0, factor);
    timelineView.ppb = z.ppb;
    requestAnimationFrame(() => {
      if (!body) return;
      body.scrollLeft = Math.max(0, shownBeat * z.ppb - viewW / 2);
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
    if (!body || drag || blockDrag) return;
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
    startDragLook(kind === 'loop-start' || kind === 'loop-end' || kind === 'end' ? 'ew-resize' : kind === 'loop-move' ? 'grabbing' : 'pointer');
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
    endDragLook();
  }

  function ondblclick(e: MouseEvent) {
    const top = ruler?.getBoundingClientRect().top ?? 0;
    if (e.clientY - top >= LOOP_H) return;
    const b = (e.clientX - (ruler?.getBoundingClientRect().left ?? 0) + timelineView.scrollLeft) / timelineView.ppb;
    if (b > loop.start && b < loop.end) project.timeline.loop.on = !loop.on;
  }

  // ---------- Blocks ----------
  /** A selected block being moved, where it started and the blocks it must not overlap. */
  interface MovingBlock {
    patch: Patch;
    clip: Clip;
    start0: number;
    others: Clip[];
  }
  type BlockDrag =
    | { kind: 'box'; x0: number; y0: number; x1: number; y1: number; base: string[] }
    | { kind: 'move'; clip: Clip; grab: number; items: MovingBlock[] }
    | { kind: 'resize-start' | 'resize-end'; patch: Patch; clip: Clip; lo: number; hi: number };
  let blockDrag = $state<BlockDrag | null>(null);
  let content: HTMLDivElement | undefined = $state();
  /** A press that moves less than this (px) is a click, not a box. */
  const CLICK_SLOP = 3;

  const clipsOn = (patch: Patch, module: string) => patch.clips.filter((c) => c.module === module);

  /** Beat under the pointer in the track area. */
  function bodyBeat(e: MouseEvent): number {
    const left = body?.getBoundingClientRect().left ?? 0;
    return Math.max(0, (e.clientX - left + (body?.scrollLeft ?? 0)) / timelineView.ppb);
  }

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const unitOf = (e: MouseEvent) => (e.altKey ? 0.25 : snapUnit(timelineView.ppb));

  /** Add a block on a row playing the bank chosen on the sequencer, and select it. */
  function createBlock(patch: Patch, moduleId: string, start: number, length: number) {
    const module = patch.modules.find((m) => m.id === moduleId);
    const def = module && getDefinition(module.type);
    if (!module || !def || length < MIN_CLIP_LENGTH) return;
    const clip = addClip(patch, def, moduleId, start, length, module.params['bank'] ?? 0);
    if (clip) selectClip(patch.id, clip.id);
  }

  /** Let a block play another bank of its sequencer. */
  function setBank(patch: Patch, clip: Clip, bank: number) {
    const module = patch.modules.find((m) => m.id === clip.module);
    clip.bank = clampBank(module && getDefinition(module.type), bank);
    menu = null;
  }

  /** Number of banks of a block's sequencer. */
  function banksOf(patch: Patch, clip: Clip): number {
    const module = patch.modules.find((m) => m.id === clip.module);
    return (module && getDefinition(module.type)?.banks) || 1;
  }

  /** Where the pointer is in the song area, in pixels from its top left corner. */
  function contentPoint(e: MouseEvent) {
    const r = content?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }

  /** A press on an empty spot of a row starts a selection box (Shift adds to the selection). */
  function onrowpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    menu = null;
    const { x, y } = contentPoint(e);
    blockDrag = { kind: 'box', x0: x, y0: y, x1: x, y1: y, base: e.shiftKey ? [...clipSelection.keys] : [] };
    if (!e.shiftKey) clearClipSelection();
    startBlockDrag();
  }

  const selectBox = $derived(
    blockDrag?.kind === 'box'
      ? {
          x: Math.min(blockDrag.x0, blockDrag.x1),
          y: Math.min(blockDrag.y0, blockDrag.y1),
          w: Math.abs(blockDrag.x1 - blockDrag.x0),
          h: Math.abs(blockDrag.y1 - blockDrag.y0),
        }
      : null,
  );

  /** The selected blocks and their patches (blocks that no longer exist are left out). */
  function selectedBlocks(): { patch: Patch; clip: Clip }[] {
    const out: { patch: Patch; clip: Clip }[] = [];
    for (const patch of project.patches) {
      for (const clip of patch.clips) if (isClipSelected(patch.id, clip.id)) out.push({ patch, clip });
    }
    return out;
  }

  /** The selected blocks ready to move together, with the blocks on their rows that stay put. */
  function movingBlocks(): MovingBlock[] {
    const sel = selectedBlocks();
    return sel.map(({ patch, clip }) => ({
      patch,
      clip,
      start0: clip.start,
      others: patch.clips.filter((c) => c.module === clip.module && !isClipSelected(patch.id, c.id)),
    }));
  }

  function onrowdblclick(e: MouseEvent, patch: Patch, moduleId: string) {
    const at = bodyBeat(e);
    const { lo, hi } = freeRange(patch, moduleId, at);
    const start = Math.max(lo, Math.floor(at / BEATS_PER_BAR) * BEATS_PER_BAR);
    createBlock(patch, moduleId, start, Math.min(hi, start + BEATS_PER_BAR) - start);
  }

  /** Open the block's sequencer with the block's pattern ready to edit. */
  function openBlock(e: MouseEvent, patch: Patch, clip: Clip) {
    e.stopPropagation();
    const module = patch.modules.find((m) => m.id === clip.module);
    if (!module) return;
    module.params['bank'] = clip.bank;
    showModule(patch.id, module.id);
  }

  // After a jump from a module, scroll the tracks so its row is in view.
  let heads: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (!flash.row || !heads || !body) return;
    void flash.n;
    const el = heads.querySelector<HTMLElement>(`[data-row="${CSS.escape(flash.row)}"]`);
    if (!el) return;
    const top = el.offsetTop;
    const view = body.clientHeight;
    if (top < body.scrollTop || top + el.offsetHeight > body.scrollTop + view) {
      body.scrollTop = Math.max(0, top - view / 2);
    }
  });

  function onblockpointerdown(e: PointerEvent, patch: Patch, clip: Clip) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    menu = null;
    if (e.shiftKey) {
      toggleClip(patch.id, clip.id);
      return;
    }
    const edge = (e.target as HTMLElement).dataset['edge'];
    if (edge === 'start' || edge === 'end') {
      selectClip(patch.id, clip.id);
      const { lo, hi } = freeRange(patch, clip.module, clip.start, clip.id);
      blockDrag = { kind: edge === 'start' ? 'resize-start' : 'resize-end', patch, clip, lo, hi };
    } else {
      if (!isClipSelected(patch.id, clip.id)) selectClip(patch.id, clip.id);
      blockDrag = { kind: 'move', clip, grab: bodyBeat(e) - clip.start, items: movingBlocks() };
    }
    startBlockDrag();
  }

  function startBlockDrag() {
    const k = blockDrag?.kind;
    startDragLook(k === 'resize-start' || k === 'resize-end' ? 'ew-resize' : k === 'move' ? 'grabbing' : 'default');
    window.addEventListener('pointermove', onblockdragmove);
    window.addEventListener('pointerup', onblockdragend);
    window.addEventListener('pointercancel', onblockdragend);
  }

  function onblockdragmove(e: PointerEvent) {
    const d = blockDrag;
    if (!d) return;
    const unit = unitOf(e);
    const at = bodyBeat(e);
    const min = Math.max(MIN_CLIP_LENGTH, unit);
    switch (d.kind) {
      case 'box': {
        const { x, y } = contentPoint(e);
        d.x1 = x;
        d.y1 = y;
        const r = content?.getBoundingClientRect();
        if (!r) break;
        const left = Math.min(d.x0, x) + r.left;
        const right = Math.max(d.x0, x) + r.left;
        const top = Math.min(d.y0, y) + r.top;
        const bottom = Math.max(d.y0, y) + r.top;
        const inside: string[] = [];
        for (const el of content!.querySelectorAll<HTMLElement>('.block[data-key]')) {
          const b = el.getBoundingClientRect();
          if (b.right > left && b.left < right && b.bottom > top && b.top < bottom) inside.push(el.dataset['key']!);
        }
        setClipSelection([...new Set([...d.base, ...inside])]);
        break;
      }
      case 'move': {
        // The grabbed block lands on the grid; the others move by the same amount. Blocked by
        // other blocks, the group jumps to the nearest place where all of them fit.
        const grabbed = d.items.find((it) => it.clip === d.clip);
        const start0 = grabbed?.start0 ?? d.clip.start;
        const want = snap(at - d.grab, unit) - start0;
        const shift = nearestGroupShift(
          d.items.map((it) => ({ start: it.start0, length: it.clip.length, others: it.others })),
          want,
        );
        if (!Number.isNaN(shift)) for (const it of d.items) it.clip.start = it.start0 + shift;
        break;
      }
      case 'resize-end': {
        const end = clamp(snap(at, unit), d.clip.start + min, d.hi);
        if (end > d.clip.start) d.clip.length = end - d.clip.start;
        break;
      }
      case 'resize-start': {
        const end = d.clip.start + d.clip.length;
        const start = clamp(snap(at, unit), d.lo, end - min);
        if (start < end) {
          d.clip.start = start;
          d.clip.length = end - start;
        }
        break;
      }
    }
  }

  function onblockdragend() {
    const d = blockDrag;
    blockDrag = null;
    if (d) endDragLook();
    window.removeEventListener('pointermove', onblockdragmove);
    window.removeEventListener('pointerup', onblockdragend);
    window.removeEventListener('pointercancel', onblockdragend);
    if (d?.kind === 'box') {
      const click = Math.abs(d.x1 - d.x0) < CLICK_SLOP && Math.abs(d.y1 - d.y0) < CLICK_SLOP;
      if (click) setClipSelection([...d.base]);
    }
  }

  $effect(() => () => onblockdragend());

  /** Remove the selected blocks. */
  function deleteSelected() {
    for (const { patch, clip } of selectedBlocks()) removeClip(patch, clip.id);
    clearClipSelection();
  }

  /** Add blocks for a group placed at `shift` from where `items` say, and select them. */
  function placeGroup(items: { patch: Patch; module: string; start: number; length: number; bank: number }[], shift: number) {
    const keys: string[] = [];
    for (const it of items) {
      const module = it.patch.modules.find((m) => m.id === it.module);
      const clip: Clip = {
        id: nextClipId(it.patch),
        module: it.module,
        start: it.start + shift,
        length: it.length,
        bank: clampBank(module && getDefinition(module.type), it.bank),
      };
      it.patch.clips.push(clip);
      keys.push(clipKey(it.patch.id, clip.id));
    }
    setClipSelection(keys);
  }

  const othersOn = (patch: Patch, module: string) => patch.clips.filter((c) => c.module === module);

  /** Ctrl+D: copy the selected blocks, as a group, to the first free place right after them. */
  function duplicateSelected() {
    const sel = selectedBlocks();
    if (sel.length === 0) return;
    const first = Math.min(...sel.map((s) => s.clip.start));
    const span = Math.max(...sel.map((s) => s.clip.start + s.clip.length)) - first;
    const items = sel.map(({ patch, clip }) => ({ patch, module: clip.module, start: clip.start, length: clip.length, bank: clip.bank }));
    const shift = nearestGroupShift(
      items.map((it) => ({ start: it.start, length: it.length, others: othersOn(it.patch, it.module) })),
      span,
      span,
    );
    if (!Number.isNaN(shift)) placeGroup(items, shift);
  }

  /** Ctrl+C: remember the selected blocks. */
  function copySelected() {
    const sel = selectedBlocks();
    if (sel.length === 0) return;
    const first = Math.min(...sel.map((s) => s.clip.start));
    blockClipboard.blocks = sel.map(({ patch, clip }) => ({
      patch: patch.id,
      module: clip.module,
      offset: clip.start - first,
      length: clip.length,
      bank: clip.bank,
    }));
  }

  /** Ctrl+V: paste copied blocks at the playhead, or at the first place after it where they fit. */
  function pasteBlocks() {
    const at = Math.max(0, snap(shownBeat, snapUnit(timelineView.ppb)));
    const items = blockClipboard.blocks.flatMap((b) => {
      const patch = project.patches.find((p) => p.id === b.patch);
      if (!patch || !patch.modules.some((m) => m.id === b.module)) return [];
      return [{ patch, module: b.module, start: at + b.offset, length: b.length, bank: b.bank }];
    });
    if (items.length === 0) return;
    const shift = nearestGroupShift(
      items.map((it) => ({ start: it.start, length: it.length, others: othersOn(it.patch, it.module) })),
      0,
      0,
    );
    if (!Number.isNaN(shift)) placeGroup(items, shift);
  }

  /** Keys A–H: let every selected block play that pattern (where its sequencer has it). */
  function setSelectedBank(bank: number): boolean {
    let any = false;
    for (const { patch, clip } of selectedBlocks()) {
      if (bank < banksOf(patch, clip)) {
        setBank(patch, clip, bank);
        any = true;
      }
    }
    return any;
  }

  function deleteBlock(patch: Patch, clip: Clip) {
    removeClip(patch, clip.id);
    clearClipSelection();
    menu = null;
  }

  function copyBlock(patch: Patch, clip: Clip) {
    const copy = duplicateClip(patch, clip.id);
    if (copy) selectClip(patch.id, copy.id);
    menu = null;
  }

  // Right-click menu on a block.
  let menu: { x: number; y: number; patch: Patch; clip: Clip } | null = $state(null);

  function onkeydown(e: KeyboardEvent) {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    if (e.key === 'Escape') {
      menu = null;
      laneMenu = null;
      addMenu = null;
      clearClipSelection();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'a') {
      e.preventDefault();
      setClipSelection(project.patches.flatMap((p) => p.clips.map((c) => clipKey(p.id, c.id))));
      return;
    }
    if (mod && key === 'v') {
      if (blockClipboard.blocks.length > 0) {
        e.preventDefault();
        pasteBlocks();
      }
      return;
    }
    if (clipSelection.keys.length === 0) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    } else if (mod && key === 'd') {
      e.preventDefault();
      duplicateSelected();
    } else if (mod && key === 'c') {
      e.preventDefault();
      copySelected();
    } else if (!mod && !e.altKey && /^[a-z]$/i.test(e.key)) {
      // A–H: the pattern the blocks play.
      if (setSelectedBank(e.key.toUpperCase().charCodeAt(0) - 65)) e.preventDefault();
    }
  }

  const cursor = $derived.by(() => {
    const k = drag?.kind ?? hover;
    if (k === 'loop-start' || k === 'loop-end' || k === 'end') return 'ew-resize';
    if (k === 'loop-move') return drag ? 'grabbing' : 'grab';
    return 'pointer';
  });
</script>

<main class="timeline" aria-label="Timeline" style:--ppb={`${ppb}px`} style:--bar={`${ppb * BEATS_PER_BAR}px`}>
  {#snippet resizer(patch: Patch, lane: AutomationLane)}
    <div
      class="lane-resize"
      class:active={laneResize?.lane === lane}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Lane height"
      title="Drag to change the lane's height; double-click for the standard height"
      onpointerdown={(e) => onresizedown(e, patch, lane)}
      onpointermove={onresizemove}
      onpointerup={onresizeend}
      onpointercancel={onresizeend}
      ondblclick={(e) => {
        e.stopPropagation();
        setLaneHeight(patch, lane.module, lane.param, LANE_HEIGHT);
      }}
    ></div>
  {/snippet}

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
    <button class="tool icon" type="button" title="Zoom out around the playhead (Ctrl + wheel: around the pointer)" aria-label="Zoom out" onclick={() => zoomAtPlayhead(1 / 1.5)}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
    <button class="tool icon" type="button" title="Zoom in around the playhead (Ctrl + wheel: around the pointer)" aria-label="Zoom in" onclick={() => zoomAtPlayhead(1.5)}>
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
    <div class="heads-inner" bind:this={heads} style:transform={`translateY(${-timelineView.scrollTop}px)`}>
      {#each tracks as t (t.patch.id)}
        <div class="track-head" style:--track-color={channelColor(t.patch.color)}>
          <div class="track-name" style:height={`${TRACK_H}px`} title={t.patch.name}>
            {#if t.lanes.length > 0}
              <button
                type="button"
                class="fold"
                class:folded={timelineView.folded[t.patch.id]}
                aria-expanded={!timelineView.folded[t.patch.id]}
                aria-label={timelineView.folded[t.patch.id] ? 'Show automation' : 'Hide automation'}
                title={timelineView.folded[t.patch.id] ? `Show automation (${t.lanes.length})` : 'Hide automation'}
                onclick={() => (timelineView.folded[t.patch.id] = !timelineView.folded[t.patch.id])}>▾</button
              >
            {:else}
              <span class="dot" aria-hidden="true"></span>
            {/if}
            <span class="name">{t.patch.name}</span>
            <button
              type="button"
              class="free-toggle"
              class:on={t.patch.free}
              aria-pressed={!!t.patch.free}
              title={t.patch.free
                ? 'Free: this patch ignores the timeline and its sequencers play the pattern chosen on the module. Click to follow the timeline again.'
                : 'Follows the timeline. Click for Free: ignore the blocks and play the pattern chosen on the module.'}
              onclick={() => {
                if (t.patch.free) delete t.patch.free;
                else t.patch.free = true;
              }}>Free</button
            >
            <button
              type="button"
              class="add-lane"
              aria-label={`Add automation to ${t.patch.name}`}
              title="Add automation: choose a control of this patch"
              aria-haspopup="menu"
              onclick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                addMenu = { x: r.left, y: r.bottom + 4, above: r.top - 4, patch: t.patch };
              }}>+</button
            >
          </div>
          {#each t.rows as r (r.module.id)}
            <div
              class="row-name"
              class:flash={flash.row === `${t.patch.id}:${r.module.id}`}
              data-row={`${t.patch.id}:${r.module.id}`}
              style:height={`${ROW_H}px`}
            >
              <EditableName
                text={r.label}
                value={r.module.name ?? ''}
                placeholder={r.numbered}
                label="Sequencer name"
                title={moduleTooltip(r.def, r.module)}
                onrename={(name) => renameModule(r.module, name)}
              />
              <button
                type="button"
                class="show-module"
                aria-label={`Show ${r.label} in its patch`}
                title="Show this sequencer in its patch"
                onclick={() => showModule(t.patch.id, r.module.id)}>↗</button
              >
            </div>
          {:else}
            <div class="row-name empty" style:height={`${EMPTY_H}px`}>No sequencer</div>
          {/each}
          {#if !timelineView.folded[t.patch.id]}
            {#each t.lanes as l (`${l.lane.module}:${l.lane.param}`)}
              {@const paused = !!overrides.keys[overrideKey(t.patch.id, l.lane.module, l.lane.param)]}
              <!-- svelte-ignore a11y_no_static_element_interactions (right-click menu; the × button is the accessible way) -->

              <div
                class="lane-name"
                class:paused
                class:flash={flash.row === `${t.patch.id}:${l.lane.module}`}
                data-row={`${t.patch.id}:${l.lane.module}`}
                style:height={`${laneHeight(t.patch, l.lane.module, l.lane.param)}px`}
                title={`Automation: ${l.label} · ${l.spec.label}. Right-click for options.`}
                oncontextmenu={(e) => {
                  e.preventDefault();
                  laneMenu = { x: e.clientX, y: e.clientY, patch: t.patch, lane: l.lane };
                }}
              >
                <span class="lane-module">{l.label}</span>
                <span class="lane-param">{l.spec.label}</span>
                {#if paused}
                  <span class="lane-paused" title="You turned this control: its automation pauses until the next Play">paused</span>
                {/if}
                <button
                  type="button"
                  class="lane-remove"
                  aria-label={`Remove automation of ${l.label} ${l.spec.label}`}
                  title="Remove automation"
                  onclick={() => removeLane(t.patch, l.lane.module, l.lane.param)}>×</button
                >
                {@render resizer(t.patch, l.lane)}
              </div>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- The tracks -->
  <div class="body" bind:this={body} bind:clientWidth={viewW} {onscroll} onwheel={(e) => onwheel(e, 'body')}>
    <div class="content" bind:this={content} class:beats={showsBeats(ppb)} style:width={`${contentW}px`}>
      {#each tracks as t (t.patch.id)}
        <div class="track" class:free={t.patch.free} style:--track-color={channelColor(t.patch.color)}>
          <div class="track-top" style:height={`${TRACK_H}px`}></div>
          {#each t.rows as r (r.module.id)}
            <!-- svelte-ignore a11y_no_static_element_interactions (drawing blocks is a pointer gesture) -->
            <div
              class="row"
              style:height={`${ROW_H}px`}
              aria-label={`${t.patch.name}: ${r.label}`}
              onpointerdown={onrowpointerdown}
              ondblclick={(e) => onrowdblclick(e, t.patch, r.module.id)}
            >
              {#each clipsOn(t.patch, r.module.id) as c (c.id)}
                {@const selected = isClipSelected(t.patch.id, c.id)}
                <div
                  class="block"
                  class:selected
                  class:moving={blockDrag?.kind === 'move' && blockDrag.items.some((it) => it.clip === c)}
                  data-key={clipKey(t.patch.id, c.id)}
                  style:left={`${c.start * ppb}px`}
                  style:width={`${c.length * ppb}px`}
                  style:--bank-color={bankColor(c.bank)}
                  role="button"
                  tabindex="-1"
                  aria-pressed={selected}
                  aria-label={`Pattern ${bankLetter(c.bank)}, block ${formatPosition(c.start)}, ${formatLength(c.length)}`}
                  title={`Pattern ${bankLetter(c.bank)}: ${formatPosition(c.start)} – ${formatPosition(c.start + c.length)} (${formatLength(c.length)})`}
                  onpointerdown={(e) => onblockpointerdown(e, t.patch, c)}
                  ondblclick={(e) => openBlock(e, t.patch, c)}
                  oncontextmenu={(e) => {
                    e.preventDefault();
                    selectClip(t.patch.id, c.id);
                    menu = { x: e.clientX, y: e.clientY, patch: t.patch, clip: c };
                  }}
                >
                  <span class="bank-label">{c.length * ppb >= 64 ? `Pattern ${bankLetter(c.bank)}` : bankLetter(c.bank)}</span>
                  <span class="edge start" data-edge="start"></span>
                  <span class="edge end" data-edge="end"></span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="row empty" style:height={`${EMPTY_H}px`}></div>
          {/each}
          {#if !timelineView.folded[t.patch.id]}
            {#each t.lanes as l (`${l.lane.module}:${l.lane.param}`)}
              <div
                class="lane-row"
                class:paused={!!overrides.keys[overrideKey(t.patch.id, l.lane.module, l.lane.param)]}
                style:height={`${laneHeight(t.patch, l.lane.module, l.lane.param)}px`}
              >
                <AutomationLaneRow
                  lane={l.lane}
                  spec={l.spec}
                  {ppb}
                  width={contentW}
                  height={laneHeight(t.patch, l.lane.module, l.lane.param) - 1}
                  color="var(--track-color)"
                />
                {@render resizer(t.patch, l.lane)}
              </div>
            {/each}
          {/if}
        </div>
      {/each}
      {#if loop.on}
        <div class="loop-shade" style:left={`${loop.start * ppb}px`} style:width={`${(loop.end - loop.start) * ppb}px`}></div>
      {/if}
      <div class="end-shade" style:left={`${timeline.end * ppb}px`}></div>
      <div class="playhead" style:left={`${shownBeat * ppb}px`}></div>
      {#if selectBox}
        <div class="select-box" style:left={`${selectBox.x}px`} style:top={`${selectBox.y}px`} style:width={`${selectBox.w}px`} style:height={`${selectBox.h}px`}></div>
      {/if}
    </div>
  </div>
</main>

{#if menu}
  {@const m = menu}
  <div class="backdrop" role="presentation" onpointerdown={() => (menu = null)} oncontextmenu={(e) => e.preventDefault()}></div>
  <div class="menu" role="menu" use:placeMenu={{ x: m.x, y: m.y }}>
    <div class="menu-caption">Pattern <kbd>A–{bankLetter(banksOf(m.patch, m.clip) - 1)}</kbd></div>
    <div class="menu-banks" role="group" aria-label="Pattern">
      {#each Array.from({ length: banksOf(m.patch, m.clip) }, (_, i) => i) as b (b)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={m.clip.bank === b}
          class:current={m.clip.bank === b}
          style:--bank-color={bankColor(b)}
          title={`Play pattern ${bankLetter(b)}`}
          onclick={() => setBank(m.patch, m.clip, b)}
        >
          {bankLetter(b)}
        </button>
      {/each}
    </div>
    <div class="menu-sep" role="separator"></div>
    <button type="button" role="menuitem" onclick={() => copyBlock(m.patch, m.clip)}>Duplicate <kbd>Ctrl+D</kbd></button>
    <button type="button" role="menuitem" class="danger" onclick={() => deleteBlock(m.patch, m.clip)}>Delete <kbd>Del</kbd></button>
  </div>
{/if}

{#if addMenu}
  {@const m = addMenu}
  {@const groups = automatableControls(m.patch)}
  <div class="backdrop" role="presentation" onpointerdown={() => (addMenu = null)} oncontextmenu={(e) => e.preventDefault()}></div>
  <div class="menu add-menu" role="menu" style:--track-color={channelColor(m.patch.color)} use:placeMenu={{ x: m.x, y: m.y, above: m.above }}>
    <div class="menu-caption">Automate a control of {m.patch.name}</div>
    {#each groups as g (g.module.id)}
      <div class="menu-group">{g.label}</div>
      {#each g.params as s (s.id)}
        {@const has = !!laneOf(m.patch, g.module.id, s.id)}
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={has}
          class:has
          title={has ? 'Already automated' : `Automate ${g.label} · ${s.label}`}
          onclick={() => (has ? (addMenu = null) : addLane(m.patch, g.module.id, s.id, g.module.params[s.id] ?? s.default))}
        >
          <span class="check" aria-hidden="true">{has ? '✓' : ''}</span>{s.label}
        </button>
      {/each}
    {:else}
      <div class="menu-empty">This patch has no controls to automate yet.</div>
    {/each}
  </div>
{/if}

{#if laneMenu}
  {@const m = laneMenu}
  <div class="backdrop" role="presentation" onpointerdown={() => (laneMenu = null)} oncontextmenu={(e) => e.preventDefault()}></div>
  <div class="menu" role="menu" use:placeMenu={{ x: m.x, y: m.y }}>
    <button
      type="button"
      role="menuitem"
      class="danger"
      onclick={() => {
        removeLane(m.patch, m.lane.module, m.lane.param);
        laneMenu = null;
      }}>Remove automation</button
    >
  </div>
{/if}

<svelte:window {onkeydown} />

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
  .free-toggle {
    flex: none;
    margin-left: auto;
    height: 18px;
    padding: 0 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    cursor: pointer;
  }
  .free-toggle:hover {
    background: var(--surface-control-hover);
    color: var(--text-default);
  }
  .free-toggle.on {
    border-color: var(--track-color);
    background: color-mix(in srgb, var(--track-color) 45%, transparent);
    color: var(--text-strong);
  }
  /* A Free patch ignores its blocks: they stay, faded. */
  .track.free .block:not(.ghost) {
    opacity: 0.35;
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
    min-width: 0;
    overflow: hidden;
    padding: 0 8px 0 22px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    border-top: 1px solid var(--border-subtle);
  }
  .show-module {
    flex: none;
    margin-left: auto;
    width: 20px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font-size: var(--text-sm);
    opacity: 0.55;
    cursor: pointer;
  }
  .show-module:hover {
    opacity: 1;
    background: rgb(255 255 255 / 0.12);
  }
  /* Lights up briefly after a jump from the module. */
  .row-name.flash,
  .lane-name.flash {
    animation: row-flash 1.4s ease-out;
  }
  @keyframes row-flash {
    0%,
    40% {
      background: color-mix(in srgb, var(--border-focus) 35%, transparent);
      color: var(--text-strong);
    }
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
    position: relative;
    border-top: 1px solid var(--border-subtle);
    cursor: crosshair;
  }
  .lane-resize {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -3px;
    height: 7px;
    z-index: 2;
    cursor: ns-resize;
  }
  .lane-resize:hover,
  .lane-resize.active {
    background: linear-gradient(transparent 2px, var(--track-color) 2px, var(--track-color) 4px, transparent 4px);
  }
  .lane-row {
    position: relative;
    border-top: 1px dashed var(--border-subtle);
    background: rgb(0 0 0 / 0.12);
  }
  /* A Free patch ignores its automation too: the lines stay, faded. */
  .track.free .lane-row :global(svg) {
    opacity: 0.35;
  }
  .lane-name {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 0 6px 0 22px;
    border-top: 1px dashed var(--border-subtle);
    background: rgb(0 0 0 / 0.12);
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .lane-module {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lane-param {
    flex: none;
    color: var(--text-default);
    font-weight: var(--weight-bold);
  }
  .lane-paused {
    flex: none;
    padding: 0 4px;
    border: 1px dashed var(--track-color);
    border-radius: var(--radius-sm);
    color: var(--track-color);
    font-size: 9px;
  }
  .lane-row.paused :global(svg) {
    opacity: 0.4;
  }
  .add-lane {
    flex: none;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    color: var(--text-default);
    font-size: var(--text-sm);
    line-height: 1;
    cursor: pointer;
  }
  .add-lane:hover {
    background: var(--surface-control-hover);
  }
  .add-menu {
    max-height: min(420px, 70vh);
    overflow-y: auto;
    min-width: 200px;
  }
  .menu-group {
    padding: 6px 8px 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }
  .menu-empty {
    padding: 6px 8px;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .menu.add-menu button {
    justify-content: flex-start;
  }
  .add-menu .check {
    display: inline-block;
    width: 16px;
    color: var(--track-color);
  }
  .add-menu button.has {
    color: var(--text-muted);
  }
  .lane-remove {
    flex: none;
    margin-left: auto;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: inherit;
    font-size: var(--text-sm);
    opacity: 0.6;
    cursor: pointer;
  }
  .lane-remove:hover {
    opacity: 1;
    background: rgb(255 255 255 / 0.12);
  }
  .fold {
    flex: none;
    width: 14px;
    height: 18px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-default);
    font-size: 11px;
    cursor: pointer;
    transition: transform 0.12s;
  }
  .fold.folded {
    transform: rotate(-90deg);
  }

  /* ---------- Blocks ---------- */
  .block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    display: flex;
    align-items: stretch;
    padding: 4px 6px;
    overflow: hidden;
    border-radius: 5px;
    background: color-mix(in srgb, var(--bank-color, var(--track-color)) 38%, var(--surface-module));
    border: 1px solid color-mix(in srgb, var(--bank-color, var(--track-color)) 80%, black);
    cursor: grab;
    z-index: 1;
  }
  :global(html:not(.dragging)) .block:hover {
    background: color-mix(in srgb, var(--bank-color, var(--track-color)) 50%, var(--surface-module));
  }
  .block.selected {
    border-color: var(--text-strong);
    box-shadow: 0 0 0 1px var(--text-strong);
    z-index: 2;
  }
  .block.moving {
    cursor: grabbing;
  }
  .select-box {
    position: absolute;
    z-index: 5;
    border: 1px dashed var(--text-strong);
    background: rgb(255 255 255 / 0.08);
    pointer-events: none;
  }
  .bank-label {
    align-self: flex-start;
    color: var(--text-strong);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    white-space: nowrap;
    pointer-events: none;
  }
  .edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
  }
  .edge.start {
    left: 0;
  }
  .edge.end {
    right: 0;
  }

  /* ---------- Block menu ---------- */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 260000;
  }
  .menu {
    position: fixed;
    z-index: 260001;
    min-width: 170px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    background: var(--surface-module);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.5);
  }
  .menu button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-default);
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--surface-control-hover);
  }
  .menu button.danger {
    color: var(--danger);
  }
  .menu-caption {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px 2px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
  .menu-banks {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
    padding: 2px 4px 4px;
  }
  .menu .menu-banks button {
    justify-content: center;
    height: 24px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--bank-color) 60%, transparent);
    background: color-mix(in srgb, var(--bank-color) 18%, transparent);
    font-weight: var(--weight-bold);
  }
  .menu .menu-banks button:hover {
    background: color-mix(in srgb, var(--bank-color) 35%, transparent);
  }
  .menu .menu-banks button.current {
    border-color: var(--text-strong);
    background: color-mix(in srgb, var(--bank-color) 55%, transparent);
    color: var(--text-strong);
  }
  .menu-sep {
    height: 1px;
    margin: 3px 4px;
    background: var(--border-strong);
  }
  kbd {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--text-muted);
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
