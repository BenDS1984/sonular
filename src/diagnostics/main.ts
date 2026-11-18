/**
 * Audio diagnostics page (development only, open /diagnostics.html).
 *
 * Plays the same quiet 440 Hz tone through five increasingly complex paths, so a listener can
 * find the first one that produces clicks. Each run uses a fresh AudioContext.
 */
import '@fontsource-variable/inter/wght.css';
import '../styles/tokens.css';
import '../styles/base.css';
import jsSineUrl from './jsSine.worklet.ts?worker&url';
import faustSineUrl from './faustSine.worklet.ts?worker&url';
import { compileFaustPrograms } from '../engine/faustPrograms';
import { AudioEngine, type BufferSize } from '../engine/AudioEngine';
import type { EnginePatch } from '../engine/core/types';

interface Run {
  ctx: AudioContext;
  stop(): void;
}

interface Variant {
  id: string;
  title: string;
  detail: string;
  start(latencyHint: AudioContextLatencyCategory | number, buffer: BufferSize): Promise<Run>;
}

const GAIN = 0.125; // −18 dBFS, same as the Sonular test tone

function context(latencyHint: AudioContextLatencyCategory | number): AudioContext {
  return new AudioContext({ latencyHint });
}

/**
 * Play a node through an <audio> element instead of straight to the sound card: the browser's
 * media path (as YouTube uses), which buffers more and may survive Bluetooth hiccups.
 */
async function viaMediaElement(ctx: AudioContext, source: AudioNode): Promise<() => void> {
  const dest = new MediaStreamAudioDestinationNode(ctx);
  source.connect(dest);
  const audio = new Audio();
  audio.srcObject = dest.stream;
  await audio.play();
  return () => {
    audio.pause();
    audio.srcObject = null;
  };
}

const VARIANTS: Variant[] = [
  {
    id: 'native',
    title: '1. Browser oscillator',
    detail: 'Built-in OscillatorNode. No Sonular code involved at all.',
    async start(hint) {
      const ctx = context(hint);
      const osc = new OscillatorNode(ctx, { frequency: 440 });
      const gain = new GainNode(ctx, { gain: GAIN });
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      await ctx.resume();
      return { ctx, stop: () => void ctx.close() };
    },
  },
  {
    id: 'js',
    title: '2. Minimal worklet (JavaScript)',
    detail: 'A plain JavaScript sine in an AudioWorklet, like the old prototype.',
    async start(hint) {
      const ctx = context(hint);
      await ctx.audioWorklet.addModule(jsSineUrl);
      new AudioWorkletNode(ctx, 'diag-js-sine', { numberOfInputs: 0, outputChannelCount: [2] }).connect(ctx.destination);
      await ctx.resume();
      return { ctx, stop: () => void ctx.close() };
    },
  },
  {
    id: 'js-messages',
    title: '3. Minimal worklet + messages',
    detail: 'Same as 2, plus a stats message to the page every 50 ms, like the engine sends.',
    async start(hint) {
      const ctx = context(hint);
      await ctx.audioWorklet.addModule(jsSineUrl);
      const node = new AudioWorkletNode(ctx, 'diag-js-sine', {
        numberOfInputs: 0,
        outputChannelCount: [2],
        processorOptions: { messages: true },
      });
      node.port.onmessage = () => {};
      node.connect(ctx.destination);
      await ctx.resume();
      return { ctx, stop: () => void ctx.close() };
    },
  },
  {
    id: 'faust',
    title: '4. Faust tone (WebAssembly)',
    detail: 'The Faust test tone running in its own worklet, without the Sonular engine.',
    async start(hint) {
      const ctx = context(hint);
      const [programs] = await Promise.all([compileFaustPrograms(), ctx.audioWorklet.addModule(faustSineUrl)]);
      const tone = programs.find((p) => p.name === 'testtone');
      if (!tone) throw new Error('testtone not found');
      const node = new AudioWorkletNode(ctx, 'diag-faust-sine', { numberOfInputs: 0, outputChannelCount: [2] });
      await new Promise<void>((resolve) => {
        node.port.onmessage = () => resolve();
        node.port.postMessage({ module: tone.module, meta: tone.meta });
      });
      node.connect(ctx.destination);
      await ctx.resume();
      return { ctx, stop: () => void ctx.close() };
    },
  },
  {
    id: 'engine',
    title: '5. Full Sonular engine',
    detail: 'The complete engine with the test patch, as in the app, but without the app interface.',
    async start(_hint, buffer) {
      const engine = new AudioEngine({}, buffer);
      await engine.start();
      const patch: EnginePatch = {
        nodes: [
          { id: 'tone', kind: 'faust:testtone', params: { freq: 440, gain: GAIN } },
          { id: 'master', kind: 'master' },
        ],
        connections: [{ from: { node: 'tone', port: 0 }, to: { node: 'master', port: 0 } }],
      };
      engine.setPatch(patch);
      engine.setRunning(true);
      return { ctx: engine.context!, stop: () => engine.close() };
    },
  },
  {
    id: 'native-media',
    title: '6. Browser oscillator via the media player',
    detail: 'Same tone as 1, but played through an audio element (the path YouTube uses) instead of straight to the sound card.',
    async start(hint) {
      const ctx = context(hint);
      const osc = new OscillatorNode(ctx, { frequency: 440 });
      const gain = new GainNode(ctx, { gain: GAIN });
      osc.connect(gain);
      osc.start();
      await ctx.resume();
      const stopMedia = await viaMediaElement(ctx, gain);
      return {
        ctx,
        stop: () => {
          stopMedia();
          void ctx.close();
        },
      };
    },
  },
  {
    id: 'engine-media',
    title: '7. Full Sonular engine via the media player',
    detail: 'Same as 5, but played through an audio element instead of straight to the sound card.',
    async start(_hint, buffer) {
      const engine = new AudioEngine({}, buffer);
      await engine.start();
      const out = engine.output!;
      out.disconnect();
      const stopMedia = await viaMediaElement(engine.context!, out);
      engine.setPatch({
        nodes: [
          { id: 'tone', kind: 'faust:testtone', params: { freq: 440, gain: GAIN } },
          { id: 'master', kind: 'master' },
        ],
        connections: [{ from: { node: 'tone', port: 0 }, to: { node: 'master', port: 0 } }],
      });
      engine.setRunning(true);
      return {
        ctx: engine.context!,
        stop: () => {
          stopMedia();
          engine.close();
        },
      };
    },
  },
];

// ---------- Page ----------

const app = document.getElementById('app')!;
app.innerHTML = `
  <main class="diag">
    <h1>Audio diagnostics</h1>
    <p class="lead">Each button plays the same quiet 440 Hz tone (−18 dB) through a different path.
      Listen to each one for about 30 seconds and note which ones click. The first one that clicks
      points to the cause.</p>
    <label class="buffer">Buffer
      <select id="buffer">
        <option value="playback" selected>playback (browser default, safe)</option>
        <option value="interactive">interactive (smallest)</option>
        <option value="balanced">balanced</option>
        <option value="20">20 ms</option>
        <option value="40">40 ms</option>
        <option value="80">80 ms</option>
        <option value="150">150 ms</option>
      </select>
    </label>
    <div id="variants" class="variants"></div>
    <section class="info">
      <h2>What the browser reports</h2>
      <pre id="info">Nothing playing.</pre>
    </section>
  </main>
  <style>
    body { overflow: auto; }
    .diag { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
    h1 { margin: 0 0 8px; font-size: 20px; font-weight: 500; color: var(--text-strong); }
    h2 { margin: 0 0 8px; font-size: 12px; font-weight: 500; color: var(--text-muted); text-transform: uppercase; letter-spacing: .08em; }
    .lead { color: var(--text-secondary); line-height: 1.6; margin: 0 0 20px; }
    .buffer { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; color: var(--text-secondary); }
    select { background: var(--surface-control); color: var(--text-default); border: 1px solid var(--border-strong); border-radius: 6px; padding: 6px 8px; font: inherit; }
    .variants { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
    .variant { display: flex; align-items: center; gap: 16px; padding: 14px 16px; background: var(--surface-module); border: 1px solid var(--border-default); border-radius: 10px; }
    .variant.playing { border-color: var(--signal-audio); }
    .variant .text { flex: 1; }
    .variant .title { color: var(--text-strong); font-weight: 500; }
    .variant .detail { color: var(--text-muted); font-size: 12px; margin-top: 2px; }
    .variant button { min-width: 88px; height: 32px; border-radius: 6px; border: 1px solid var(--border-strong); background: var(--surface-control); color: var(--text-default); cursor: pointer; }
    .variant.playing button { background: var(--signal-audio); border-color: var(--signal-audio); color: var(--text-on-accent); font-weight: 600; }
    .info pre { margin: 0; padding: 14px 16px; background: var(--surface-inset); border: 1px solid var(--border-subtle); border-radius: 10px; font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); white-space: pre-wrap; }
  </style>
`;

const list = document.getElementById('variants')!;
const info = document.getElementById('info')!;
const bufferSelect = document.getElementById('buffer') as HTMLSelectElement;

let current: { variant: Variant; run: Run; startedAt: number; label: string } | null = null;
const rows = new Map<string, HTMLElement>();

function readBuffer(): { hint: AudioContextLatencyCategory | number; buffer: BufferSize; label: string } {
  const v = bufferSelect.value;
  const ms = Number(v);
  if (Number.isFinite(ms)) return { hint: ms / 1000, buffer: ms, label: `${ms} ms` };
  return { hint: v as AudioContextLatencyCategory, buffer: v as BufferSize, label: v };
}

function stopCurrent() {
  if (!current) return;
  current.run.stop();
  rows.get(current.variant.id)?.classList.remove('playing');
  const btn = rows.get(current.variant.id)?.querySelector('button');
  if (btn) btn.textContent = 'Play';
  current = null;
}

for (const variant of VARIANTS) {
  const row = document.createElement('div');
  row.className = 'variant';
  row.innerHTML = `<div class="text"><div class="title"></div><div class="detail"></div></div><button type="button">Play</button>`;
  row.querySelector('.title')!.textContent = variant.title;
  row.querySelector('.detail')!.textContent = variant.detail;
  const btn = row.querySelector('button')!;
  btn.addEventListener('click', async () => {
    const wasThis = current?.variant === variant;
    stopCurrent();
    if (wasThis) return;
    const { hint, buffer, label } = readBuffer();
    btn.textContent = '…';
    try {
      const run = await variant.start(hint, buffer);
      current = { variant, run, startedAt: performance.now(), label };
      row.classList.add('playing');
      btn.textContent = 'Stop';
    } catch (err) {
      btn.textContent = 'Play';
      info.textContent = `Could not start: ${(err as Error).message}`;
    }
  });
  rows.set(variant.id, row);
  list.append(row);
}

bufferSelect.addEventListener('change', stopCurrent);

interface PlayoutStats {
  fallbackFramesEvents: number;
  fallbackDuration: number;
  totalDuration: number;
  averageLatency: number;
}

setInterval(() => {
  if (!current) {
    if (!info.textContent?.startsWith('Could not')) info.textContent = 'Nothing playing.';
    return;
  }
  const { ctx } = current.run;
  const seconds = (performance.now() - current.startedAt) / 1000;
  const lines = [
    `Playing:        ${current.variant.title}`,
    `Time:           ${seconds.toFixed(0)} s`,
    `Buffer asked:   ${current.label}`,
    `Sample rate:    ${ctx.sampleRate} Hz`,
    `Base latency:   ${(ctx.baseLatency * 1000).toFixed(1)} ms   (browser buffer)`,
    `Output latency: ${(ctx.outputLatency * 1000).toFixed(1)} ms   (to the headphones)`,
    `Context state:  ${ctx.state}`,
  ];
  const ps = (ctx as AudioContext & { playoutStats?: PlayoutStats }).playoutStats;
  if (ps) {
    lines.push(
      `Dropouts:       ${ps.fallbackFramesEvents}   (${ps.fallbackDuration.toFixed(0)} ms of silence filled in)`,
    );
  } else {
    lines.push('Dropouts:       not reported by this browser');
  }
  info.textContent = lines.join('\n');
}, 250);
