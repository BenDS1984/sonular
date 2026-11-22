<!--
  The mixer: the Channel of every patch side by side, in tab order, then the channel of every
  audio track (added on the timeline), with the master channel fixed on the right. The strips are the same settings as the Channel modules in the patches.
  - click a name: rename; the grip above a strip: drag sideways to change the order (the tabs
    follow). The dragged strip follows the pointer and the others slide aside.
  - the master has a fader and a stereo meter of everything together
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import ChannelStrip from '../../modules/channel/ChannelStrip.svelte';
  import AudioStrip from './AudioStrip.svelte';
  import { engineState, meterValueIn } from '../../engine/engine.svelte';
  import { getDefinition } from '../../modules/registry';
  import { CHANNEL_TYPE } from '../../patch/operations';
  import { movePatch, project } from '../../patch/patch.svelte';
  import Fader from '../components/Fader.svelte';
  import Meter from '../components/Meter.svelte';

  /** Same height as the Channel module's meters, so both read the same. */
  const METER_HEIGHT = 168;
  const MASTER_MAX = 2;

  const def = getDefinition(CHANNEL_TYPE);

  const strips = $derived(
    project.patches.flatMap((p) => {
      const channel = p.modules.find((m) => m.type === CHANNEL_TYPE);
      return channel ? [{ patch: p, channel }] : [];
    }),
  );

  /** Height of a channel strip, so the master strip matches it. */
  let stripHeight = $state(0);

  // ---------- Master clip lamps: clicking either one clears both ----------
  let clipL = $state(false);
  let clipR = $state(false);
  const resetClip = () => {
    clipL = false;
    clipR = false;
  };
  const masterL = $derived(engineState.playing ? engineState.peakL : 0);
  const masterR = $derived(engineState.playing ? engineState.peakR : 0);

  // ---------- Drag a strip by its grip to change the order ----------
  let channelsEl: HTMLDivElement | undefined = $state();
  const stripEls: Record<string, HTMLElement> = {};
  /** grab: pointer distance from the strip's left edge when the drag started. */
  let drag: { id: string; startX: number; grab: number; moved: boolean; x: number } | null = null;
  let dragging = $state<string | null>(null);
  /** How far the dragged strip is shifted from its place in the row, to stay under the pointer. */
  let dx = $state(0);

  /** Left edge of a strip in its place in the row (on screen, ignoring any shift or animation). */
  function slotLeft(id: string): number {
    const el = stripEls[id];
    if (!el || !channelsEl) return NaN;
    return channelsEl.getBoundingClientRect().left + el.offsetLeft - channelsEl.scrollLeft;
  }

  function ongrippointerdown(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { id, startX: e.clientX, grab: e.clientX - slotLeft(id), moved: false, x: e.clientX };
    window.addEventListener('pointermove', ondragmove);
    window.addEventListener('pointerup', ondragend);
    window.addEventListener('pointercancel', ondragend);
  }

  function ondragmove(e: PointerEvent) {
    if (!drag) return;
    drag.x = e.clientX;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) < 5) return;
      drag.moved = true;
      dragging = drag.id;
    }
    // Swap with a neighbour once the dragged strip's middle passes the middle of its place.
    const id = drag.id;
    const width = stripEls[id]?.offsetWidth ?? 0;
    const centre = e.clientX - drag.grab + width / 2;
    const mid = (k: number) => {
      const other = project.patches[k]!.id;
      return slotLeft(other) + (stripEls[other]?.offsetWidth ?? 0) / 2;
    };
    const from = project.patches.findIndex((p) => p.id === id);
    let to = from;
    while (to + 1 < project.patches.length && centre > mid(to + 1)) to++;
    if (to === from) while (to > 0 && centre < mid(to - 1)) to--;
    if (to !== from) movePatch(from, to);
    // The row changes on the next update; then keep the strip under the pointer.
    void tick().then(followPointer);
    followPointer();
  }

  function followPointer() {
    if (!drag?.moved) return;
    dx = drag.x - drag.grab - slotLeft(drag.id);
  }

  function ondragend() {
    drag = null;
    dragging = null;
    dx = 0;
    window.removeEventListener('pointermove', ondragmove);
    window.removeEventListener('pointerup', ondragend);
    window.removeEventListener('pointercancel', ondragend);
  }

  /** Slide strips to their new place when the order changes, except the one being dragged. */
  function slide(node: Element, rects: { from: DOMRect; to: DOMRect }, params: { skip: boolean }) {
    return params.skip ? { duration: 0 } : flip(node, rects, { duration: 180 });
  }

  $effect(() => () => ondragend());
</script>

<main class="mixer" aria-label="Mixer">
  <div class="channels" class:sorting={dragging !== null} bind:this={channelsEl}>
    {#if def}
      {#each strips as s (s.patch.id)}
        <section
          class="strip"
          class:dragging={dragging === s.patch.id}
          style:width={`${def.width}px`}
          style:transform={dragging === s.patch.id ? `translateX(${dx}px) scale(1.03)` : undefined}
          animate:slide={{ skip: dragging === s.patch.id }}
          bind:this={stripEls[s.patch.id]}
          bind:offsetHeight={stripHeight}
          aria-label={`Channel ${s.patch.name}`}
        >
          <div
            class="grip"
            role="presentation"
            title="Drag to change the order"
            onpointerdown={(e) => ongrippointerdown(e, s.patch.id)}
          >
            <svg viewBox="0 0 24 6" width="24" height="6" aria-hidden="true">
              {#each [3, 9, 15, 21] as x (x)}
                <circle cx={x} cy="1.5" r="1" fill="currentColor" />
                <circle cx={x} cy="4.5" r="1" fill="currentColor" />
              {/each}
            </svg>
          </div>
          <ChannelStrip
            target={s.patch}
            module={s.channel}
            {def}
            meterL={meterValueIn(s.patch.id, s.channel.id, 'meterL')}
            meterR={meterValueIn(s.patch.id, s.channel.id, 'meterR')}
            renameOnClick
          />
        </section>
      {/each}
    {/if}
    {#each project.audioTracks as t (t.id)}
      <section class="strip" style:width={`${def?.width ?? 152}px`} aria-label={`Audio channel ${t.name}`}>
        <div class="grip-space" aria-hidden="true"></div>
        <AudioStrip track={t} />
      </section>
    {/each}
  </div>

  <section
    class="strip master"
    aria-label="Master channel"
    style:width={`${def?.width ?? 152}px`}
    style:height={stripHeight ? `${stripHeight}px` : undefined}
  >
    <div class="grip-space" aria-hidden="true"></div>
    <div class="master-name">Master</div>
    <div class="main">
      <div class="meters">
        <Meter level={masterL} height={METER_HEIGHT} width={8} label="Master left" faderScale bind:clipped={clipL} onresetclip={resetClip} />
        <Meter level={masterR} height={METER_HEIGHT} width={8} label="Master right" faderScale bind:clipped={clipR} onresetclip={resetClip} />
      </div>
      <div class="fader">
        <Fader bind:value={project.masterLevel} defaultValue={1} max={MASTER_MAX} height={METER_HEIGHT} label="Master level" />
      </div>
    </div>
  </section>
</main>

<style>
  .mixer {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: flex-start;
    background: var(--bg-canvas);
    overflow: hidden;
  }
  .channels {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-5);
    overflow: auto;
  }
  .strip {
    flex: none;
    padding: 4px var(--space-3) var(--space-3);
    background: var(--sheen-module), var(--surface-module);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-module);
  }
  .channels {
    position: relative;
  }
  .channels.sorting {
    cursor: grabbing;
    user-select: none;
  }
  /* Back into place after a drop; no transition while following the pointer. */
  .channels .strip {
    position: relative;
    transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
  }
  .channels .strip.dragging {
    z-index: 2;
    transition: box-shadow 160ms var(--ease-out);
    border-color: var(--border-focus);
    box-shadow:
      var(--shadow-module),
      0 18px 40px rgb(0 0 0 / 0.55);
  }
  .grip,
  .grip-space {
    height: 14px;
    margin-bottom: 4px;
  }
  .grip {
    display: grid;
    place-items: center;
    color: var(--text-muted);
    cursor: grab;
    touch-action: none;
  }
  .grip:hover {
    color: var(--text-strong);
  }
  .strip.dragging .grip {
    cursor: grabbing;
  }
  /* The master stays on the right, apart from the patch channels. */
  .master {
    margin: var(--space-5) var(--space-5) var(--space-5) 0;
    border-left: 3px solid var(--border-strong);
  }
  .master-name {
    display: flex;
    align-items: center;
    height: 24px;
    margin-bottom: var(--space-2);
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-control);
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--text-strong);
    letter-spacing: 0.04em;
  }
  .main {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    gap: 4px;
  }
  .meters {
    display: flex;
    gap: 3px;
  }
  .fader {
    padding-top: 7px;
  }
</style>
