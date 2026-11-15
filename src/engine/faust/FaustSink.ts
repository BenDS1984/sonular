import { BLOCK_SIZE, type SinkModule } from '../core/types';
import type { FaustDsp } from './FaustDsp';

/**
 * Turns a stereo Faust program (2 in, 2 out) into an engine sink: its outputs go to the speakers
 * instead of to other modules. When only the left input is patched, it feeds both sides.
 */
export class FaustSink implements SinkModule {
  readonly isSink = true;
  readonly numInputs = 2;
  readonly numOutputs = 0;
  readonly tailSeconds = 0;
  readonly outL = new Float32Array(BLOCK_SIZE);
  readonly outR = new Float32Array(BLOCK_SIZE);
  readonly meterNames: readonly string[];

  private readonly dsp: FaustDsp;
  private monoToStereo = true;
  // Reused per block (no allocation on the audio thread).
  private readonly ins: Float32Array[] = [];
  private readonly insSilent: boolean[] = [true, true];
  private readonly outs: Float32Array[];

  constructor(dsp: FaustDsp) {
    if (dsp.numInputs !== 2 || dsp.numOutputs !== 2) {
      throw new Error('A sink module needs exactly 2 inputs and 2 outputs');
    }
    this.dsp = dsp;
    this.meterNames = dsp.meterNames;
    this.outs = [this.outL, this.outR];
  }

  setParam(name: string, value: number): void {
    this.dsp.setParam(name, value);
  }

  onConnectionsChanged(connected: readonly boolean[]): void {
    this.monoToStereo = !connected[1];
  }

  process(inputs: readonly Float32Array[], inputSilent: readonly boolean[], _outputs: readonly Float32Array[], frames: number): void {
    const right = this.monoToStereo ? 0 : 1;
    this.ins[0] = inputs[0]!;
    this.ins[1] = inputs[right]!;
    this.insSilent[0] = inputSilent[0]!;
    this.insSilent[1] = inputSilent[right]!;
    this.dsp.process(this.ins, this.insSilent, this.outs, frames);
  }

  readMeters(out: Float32Array, offset: number): void {
    this.dsp.readMeters(out, offset);
  }

  reset(): void {
    this.dsp.reset();
    this.outL.fill(0);
    this.outR.fill(0);
  }
}
