/**
 * Diagnostics: the simplest possible AudioWorklet — a plain JavaScript sine (440 Hz, −18 dBFS).
 * With `processorOptions.messages` it also posts a stats message every 50 ms, like the engine.
 */

interface Options {
  processorOptions?: { messages?: boolean };
}

class JsSine extends AudioWorkletProcessor {
  private phase = 0;
  private readonly inc = 440 / sampleRate;
  private readonly messages: boolean;
  private frames = 0;
  private readonly statsFrames = Math.round(0.05 * sampleRate);
  private readonly msg = {
    type: 'stats',
    stats: { cpu: 0, peakL: 0, peakR: 0, clipped: false, faulted: false, limiterGain: 1, processed: 2, sleeping: 0, unreachable: 0 },
  };

  constructor(options?: unknown) {
    super();
    this.messages = !!(options as Options | undefined)?.processorOptions?.messages;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]!;
    const L = out[0]!;
    const R = out[1];
    let peak = 0;
    for (let i = 0; i < L.length; i++) {
      const v = Math.sin(2 * Math.PI * this.phase) * 0.125;
      this.phase += this.inc;
      if (this.phase >= 1) this.phase -= 1;
      L[i] = v;
      if (R) R[i] = v;
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
    }
    if (this.messages) {
      this.frames += L.length;
      if (peak > this.msg.stats.peakL) this.msg.stats.peakL = peak;
      if (this.frames >= this.statsFrames) {
        this.msg.stats.peakR = this.msg.stats.peakL;
        this.port.postMessage(this.msg);
        this.msg.stats.peakL = 0;
        this.frames = 0;
      }
    }
    return true;
  }
}

registerProcessor('diag-js-sine', JsSine);
