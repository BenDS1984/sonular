# Architecture

How Sonular is put together today, the limits of running a DAW in a browser, and the improvements
we expect to need — with the point at which each one becomes worth doing. The design decisions
that every module must follow are listed near the end.

## Overview

```
 Main thread (UI)                                   Audio thread (AudioWorklet)
 ┌──────────────────────────────┐   postMessage    ┌───────────────────────────────┐
 │ Svelte UI                    │ ───────────────► │ Engine (TypeScript)           │
 │ patch (source of truth)      │  graph / params  │  ├─ node order, sleep, safety │
 │ history, autosave, files     │                  │  ├─ FaustDsp ── osc.wasm      │
 │ engine.svelte.ts (sync)      │ ◄─────────────── │  ├─ FaustDsp ── mixer.wasm    │
 └──────────────────────────────┘  stats / meters  │  └─ FaustSink ─ channel.wasm  │
                                                   └───────────────────────────────┘
```

| Part | Where | What it does |
|---|---|---|
| Project model | `src/patch/` | A project (name, tempo, timeline settings) holds one or more patches (id, name, colour, modules, cables, parameters, view, timeline blocks and automation lanes). Every control is addressed as patch → module → parameter id. The single source of truth, owned by the main thread. |
| Views | `src/ui/TabBar.svelte`, `src/ui/Workspace.svelte`, `src/ui/mixer/`, `src/ui/timeline/` | A tab per patch (add, rename, duplicate, delete, drag to reorder) and Mixer and Timeline buttons. Under the tabs either the canvas of the active patch, the mixer (every patch's Channel side by side in tab order, the same `ChannelStrip` as the Channel module, plus the master) or the timeline (a track per patch with a row per sequencer, ruler, playhead, loop, song end). Which view is shown, the playhead and the timeline zoom are screen state only. |
| Module definitions | `src/modules/` | Per module type: ports, parameter specs, panel, and the engine kind that does its DSP. |
| Patch sync | `src/engine/engine.svelte.ts`, `toEnginePatch.ts` | Sends the graph when modules or cables change; single values when a parameter moves. |
| Engine | `src/engine/core/` | Plain TypeScript (runs in the worklet, in offline renders and in Node tests). Orders nodes, routes buffers, sums cables, sleeps idle modules, guards the output. Owns the transport (tempo and position). |
| DSP | `src/dsp/*.dsp` | Faust, compiled to WebAssembly at build time; each module is its own wasm instance. See [faust-notes.md](faust-notes.md). |
| Native modules | `src/engine/modules/` | TypeScript for control logic and anything that follows the tempo (Clock, Sequencer, Envelope, Scope, Recorder). Engine kinds `native:<name>`. |
| Persistence | `src/patch/`, `src/platform/storage.ts` | Autosave in browser storage, one undo history per project, `.sonular` files with a version number (older versions are upgraded on load; version 4 added the timeline). |
| Offline | `vite.config.ts`, `src/platform/pwa.svelte.ts` | Service worker precaches every built file; updates wait for the user. |

Browser-specific code is kept behind small modules in `src/platform/` (storage, service worker),
so a desktop build could swap them out.

### Several patches in the UI

- `patch` (in `src/patch/patch.svelte.ts`) is a live view onto the active patch, so canvas and
  module code work on "the patch" without knowing which one is shown.
- Module ids repeat across patches (every patch can have an `osc1`). Canvas state keyed by module
  id (port positions, module sizes, stacking, selection) is therefore cleared when another patch
  is shown (`clearCanvasState`), and the canvas content is remounted (`{#key patch.id}` in
  `Workspace.svelte`) so every module measures its jacks again.
- Live meters of any patch are read with `meterValueIn(patchId, moduleId, name)`; `meterValue`
  is the shortcut for the active patch.
- A new patch, and the first patch of a new project, get their Channel at the right of the
  visible canvas, left of the minimap.
- Tab and mixer order are the same list (`project.patches`); dragging either one moves it.

### Timeline data

Each patch is one timeline track. Times are in beats (quarter notes) from the start of the song;
4 beats make a bar. Operations live in `src/patch/timeline.ts`.
- **Blocks** (`patch.clips`): a block sits on the row of one module that has pattern banks
  (`ModuleDefinition.banks`: the Sequencer has 8) and says which bank plays (`bank`, 0-based).
  Blocks show no steps, only "Pattern C" in the pattern's tint. Blocks on one row never overlap. Ids
  `b1`, `b2`, ... are never reused in a patch. A sequencer without blocks plays the bank chosen on
  the module (parameter `bank`), so older patches sound the same.
- **Sequencer patterns** (`src/modules/sequencer/banks.ts`): shown as Pattern A–H, called banks
  0..7 in code and files. Bank 1 (A) keeps the old parameter ids
  (`pitch1`, `on1`, ...), so an older patch's pattern becomes bank 1; banks 2..8 use `b2pitch1`,
  `b2on1`, ... The pattern buttons A–H choose which bank is edited; a lamp shows the bank playing
  (meter `bank`). On the timeline the keys A–H set a selected block's pattern. Copy/Paste copies a bank through a clipboard shared by all sequencers (not saved).
- **Automation lanes** (`patch.lanes`): one per control (module + parameter), points of time and
  value in the parameter's own range. Lines run along the knob's travel (so even on
  logarithmic knobs), straight or bent: a point's optional `curve` (-1..1) bends the line to the
  next point with an exponential shape (`bend` in `src/engine/core/automation.ts`), so a split
  piece is again such a curve and adding a point keeps the line exactly; a handle in the middle
  of each line sets it (`curveForMidpoint`), double-click straightens; choices and switches hold each point until the next (`laneValueAt`).
  Started from a knob's right-click menu ("Automate"), drawn on the timeline under the patch's
  track (`AutomationLaneRow.svelte`): double-click adds or removes a point, a box or Shift+click
  selects several, which move together (`moveGroup`), are deleted together (`removePoints`) or
  copied and pasted at the playhead (`copyPoints`/`pastePoints`, as knob positions, so a shape
  can be pasted onto another control; pasting replaces the points in that stretch).
  Dragging a lane's bottom edge changes its height (52–300 px, double-click for the standard);
  heights are kept per lane in the patch's view (`view.laneHeights`), saved but not undoable.
- **Song settings** (`project.timeline`): song end and the loop (on/off, start, end).
- Removing a module removes its blocks and lanes; duplicating a patch copies them. All of it is
  saved in the file, autosaved and undoable.
- **Blocks in the engine:** every sequencer node gets its blocks (`PatchNode.clips` with the
  graph, a `clips` message when they change). The Sequencer reads the transport position sample
  by sample: inside a block it plays that block's bank and starts at step 1 when the block
  begins (also after a loop jump or when Play starts inside it); outside blocks its gate stays
  low and its pitch holds.
- **Automation in the engine:** all lanes of the project go to the engine in one `automation`
  message (`engineLanes`, none for Free patches), with points as knob positions. At the start of
  every block (128 samples, about 3 ms) the engine sets each automated control to its lane's value
  at the transport position (`src/engine/core/automation.ts`); modules smooth the steps as they do
  for a turned knob. Choices and switches (`holdsSteps`: a stepped control with format `choice` or
  `toggle`) hold each point; knobs that turn in steps but stand for a number (Tune) glide between
  points, which snap to the steps when drawn. Knobs show the lane's value at the playhead. Turning an automated control
  takes it over: its lane is left out of the `automation` message (`src/engine/overrides.svelte.ts`)
  until the next Play, and the knob shows a dashed ring.
- **Recording automation** (`src/ui/recordAutomation.svelte.ts`): with the "Automation" button
  in the top bar on, turning a control while the song plays (not in a Free patch) records it.
  Only the stretch being touched is replaced ("touch" mode): a touch starts with the first change
  and ends when the mouse button is released, or 600 ms after the last keyboard change. While it
  lasts the control's lane is paused (as an override) so the knob is heard directly, and it is
  sampled every 30 ms at the estimated song position (`currentBeat`: the last reported beat moved
  on by the time since, wrapped round the loop). The lane is redrawn live with `punchIn` (old
  points outside the stretch stay, a point 1/16 beat before and after keeps the old line around
  it) and thinned with `thinPoints` when the touch ends (points within 0.5 % of the knob's travel
  of the line are dropped; stepped controls keep only changes). A loop jump ends a pass and starts
  a new one. A touch is one undo step.
- **Playing:** Play starts at the playhead (`transportState.start`, screen state); while playing,
  moving the playhead jumps the transport there (`locate`, modules keep their state). The loop is
  sent to the engine, where the transport jumps back on the exact sample (`Transport.wrapAt`,
  `loopLength`; tempo-following modules apply the same jump inside their sample loop, as the
  Clock does). Started past the loop end, playback runs on without looping. The song end is only
  a marker for now: playback continues past it.

### Engine rules (real-time safety)

- One engine renders the whole project in 128-frame blocks, dependencies first: all patches in
  one graph (node id "<patch id>/<module id>"), each patch's Channel a sink on the master bus,
  then the master level. Feedback loops read the previous block (one block of delay).
- Mute/solo switch a Channel off: it fades out over 20 ms, then it and everything that only feeds
  it stop rendering (no CPU). Modules that keep time (Clock, Sequencer) keep running so the patch
  is still in step when it comes back; the rest restarts from a clean state.
- The master level glides like a knob (each sample moves a fixed share of the way, about 23 ms),
  so a dragged master fader never crackles; a fixed-length ramp per fader message did, on pure
  tones.
- **No allocation on the audio thread** in the render path: indexed loops, reused objects, no
  `subarray()` per block. Garbage collection on the audio thread causes audible dropouts.
- Modules that don't reach an output are skipped; processors sleep once their inputs have been
  silent longer than their declared tail; sources never sleep.
- NaN/Infinity on the master bus mutes the block and resets all modules; the output is limited
  to ±1.

## Browser constraints

| Constraint | Consequence |
|---|---|
| **One audio thread per AudioContext** | All real-time DSP shares one CPU core. This is also how openDAW and other web DAWs work. Efficiency, not parallelism, is what scales a patch. |
| **No high-resolution clock in Chromium's worklet** | The CPU meter is a smoothed estimate. Use Node benchmarks (`performance.now()`) for real numbers. |
| **Latency** | Browser buffers are typically 10–40 ms; Bluetooth adds far more and can click. Fine for patching and sequencing, noticeable for live keyboard playing. No ASIO-style driver control. |
| **Storage** | `localStorage` holds a few MB — enough for patches, not for samples. |
| **Browser differences** | Firefox can't install PWAs and needs an extra permission for MIDI; Brave disables the File System Access API by default. |

## Measured CPU cost

`npm run bench` measures each module in Node (per 128-frame block, best case). Figures from
2026-11-16:

| Module | µs per block | Share of one core |
|---|---|---|
| Oscillator (saw) | 9.3 | 0.35 % |
| Mixer (4 channels) | 3.7 | 0.14 % |
| Reverb (input diffusion, equal L/R output, 2026-11-18) | 19.9 | 0.75 % |
| Channel (replaced Output, 2026-11-18) | 0.8 | 0.03 % |
| Clock | 1.4 | 0.05 % |
| Sequencer | 0.6 | 0.02 % |
| Envelope | 0.7 | 0.03 % |
| Scope (2 ms / 1 s window, 2026-11-17) | 1.4 / 0.9 | 0.05 % / 0.03 % |
| Recorder (recording, 2026-11-18) | 1.0 | 0.04 % |

In the browser on the user's laptop (CPU meter, peak), 2026-11-16:
- Oscillator, Mixer, Reverb, Output (now Channel): at most **2 %**.
- The same plus Clock and Sequencer: at most **3 %**.

On 2026-11-17 the reverb gained input diffusion and slow modulation of two delay lines (smoother
onset, less metallic tail): 12.4 → 17.5 µs per block. The browser figures above were measured
before that change.
Later that day its damping range moved from 20 kHz…1.5 kHz to 10 kHz…500 Hz (default 0.5) and
a 2nd-order 8 kHz high-cut was added before the network, so highs decay like in a real hall
(4 kHz ≈ 0.55×, 8 kHz ≈ 0.4× the midrange T60) instead of sounding glassy; CPU unchanged.
On 2026-11-18 a sustained pure tone turned out up to 14 dB quieter on one side (zita-rev1 takes
left and right from different delay lines). Modulating all lines more evened that out but made
the volume swing by up to 24 dB, so instead both sides now come from one network output through
two different allpass chains: always equally loud, steady, still wide. 16.9 → 19.9 µs per block.

The browser figures include the engine's fixed overhead and the meter's coarse timer, so they
are higher than the Node sums; they confirm that a reverb is cheap enough to use freely.

### Whole projects (several patches at once), 2026-11-19

`npm run bench` also plays copies of the Welcome! patch (Clock, Sequencer, Oscillator, Envelope,
Reverb, Mixer, Channel) through the full engine:

| Project | µs per block | Share of one core |
|---|---|---|
| 1 patch | 37.9 | 1.4 % |
| 4 patches | 165.9 | 6.2 % |
| 8 patches | 324.3 | 12.2 % |
| 8 patches, 7 muted | 50.7 | 1.9 % |

- The cost grows in a straight line with the number of patches: the engine adds nothing per
  patch beyond the modules themselves.
- A muted patch costs almost nothing: only its Clock and Sequencer keep running (to stay in
  step), about 2 µs per block.
- In the browser (development server, master level at zero, CPU meter over 10 s), the same 8
  patches read **16 %** median and **17 %** peak.

## Planned improvements

Each item lists when it becomes worth doing. Several are inspired by openDAW (see below).

### 1. Shared-memory DSP (no copying between modules)
- **Now:** every Faust module has its own wasm memory; the engine copies input and output buffers
  in and out every block (a few microseconds per module).
- **Later:** compile Faust with external memory and place all modules in one shared
  `WebAssembly.Memory`, so modules read and write each other's buffers directly. openDAW goes
  further: the whole engine is Rust/wasm and device modules (≈2 KB each) are linked into one
  memory and called through a function table.
- **When:** patches with a few hundred modules, or when profiling shows copying/boundary
  crossings as a significant share of the render time.

### 2. Meters and telemetry through shared memory
- **Now:** stats and meters are posted 20 times per second (small, reused objects). Scope
  pictures travel along with them: modules with `displayLength`/`readDisplay` add their values
  (min/max per screen column) to `stats.displays`. A scope is an *observer*: the engine renders
  it, and everything feeding it, even when no cable leads from it to an output.
  Recorders hand their audio over in the same rhythm: `takeRecorded()` returns the samples since
  the previous call (with a take number), sent as a `recorded` message whose buffers are
  transferred, not copied. The main thread (`src/engine/recordings.svelte.ts`) turns each piece
  into 24-bit WAV bytes straight away, so saving only prepends a header. Takes stop at 15 minutes.
- **Later:** a lock-free ring buffer in a `SharedArrayBuffer` (openDAW's `LiveStream` does this for
  meters, spectra and note activity). Lighter for the audio thread, and enables richer views such
  as scopes and spectrum analysers.
- **Requires:** cross-origin isolation — `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` headers (set in Cloudflare `_headers`). Check that
  every resource we load is same-origin or sends CORP headers.
- **When:** with the first scope/analyser module, or the arrangement view's live displays.

### 3. Workers for non-real-time work (the other CPU cores)
- **Offline export to WAV:** run a second engine instance in a Web Worker, faster than real time,
  without disturbing playback. The engine core is already worklet-independent.
- **Sample import:** decoding, analysis (peaks, tempo), waveform overviews for the arrangement view.
- **When:** export → soon after the first sequencing modules; samples → with the sampler.

### 4. Sample storage
- **Built (2026-11-22): the sample library.** The browser's Samples tab keeps the user's audio files
  unchanged in **IndexedDB** (`src/platform/sampleStore.ts`: a small `info` store read as a whole
  for the list, and a `files` store read one file at a time), per computer and apart from
  projects. Each sample has a name, length, channels, a 64-part peak overview and a SHA-256 hash
  (the same file is not added twice). Adding asks for persistent storage
  (`navigator.storage.persist()`). Listening plays the file through an `<audio>` element, apart
  from the engine. `src/samples/library.svelte.ts` is the app's view of it.
- Still to do, with the sampler: samples referenced from a patch by id, and `.sonular` files that
  carry the samples they use (e.g. a zipped bundle), so a project opens complete elsewhere.

### 5. Audio device and latency settings
- A settings panel for buffer size (the `?buffer=` URL switch today) and, where supported, the
  output device (`AudioContext.setSinkId`, Chromium only).
- **When:** with MIDI input / live playing.

### 6. Continuous integration
- Run `npm run check` and `npm test` on GitHub for every push.
- **When:** any time; cheap insurance as the module count grows.

## Design decisions

Settled on 2026-11-16, before the module count grows. They affect how every module is written;
changing one later means touching all modules.

### 1. Polyphony
- A cable carries **1 to 16 voices** (channels). The count is dynamic per cable: modules compute
  only the active voices, so a mono patch costs exactly what it does today.
- Port buffers are preallocated for 16 voices (≈8 KB per port), so nothing is allocated when the
  voice count changes.
- The voice count is chosen at the source (a *voices* control on the note input or sequencer),
  **default 4**, and everything downstream follows. Users fit it to their computer; the CPU meter
  shows the cost.
- When this is built, benchmark the cost of 1, 4 and 16 voices.

### 2. Signal conventions
Plain normalized numbers, not Eurorack volts:

| Signal | Range | Notes |
|---|---|---|
| Audio | −1 … +1 | What sound cards and WAV files use; no conversion at the output or export. |
| Pitch | 1 per octave | 0 = middle C (C4, 261.63 Hz); a semitone is 1/12. Transposing is adding. |
| Bipolar modulation (LFO) | −1 … +1 | |
| Unipolar modulation (envelope) | 0 … 1 | |
| Gate / trigger | 0 = off, 1 = on | A gate stays on while held; a trigger is a very short pulse. |

Panels show musical units (Hz, seconds, %, notes), never the raw numbers. Every modulation input
gets an amount (attenuverter) control. The rule is that any output can be patched into any input.

### 3. Clock and timing
- One **master transport** inside the engine: tempo (BPM), time signature, play/stop and
  position, sample-accurate. The tempo is set in the top bar. Timing never depends on main-thread
  messages.
- A **Clock module** brings the transport into the patch and can **divide and multiply** the
  clock. Its outputs are gates that are high for the first half of each period: the rising edge
  is the tick, and the same cable can open an envelope directly.
- Built so far: tempo in the top bar (stored in the patch), position since Play, and Play always
  starts from the top (position 0, every module cleared). Modules that follow the tempo read the
  transport position sample by sample; it is derived from a whole sample count, so it never
  drifts.
- **No hidden sync switches.** Modules that can follow tempo (LFO, delay, …) get a *clock* input.
  Patched: they follow that clock, with their time set as a ratio of it. Unpatched: they run free,
  set in Hz or milliseconds.
- The engine knows the exact period of every clock, so clock cables carry exact timing: no jitter
  from measuring the gap between ticks, and tempo changes are followed at once. When a clock
  stops, modules keep its last tempo.
- Later, without redesign: swing, several independent clocks (polyrhythms), MIDI clock sync.

### 4. Notes and triggers are signals
- Cables always carry **signals** (pitch, gate, velocity), never events.
- Event sources are converted at the edge of the patch: a *MIDI in* module (polyphonic pitch,
  gate and velocity cables, one voice per held key), computer-keyboard input as an alternative,
  and later the arrangement timeline, converted sample-accurately. Sequencers output the same
  cables directly.
- So every module behaves the same whatever the note source, and gates and pitches can be
  delayed, modulated or randomised like any other signal.

### 5. Patch compatibility
An old patch must load and sound the same in every later version of Sonular.
1. **Fixed ids.** Module types, parameters and ports have internal ids (e.g. `osc`,
   `osc.frequency`) that never change. Files store ids, not display labels; labels may change.
2. **Versioned modules.** Each module type has a version number and a migration recipe. A new
   parameter gets a default that keeps the old sound. When a module's sound changes, old patches
   keep the old behaviour (or get a *classic / new* switch).
3. **Unknown modules are kept.** A module from a newer Sonular loads as a grey placeholder with
   its settings intact and is written back unchanged on save.
4. **Sound regression tests.** Reference patches with recorded audio are re-rendered and compared
   on every change, so an unintended change in sound is caught before it is published.

### 6. Target devices
- **Computers only** (laptop/desktop, mouse and keyboard, optionally a MIDI keyboard). No tablet
  or phone support and no touch design; right-click, hover and keyboard shortcuts are fine.
- Browsers: Chrome and Edge first; Safari and Firefox must work and are tested regularly.

### Still open
- **Automation and the arrangement view.** The data and file format are settled (see "Timeline
  data"); how the engine plays blocks and lanes sample-accurately is designed with the timeline
  screen.

## About openDAW

[openDAW](https://github.com/andremichelle/openDAW) is a full web DAW and a useful reference:
audio in a single AudioWorklet, a Rust/WebAssembly engine with dynamically linked device modules in
shared memory, a main-thread source of truth mirrored into the engine, lock-free telemetry, and
Web Workers for analysis, time-stretching, storage and ML. It is licensed **AGPL-3.0**: we learn
from its ideas but do not copy its code into Sonular (GPL-3.0).
