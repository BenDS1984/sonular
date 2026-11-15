/**
 * Diagnostics: the Faust test tone (WebAssembly) in its own AudioWorklet, without the engine.
 * Isolates whether running Faust/WebAssembly on the audio thread causes dropouts.
 */
import { FaustDsp, type FaustMeta } from '../engine/faust/FaustDsp';

class FaustSine extends AudioWorkletProcessor {
  private dsp: FaustDsp | null = null;
  private readonly out = [new Float32Array(128)];

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ module: WebAssembly.Module; meta: FaustMeta }>) => {
      this.dsp = new FaustDsp(e.data.module, e.data.meta, sampleRate);
      this.port.postMessage('ready');
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const dsp = this.dsp;
    const out = outputs[0]!;
    const L = out[0]!;
    if (!dsp) return true;
    dsp.process([], [], this.out, L.length);
    L.set(this.out[0]!);
    if (out[1]) out[1].set(L);
    return true;
  }
}

registerProcessor('diag-faust-sine', FaustSine);
