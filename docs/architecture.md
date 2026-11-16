# Architecture

How Modulab is put together today, the limits of running a DAW in a browser, and the improvements
we expect to need — with the point at which each one becomes worth doing. Decisions that are still
open are listed at the end.

## Overview

```
 Main thread (UI)                                   Audio thread (AudioWorklet)
 ┌──────────────────────────────┐   postMessage    ┌───────────────────────────────┐
 │ Svelte UI                    │ ───────────────► │ Engine (TypeScript)           │
 │ patch (source of truth)      │  graph / params  │  ├─ node order, sleep, safety │
 │ history, autosave, files     │                  │  ├─ FaustDsp ── osc.wasm      │
 │ engine.svelte.ts (sync)      │ ◄─────────────── │  ├─ FaustDsp ── mixer.wasm    │
 └──────────────────────────────┘  stats / meters  │  └─ FaustSink ─ output.wasm   │
                                                   └───────────────────────────────┘
```

| Part | Where | What it does |
|---|---|---|
| Patch model | `src/patch/` | Modules, cables, parameters, view. The single source of truth, owned by the main thread. |
| Module definitions | `src/modules/` | Per module type: ports, parameter specs, panel, and the engine kind that does its DSP. |
| Patch sync | `src/engine/engine.svelte.ts`, `toEnginePatch.ts` | Sends the graph when modules or cables change; single values when a parameter moves. |
| Engine | `src/engine/core/` | Plain TypeScript (runs in the worklet, in offline renders and in Node tests). Orders nodes, routes buffers, sums cables, sleeps idle modules, guards the output. |
| DSP | `src/dsp/*.dsp` | Faust, compiled to WebAssembly at build time; each module is its own wasm instance. See [faust-notes.md](faust-notes.md). |
| Persistence | `src/patch/`, `src/platform/storage.ts` | Autosave in browser storage, undo history, `.modulab` files with a version number. |
| Offline | `vite.config.ts`, `src/platform/pwa.svelte.ts` | Service worker precaches every built file; updates wait for the user. |

Browser-specific code is kept behind small modules in `src/platform/` (storage, service worker),
so a desktop build could swap them out.

### Engine rules (real-time safety)

- One engine renders the whole patch in 128-frame blocks, dependencies first. Feedback loops read
  the previous block (one block of delay).
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
- **Now:** stats and meters are posted 20 times per second (small, reused objects).
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
- Samples go into **IndexedDB** (or OPFS), referenced from the patch by id; request persistent
  storage (`navigator.storage.persist()`) so the browser doesn't evict them.
- `.modulab` files need a way to carry or reference samples (e.g. a zipped bundle).
- **When:** with the sampler.

### 5. Audio device and latency settings
- A settings panel for buffer size (the `?buffer=` URL switch today) and, where supported, the
  output device (`AudioContext.setSinkId`, Chromium only).
- **When:** with MIDI input / live playing.

### 6. Continuous integration
- Run `npm run check` and `npm test` on GitHub for every push.
- **When:** any time; cheap insurance as the module count grows.

## Open design decisions

These affect how every future module is written, so they should be decided before the module
count grows.

1. **Polyphony.** Should a cable carry several voices (e.g. up to 16 channels, as in VCV Rack)?
   It changes port buffers, the engine's routing and every module's process loop. Cheap to add
   now, expensive later.
2. **Clock and timing.** A transport clock inside the engine, sample-accurate, that sequencers,
   envelopes, LFO sync and later the arrangement view all follow. Timing must never depend on
   main-thread messages.
3. **Events vs. signals.** Gates, triggers and notes as audio-rate signals (modular style) or as
   timestamped events (DAW style) — or both, with clear conversion modules.
4. **Automation and the arrangement view.** How clips and tracks drive module parameters with
   sample accuracy, and how that is stored in the file format (versioned migrations).

## About openDAW

[openDAW](https://github.com/andremichelle/openDAW) is a full web DAW and a useful reference:
audio in a single AudioWorklet, a Rust/WebAssembly engine with dynamically linked device modules in
shared memory, a main-thread source of truth mirrored into the engine, lock-free telemetry, and
Web Workers for analysis, time-stretching, storage and ML. It is licensed **AGPL-3.0**: we learn
from its ideas but do not copy its code into Modulab (GPL-3.0).
