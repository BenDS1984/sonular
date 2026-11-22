/**
 * The decoded samples the audio tracks play, by sample id. Lives in the audio engine; the main
 * thread sends each sample once (decoded, at the sample's own rate) and the audio tracks read it.
 */
export interface SampleData {
  /** Sample rate of the data in Hz. */
  rate: number;
  left: Float32Array;
  /** The same array as `left` for a mono sample. */
  right: Float32Array;
  /** Number of frames. */
  length: number;
}

export class SampleBank {
  private readonly samples = new Map<string, SampleData>();

  set(id: string, rate: number, channels: readonly Float32Array[]): void {
    const left = channels[0];
    if (!left || !(rate > 0)) return;
    this.samples.set(id, { rate, left, right: channels[1] ?? left, length: left.length });
  }

  get(id: string): SampleData | undefined {
    return this.samples.get(id);
  }

  delete(id: string): void {
    this.samples.delete(id);
  }

  has(id: string): boolean {
    return this.samples.has(id);
  }
}
