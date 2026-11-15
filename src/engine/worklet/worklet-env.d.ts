// Minimal typings for the AudioWorkletGlobalScope (not part of TypeScript's DOM lib).

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: unknown) => AudioWorkletProcessor,
): void;

declare const sampleRate: number;
