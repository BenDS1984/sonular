---
name: add-module
description: Step-by-step workflow for adding a new module to Sonular (or replacing/reworking one), from the first questions to the commit. Use whenever the user asks for a new module (filter, LFO, VCA, delay, sampler, utility, ...) or a substantial rework of an existing module's sound or panel.
---

# Adding a module to Sonular

A module is: a **definition** (ports, parameters, look), a **DSP part** in the engine (Faust or
TypeScript), and a **panel** (the controls inside the module body). This workflow distils what
worked for the Oscillator, Envelope, Reverb and Scope. Follow it in order.

The user is not a programmer: talk in Dutch, plainly, about what they will see and hear, not
about code. App text, code, comments and commits are in English.

## 1. Ask, then propose — never build first

Nothing gets built without an explicit "ja". Start with a short round of questions
(AskUserQuestion, 1–4 questions, recommended option first), only about what is unclear:

- What should it do, and what should it sound or look like? (Ask what is missing or wrong if it
  replaces something: "te kaal", "te scherp", ...)
- Inputs and outputs (mono/stereo, pass-through outputs, CV inputs).
- Knobs and switches, and which ones deserve a modulation input.
- Replace an existing module, or add next to it?

Then propose in plain words: what it does, ports, knobs (with ranges and units), look, expected
CPU cost, how you will test it silently. End with a wrap_up question ("Zal ik ... bouwen?").

## 2. Fixed rules for every module

- **Ids never change**: module `type`, parameter `id`s and port `id`s are stored in patch files.
  Display text goes in `title`/`label`. New module: `version: 1`.
- **Changing an existing module's sound** affects saved patches (docs/architecture.md, "Patch
  compatibility"). Tell the user, and let them choose: raise `version` and keep the old
  behaviour for old patches, or replace on purpose.
- **Signals** are plain numbers: audio −1…+1, pitch 1/octave with 0 = C4, unipolar modulation
  0…1, bipolar −1…+1, gate 0/1. Any output may be patched into any input.
- **Family = `category`** (Sources, Sequencing, Shaping, Modulation, Effects, Mixing, Output,
  Utilities): it sets the header colour, minimap colour and browser group.
- Panels show musical units (Hz, s/ms, %, dB, note names, ×), via `format` on the parameter.
- **CPU matters** (large catalog, efficient DSP): no work for silence, no per-sample `pow`/`sin`
  in Faust, no allocation in `process`.

## 3. Choose the engine side

| Kind | Use | Engine kind | Where |
|---|---|---|---|
| Sound processing (oscillators, filters, effects, mixers) | Faust | `faust:<name>` | `src/dsp/<name>.dsp` |
| Control logic, tempo, gates, visual data (clock, sequencer, envelope, scope) | TypeScript | `native:<name>` | `src/engine/modules/<Name>.ts` |

**Faust** (read the memory notes on Faust lessons and the Faust docs first):
- A new `.dsp` file is picked up automatically (`src/engine/faustPrograms.ts`). Compile with
  `npm run faust` (output in `src/dsp/generated/`, not in git). Parameters are sliders named by
  the parameter `id`; port order = `inputs`/`outputs` order in the definition.
- Check each library function in the docs and in the bundled source before using it, and
  **measure** it — several library blocks failed (DPW oscillators, coefficient clicks in
  zita-rev). Smooth computed coefficients, not just the sliders.
- `de.fdelay(n, …)` allocates n+1: pass a power of two minus one. `ba.take` needs integer
  indices. `ba.if` computes both branches: choose wiring at compile time with `par`.
- An output to the speakers is declared with `declare sink "1";`.

**TypeScript** (`DspModule` in `src/engine/core/types.ts`):
- Implement `numInputs`, `numOutputs`, `tailSeconds` (0 stateless, decay time for effects,
  `Infinity` never sleeps), `setParam`, `process`, `reset`; optional `onConnectionsChanged`,
  `meterNames`/`readMeters` (single values, e.g. an LED), `displayLength`/`readDisplay` (arrays,
  e.g. a scope trace), `isObserver` (rendered even when no cable leads to an output).
- Hot loop: indexed `for` loops, locals copied from `this`, no `subarray`, no new objects.
- Register the factory in `src/engine/modules/native.ts`.
- Gates: rising above 0.6 / falling below 0.4 (hysteresis), as in Envelope.

## 4. Definition and panel

- `src/modules/<type>/definition.ts`: copy a similar module (envelope, mixer, scope). Pick
  `width` so knobs fit (multiples of the existing ones: 204, 252, 264, 400).
- Add it to `MODULES` in `src/modules/registry.ts`.
- `src/modules/<type>/<Name>Panel.svelte`: only the body; ports are drawn automatically from the
  definition. Use `ParamKnob` for knobs, `Segmented` for choices, `Led` for meters, the `.lcd`
  class for screens (see `WaveDisplay`, `ScopePanel`). Live values: `meterValue(id, name)` and
  `displayValues(id)` from `src/engine/engine.svelte.ts`.
- New display format? Add it to `ParamFormat` (`src/modules/types.ts`) and
  `src/modules/paramFormat.ts`.

## 5. Test — measure, don't assume

All tests render offline; never play sound unless the user asks.

- **Behaviour**: does it do what it promises? Measure the real thing (frequency, level, timing,
  shape, T60, echo density, ...). Faust modules: `src/dsp/modules.test.ts` or their own
  `src/dsp/<name>.test.ts`; TypeScript: `src/engine/modules/<Name>.test.ts`.
- **No clicks**: jump every knob while a signal runs; the loudest 2 ms above 5 kHz (4× highpass)
  must stay below −70 dB relative to the signal (`clickDb` in `src/dsp/reverb.test.ts`).
- **Edge cases**: silence, unconnected inputs, extreme knob values, NaN-free output, `reset()`.
- **CPU**: add it to `src/dsp/cpu.test.ts` and run `npm run bench` before and after; put the
  figure in the "Measured CPU cost" table in `docs/architecture.md`.
- Then: `npm run check`, `npm test`, `npm run build` — all must pass.

**Silent browser check** (dev server `sonular-dev` via preview_start, http://localhost:5173):
1. Save the user's patch first:
   `sessionStorage.setItem('backup', localStorage.getItem('sonular.autosave'))`.
2. Build a test patch via `__sonular.patch` (push modules/cables) and **remove every cable into
   the Output module**, so playing produces no sound. Check `__sonular.engineState.peakL` is 0.
3. Check the panel in the DOM (read_page / javascript), not only screenshots: the pane may be
   hidden and screenshots stale. `computer zoom` on the module's rect gives a reliable picture.
4. Stop, restore: `localStorage.setItem('sonular.autosave', sessionStorage.getItem('backup'))`,
   reload, confirm the original modules and cables are back.
5. Check console errors and `preview_logs` (errors from before a file existed are stale).

## 6. Wrap up

- Tell the user in Dutch what it does, what you measured (with before/after numbers), the CPU
  cost, and what to try themselves. Say plainly what you did not hear or verify.
- Update `docs/architecture.md` where the engine changed, and memory notes for new lessons.
- Commit only after the user tested and said so; push only when asked (a push publishes to
  sonular.app). Commit messages in English, ending with the Co-Authored-By line.
- If the user reports something feels wrong, find the cause first, explain it, and ask before
  fixing.

## Pitfalls seen before

- Some files have CRLF line endings in the working copy; edit carefully or convert to LF
  (the repository stores LF).
- Faust library blocks that compute coefficients directly from sliders click when knobs move.
- Interpolated delays (`de.fdelay`) are the expensive part of modulated reverbs, not the LFOs.
- A module that only watches signals needs `isObserver`, or the engine skips it when it does not
  reach the Output.
- Restarting internal state on every parameter change looks jumpy while a knob turns (Scope):
  carry state over to the new value instead.
