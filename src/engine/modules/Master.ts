import { BLOCK_SIZE, type SinkModule } from '../core/types';

/**
 * Engine-internal stereo sink that hands its inputs to the device output.
 * Input 0 = left, input 1 = right; when only the left input is connected it feeds both sides.
 * (The user-facing Output module with volume and meters arrives in step 5 and will be a sink too.)
 */
export class Master implements SinkModule {
  readonly isSink = true;
  readonly numInputs = 2;
  readonly numOutputs = 0;
  readonly tailSeconds = 0;
  readonly outL = new Float32Array(BLOCK_SIZE);
  readonly outR = new Float32Array(BLOCK_SIZE);
  private monoToStereo = true;

  setParam(): void {}

  onConnectionsChanged(connected: readonly boolean[]): void {
    this.monoToStereo = !connected[1];
  }

  process(inputs: readonly Float32Array[], _silent: readonly boolean[], _outputs: readonly Float32Array[], frames: number): void {
    const l = inputs[0]!;
    const r = this.monoToStereo ? l : inputs[1]!;
    // Plain copy loop: subarray() would allocate a new view every block.
    const oL = this.outL;
    const oR = this.outR;
    for (let i = 0; i < frames; i++) {
      oL[i] = l[i]!;
      oR[i] = r[i]!;
    }
  }

  reset(): void {
    this.outL.fill(0);
    this.outR.fill(0);
  }
}
