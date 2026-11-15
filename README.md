# Modulab

A modular DAW that runs in your browser — online, and offline once installed.

Patch modules together with cables, shape sound, and (later) arrange it on a timeline.
Modulab is free and open source, and aims for sound quality that holds up in real music production.

> **Status:** early development. Nothing is usable yet.

## Principles

- **Sounds good.** Band-limited oscillators, click-free parameter changes, well-behaved filters.
- **Lean on CPU.** Modules that aren't heard aren't computed; idle modules sleep.
- **Works offline.** Installable as a Progressive Web App (PWA).
- **Grows over time.** Many modules — including niche ones — each a self-contained unit.

## Tech

- [Svelte](https://svelte.dev) + [TypeScript](https://www.typescriptlang.org) for the interface
- [Vite](https://vite.dev) for development and builds
- [Faust](https://faust.grame.fr) for DSP, compiled to WebAssembly at build time
- Web Audio `AudioWorklet` hosting a single custom engine

## Development

Requires [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173
npm run build    # production build in dist/
npm run check    # type-check
```

## License

[GPL-3.0-or-later](LICENSE)
