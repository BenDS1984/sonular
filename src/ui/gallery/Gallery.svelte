<!--
  Component gallery (open with #gallery).
  A living style guide: every UI building block in its states, plus preview versions of the
  first three modules. Meters are driven by a fake signal; nothing here produces sound.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Knob from '../components/Knob.svelte';
  import Port from '../components/Port.svelte';
  import Meter from '../components/Meter.svelte';
  import Toggle from '../components/Toggle.svelte';
  import Segmented from '../components/Segmented.svelte';
  import ModulePanel from '../components/ModulePanel.svelte';
  import WaveDisplay from '../components/WaveDisplay.svelte';
  import { formatCents, formatGainDb, formatPan, formatSemitones } from '../format';
  import { SIGNAL_LABELS, SIGNAL_TYPES } from '../signals';
  import { WAVEFORM_OPTIONS, type Waveform } from '../waveform';

  // ---------- Module preview state ----------
  let wave = $state<Waveform>('saw');
  let tune = $state(0);
  let fine = $state(0);
  let oscLevel = $state(0.7);

  const channels = $state(
    Array.from({ length: 4 }, () => ({ gain: 0.7, pan: 0, mute: false, meter: 0 })),
  );
  let mainGain = $state(0.8);
  let volume = $state(0.7);
  let mainMeter = $state({ l: 0, r: 0 });
  let outMeter = $state({ l: 0, r: 0 });

  // ---------- Showcase state ----------
  let demoSm = $state(0.3);
  let demoMd = $state(0.6);
  let demoLg = $state(0.85);
  let demoPan = $state(-0.35);
  let demoCutoff = $state(1200);
  let demoSteps = $state(4);
  const demoSignals = $state({ audio: 0.7, cv: 0.45, gate: 0.25, pitch: 0.55 });

  // Fake signal: only channel 1 is "patched" to the oscillator.
  onMount(() => {
    let raf = 0;
    const tick = () => {
      const src = oscLevel * (0.82 + 0.18 * Math.random());
      let l = 0;
      let r = 0;
      channels.forEach((ch, i) => {
        const v = i === 0 && !ch.mute ? src * ch.gain : 0;
        ch.meter = v;
        const a = ((ch.pan + 1) * Math.PI) / 4;
        l += v * Math.cos(a) * Math.SQRT2;
        r += v * Math.sin(a) * Math.SQRT2;
      });
      mainMeter = { l: l * mainGain, r: r * mainGain };
      outMeter = { l: mainMeter.l * volume, r: mainMeter.r * volume };
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const staticLevels = [-40, -18, -6, 0, 3].map((db) => ({ db, gain: Math.pow(10, db / 20) }));
</script>

<div class="gallery">
  <header class="intro">
    <h1>Component gallery</h1>
    <p>
      Sonular's visual building blocks. Drag knobs up and down (Shift for fine control), or
      double-click to reset. Meters run on a fake signal — nothing here makes sound yet.
    </p>
    <a href="#/">← Back to Sonular</a>
  </header>

  <section>
    <h2>Module preview</h2>
    <div class="modules">
      <ModulePanel title="Oscillator" width={204}>
        <div class="stack">
          <WaveDisplay {wave} amplitude={oscLevel / 0.7} />
          <Segmented bind:value={wave} options={WAVEFORM_OPTIONS} label="Waveform" />
          <div class="row">
            <Knob bind:value={tune} min={-24} max={24} step={1} bipolar label="Tune" format={formatSemitones} />
            <Knob bind:value={fine} min={-100} max={100} bipolar label="Fine" format={formatCents} />
            <Knob bind:value={oscLevel} min={0} max={1} defaultValue={0.7} label="Level" format={formatGainDb} />
          </div>
        </div>
        {#snippet ports()}
          <Port kind="in" signal="pitch" label="pitch" />
          <Port kind="out" label="out" connected />
        {/snippet}
      </ModulePanel>

      <ModulePanel title="Mixer" width={400}>
        <div class="mixer">
          {#each channels as ch, i (i)}
            <div class="strip">
              <Knob bind:value={ch.gain} size="sm" min={0} max={1.4} defaultValue={0.7} label={`Ch ${i + 1}`} format={formatGainDb} />
              <Knob bind:value={ch.pan} size="sm" min={-1} max={1} bipolar label="Pan" format={formatPan} />
              <div class="strip-foot">
                <Toggle bind:pressed={ch.mute} label="M" title={`Mute channel ${i + 1}`} tone="danger" />
                <Meter level={ch.meter} height={52} label={`Channel ${i + 1} level`} />
              </div>
            </div>
          {/each}
          <div class="strip main">
            <Knob bind:value={mainGain} min={0} max={1.4} defaultValue={0.8} label="Main" format={formatGainDb} />
            <div class="meters">
              <Meter level={mainMeter.l} height={96} label="Main left" />
              <Meter level={mainMeter.r} height={96} label="Main right" />
            </div>
          </div>
        </div>
        {#snippet ports()}
          <div class="port-group">
            <Port kind="in" label="in 1" connected />
            <Port kind="in" label="in 2" />
            <Port kind="in" label="in 3" />
            <Port kind="in" label="in 4" />
          </div>
          <Port kind="out" label="out" connected />
        {/snippet}
      </ModulePanel>

      <ModulePanel title="Output" width={140}>
        <div class="stack center">
          <div class="meters big">
            <Meter level={outMeter.l} height={110} width={10} label="Output left" />
            <Meter level={outMeter.r} height={110} width={10} label="Output right" />
          </div>
          <Knob bind:value={volume} size="lg" min={0} max={1} defaultValue={0.7} label="Volume" format={formatGainDb} />
        </div>
        {#snippet ports()}
          <Port kind="in" label="L" connected />
          <Port kind="in" label="R" />
        {/snippet}
      </ModulePanel>
    </div>
  </section>

  <section>
    <h2>Knobs</h2>
    <div class="showcase">
      <Knob bind:value={demoSm} size="sm" label="Small" />
      <Knob bind:value={demoMd} label="Medium" />
      <Knob bind:value={demoLg} size="lg" label="Large" />
      <Knob bind:value={demoPan} min={-1} max={1} bipolar label="Bipolar" format={formatPan} />
      <Knob bind:value={demoCutoff} min={20} max={20000} scale="log" defaultValue={1200} unit="Hz" label="Log scale" />
      <Knob bind:value={demoSteps} min={1} max={16} step={1} label="Stepped" format={(v) => String(v)} />
      <Knob value={0.5} label="Disabled" disabled />
    </div>
    <div class="showcase">
      {#each SIGNAL_TYPES as s (s)}
        <Knob bind:value={demoSignals[s]} signal={s} label={SIGNAL_LABELS[s]} />
      {/each}
    </div>
  </section>

  <section>
    <h2>Ports</h2>
    <p class="note">Outputs carry their signal colour; inputs stay grey until hovered. A filled centre means a cable is connected.</p>
    <div class="showcase">
      {#each SIGNAL_TYPES as s (s)}
        <div class="port-pair">
          <Port kind="in" signal={s} label="in" />
          <Port kind="in" signal={s} label="in" connected />
          <Port kind="out" signal={s} label="out" />
          <Port kind="out" signal={s} label="out" connected />
          <span class="caption">{SIGNAL_LABELS[s]}</span>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Meters and switches</h2>
    <div class="showcase">
      {#each staticLevels as m (m.db)}
        <div class="meter-sample">
          <Meter level={m.gain} height={90} width={8} />
          <span class="caption">{m.db > 0 ? '+' : ''}{m.db} dB</span>
        </div>
      {/each}
      <div class="meter-sample">
        <Toggle pressed={false} label="M" tone="danger" />
        <span class="caption">Mute off</span>
      </div>
      <div class="meter-sample">
        <Toggle pressed={true} label="M" tone="danger" />
        <span class="caption">Mute on</span>
      </div>
      <div class="meter-sample">
        <Segmented value={'saw' as Waveform} options={WAVEFORM_OPTIONS} label="Waveform" />
        <span class="caption">Option selector</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Signal colours</h2>
    <div class="swatches">
      {#each SIGNAL_TYPES as s (s)}
        <div class="swatch">
          <span class="chip" style:background={`var(--signal-${s})`}></span>
          <span>{SIGNAL_LABELS[s]}</span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .gallery {
    height: 100%;
    overflow: auto;
    padding: var(--space-6) var(--space-6) 80px;
    background-color: var(--bg-canvas);
    background-image: radial-gradient(var(--bg-canvas-dot) 1px, transparent 1px);
    background-size: 20px 20px;
  }
  .intro {
    max-width: 680px;
    margin-bottom: var(--space-6);
  }
  h1 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xl);
    font-weight: var(--weight-medium);
    color: var(--text-strong);
  }
  .intro p {
    margin: 0 0 var(--space-3);
    color: var(--text-secondary);
    line-height: 1.6;
  }
  .intro a {
    color: var(--signal-audio-soft);
    text-decoration: none;
    font-size: var(--text-sm);
  }
  section {
    margin-bottom: 48px;
  }
  h2 {
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .note {
    margin: calc(var(--space-2) * -1) 0 var(--space-4);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
  .modules {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-5);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .stack.center {
    align-items: center;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding-top: var(--space-1);
  }
  .mixer {
    display: flex;
    gap: var(--space-2);
  }
  .strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
  }
  .strip-foot {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .strip.main {
    border-left: 1px solid var(--border-subtle);
    padding-left: var(--space-3);
  }
  .meters {
    display: flex;
    gap: 4px;
  }
  .meters.big {
    gap: 6px;
    padding: var(--space-2) 0;
  }
  .port-group {
    display: flex;
    gap: var(--space-2);
  }
  .showcase {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-5);
    padding: var(--space-5);
    margin-bottom: var(--space-3);
    background: var(--surface-module);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
  }
  .port-pair,
  .meter-sample {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }
  .port-pair {
    flex-direction: row;
    flex-wrap: wrap;
    max-width: 150px;
    justify-content: center;
  }
  .caption {
    width: 100%;
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-muted);
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }
  .swatch {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-secondary);
  }
  .chip {
    width: 28px;
    height: 16px;
    border-radius: var(--radius-sm);
  }
</style>
