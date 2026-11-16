# Faust notes

Practical notes for writing Modulab modules in [Faust](https://faust.grame.fr): where to look things
up, traps we ran into, how a `.dsp` file plugs into the engine, and which library building blocks
we measured. Keep this file up to date when you learn something new.

## Where to look things up

| What | Where |
|---|---|
| Language manual (syntax, operators, UI elements, metadata) | <https://faustdoc.grame.fr/manual/syntax/> |
| Library reference, Markdown (preferred, clean text) | `https://raw.githubusercontent.com/grame-cncm/faustlibraries/master/doc/docs/libs/<name>.md` — e.g. [`oscillators.md`](https://raw.githubusercontent.com/grame-cncm/faustlibraries/master/doc/docs/libs/oscillators.md), [`filters.md`](https://raw.githubusercontent.com/grame-cncm/faustlibraries/master/doc/docs/libs/filters.md), [`envelopes.md`](https://raw.githubusercontent.com/grame-cncm/faustlibraries/master/doc/docs/libs/envelopes.md), [`reverbs.md`](https://raw.githubusercontent.com/grame-cncm/faustlibraries/master/doc/docs/libs/reverbs.md) ([index](https://raw.githubusercontent.com/grame-cncm/faustlibraries/master/doc/docs/libs/index.md)) |
| Library reference, website | <https://faustlibraries.grame.fr/> |
| **Exact library source we compile with** | `node_modules/@grame/faustwasm/libfaust-wasm/libfaust-wasm.data` (search with `grep -a "name(" ...`) |

The online reference follows the `master` branch and can be newer than the libraries bundled with
our compiler (Faust 2.90.x through `@grame/faustwasm`). Always check a function in the bundled
source before relying on it.

**Workflow for a new module:** read the library docs → check the bundled source → build → measure
in tests (see below).

## Language traps

- **Operator priority:** `~` (4) > `,` (3) > `:` (2) > `<:` and `:>` (1). So `a : b, c` means
  `a : (b, c)`. We parenthesise groups anyway, for readability.
- **`-(x)` is not negation.** With parentheses it is a partial application: `-(x)` means `_ - x`
  (one input!). Write `0 - x`. A bare literal like `-1` is fine.
- **`attach(a, b)` has two inputs.** To put a meter on a signal without changing it:
  `_ <: attach(_, peak : vbargraph("meterL", 0, 4))`.
- **Functions used as blocks:** prefer `process(pitch) = shapes(freq(pitch)) : ...` over
  `process = freq : shapes : ...` when a function has a formal parameter; the latter produced
  unexpected extra inputs.
- **Every `pow`, `sin`, `cos`, `exp` on a per-sample signal is a call out of WebAssembly into
  JavaScript** — expensive. Write small powers as products (`x * x * x`), and compute from slider
  values *before* smoothing so Faust hoists the math out of the sample loop:
  `cos(f(slider)) : si.smoo` instead of `cos(f(slider : si.smoo))`.

## How a .dsp file becomes a module

- Every `src/dsp/*.dsp` is compiled to `src/dsp/generated/<name>.wasm` + `<name>.json` at build
  time (`scripts/faust-build.mjs`, also run by the Vite plugin). It is available to the engine as
  kind `faust:<name>`.
- **Parameters** are addressed by their slider *short name*, which is the label: use simple,
  unique labels such as `"gain1"`, `"cutoff"`. These names must match the parameter ids in the
  module definition (`src/modules/<module>/definition.ts`).
- **Port order** in the definition's `inputs` / `outputs` is the Faust channel order.
- **Meters** are `vbargraph`s; their short names are what the panel reads (`meterValue(id, name)`).
  Use a peak follower: `peak = abs : max ~ *(ba.tau2pole(0.15));`.
- **Metadata the engine understands:**
  - `declare tail "<seconds>";` — how long the module can still sound after its inputs went
    silent; the engine lets it sleep after that. Omit for anything with an unknown tail. Sources
    (no inputs) never sleep regardless.
  - `declare sink "1";` — the module's two outputs go to the speakers (used by Output).
- **Smoothing:** smooth every slider that affects audio (`: si.smoo`) to avoid zipper noise.

### Integration facts (handled in `FaustDsp`, good to know)

- The compiler stores its JSON description in wasm memory from address 0, which overlaps where
  the audio buffers go. Buffers are cleared at start-up.
- Bargraph (meter) values are only written by `compute()`; before the first block they contain
  leftover bytes. They are zeroed at start-up and on reset.
- The `.json` holds the memory address of every parameter, so it must come from the same build as
  the `.wasm`. Both are fetched together at runtime, and the channel counts are checked.

## Library building blocks we measured

Measured at 48 kHz in `src/dsp/modules.test.ts`. "Aliasing" = power outside the harmonics below
12 kHz, relative to the harmonics.

| Building block | Verdict | Notes |
|---|---|---|
| `os.osc` (sine, table) | ✅ used | Clean; 64 K table. |
| `os.polyblep_saw` / 2-point PolyBLEP | ⚠️ replaced | Stable, but aliasing only −46 … −54 dB. |
| 4-point BLEP from the integrated cubic B-spline (own, in `osc.dsp`) | ✅ used for saw and square | −73 … −94 dB; stable under pitch jumps; −0.6 dB at 7 kHz fundamental. |
| PolyBLAMP triangle (own, in `osc.dsp`) | ✅ used | −67 … −87 dB; correct amplitude at 2 Hz. |
| `os.sawN(4)`, `os.squareN(4)` (DPW) | ❌ rejected | Good aliasing (−60 … −67 dB) but output spikes up to ~700× on sudden pitch jumps. |
| `os.triangleN(3/4)` | ❌ rejected | Amplitude collapses at low pitch (0.08 instead of 1 at 2 Hz); spikes on pitch jumps. |
| `os.polyblep_triangle` | ❌ not used | Leaky integrator (pole 0.999): DC drift and shape errors at low pitch. |

## Testing checklist for a new module

- Correct pitch / level / gain law for its main parameters.
- Aliasing (sources), stability under sudden parameter and pitch jumps, behaviour at extremes
  (very low and very high values).
- Click-free parameter changes while "dragging" (a new value every ~16 ms).
- Meters read zero before processing; metadata matches the code.
- CPU cost per block (benchmark when the module does real work per sample).
