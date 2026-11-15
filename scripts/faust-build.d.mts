// Type declarations for faust-build.mjs (used from vite.config.ts).
export const DSP_DIR: string;
export const OUT_DIR: string;
export function compileDsp(dspPath: string): string;
export function buildAll(options?: { force?: boolean; log?: (msg: string) => void }): string[];
