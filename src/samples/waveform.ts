/**
 * Detailed waveforms for drawing audio clips: the lowest and highest value of each short stretch
 * of a sample, kept at four levels of detail so any zoom can be drawn without going through all
 * the audio again.
 */

/** Frames per stretch at each level, from very fine to coarse. */
const LEVEL_SIZES = [8, 64, 512, 4096];
/**
 * Short samples (up to about 30 seconds) also keep every single frame, so a drum hit can be zoomed
 * in until its actual shape shows. Longer ones start at a stretch of 8 frames, to save memory.
 */
const RAW_MAX_FRAMES = 1_500_000;

export interface WaveLevel {
  /** Frames covered by each entry. */
  size: number;
  min: Float32Array;
  max: Float32Array;
}

export interface Waveform {
  /** Sample rate of the audio in Hz. */
  rate: number;
  /** Number of frames in the sample. */
  frames: number;
  levels: WaveLevel[];
}

/** The waveform of a sample (the channels are drawn together: lowest and highest of all). */
export function computeWaveform(channels: readonly Float32Array[], rate: number): Waveform {
  const frames = channels[0]?.length ?? 0;
  const sizes = frames <= RAW_MAX_FRAMES ? [1, ...LEVEL_SIZES] : LEVEL_SIZES;
  const size = sizes[0]!;
  const count = Math.ceil(frames / size);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  for (let b = 0; b < count; b++) {
    const from = b * size;
    const to = Math.min(frames, from + size);
    let lo = Infinity;
    let hi = -Infinity;
    for (const ch of channels) {
      for (let i = from; i < to; i++) {
        const v = ch[i]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo === Infinity ? 0 : lo;
    max[b] = hi === -Infinity ? 0 : hi;
  }
  const levels: WaveLevel[] = [{ size, min, max }];
  for (let l = 1; l < sizes.length; l++) {
    const prev = levels[l - 1]!;
    const ratio = sizes[l]! / prev.size;
    const n = Math.ceil(prev.min.length / ratio);
    const lo = new Float32Array(n);
    const hi = new Float32Array(n);
    for (let b = 0; b < n; b++) {
      let a = Infinity;
      let z = -Infinity;
      const end = Math.min(prev.min.length, (b + 1) * ratio);
      for (let i = b * ratio; i < end; i++) {
        if (prev.min[i]! < a) a = prev.min[i]!;
        if (prev.max[i]! > z) z = prev.max[i]!;
      }
      lo[b] = a === Infinity ? 0 : a;
      hi[b] = z === -Infinity ? 0 : z;
    }
    levels.push({ size: sizes[l]!, min: lo, max: hi });
  }
  return { rate, frames, levels };
}

/**
 * The lowest and highest value in each of `columns` equal parts of the stretch from `fromSec` to
 * `toSec` of the sample (silence outside the sample). Uses the coarsest level that still has
 * about a stretch per column.
 */
export function waveColumns(w: Waveform, fromSec: number, toSec: number, columns: number): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);
  if (columns < 1 || !(toSec > fromSec)) return { min, max };
  const perColumn = ((toSec - fromSec) * w.rate) / columns; // frames in a column
  let level = w.levels[0]!;
  for (const l of w.levels) if (l.size <= perColumn) level = l;
  const f0 = fromSec * w.rate;
  for (let c = 0; c < columns; c++) {
    const a = f0 + c * perColumn;
    const b = a + perColumn;
    if (b <= 0 || a >= w.frames) continue;
    const i0 = Math.max(0, Math.floor(a / level.size));
    const i1 = Math.min(level.min.length, Math.max(i0 + 1, Math.ceil(b / level.size)));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = i0; i < i1; i++) {
      if (level.min[i]! < lo) lo = level.min[i]!;
      if (level.max[i]! > hi) hi = level.max[i]!;
    }
    if (lo !== Infinity) {
      min[c] = lo;
      max[c] = hi;
    }
  }
  return { min, max };
}

/**
 * A waveform as a filled shape for an SVG polygon with viewBox "0 -1 <columns> 2": the top edge
 * follows the highest values, the bottom edge the lowest. Quiet stretches keep a thin line.
 */
export function waveShape(cols: { min: Float32Array; max: Float32Array }, gain = 0.92): string {
  const n = cols.min.length;
  const top: string[] = [];
  const bottom: string[] = [];
  const add = (x: number, hi: number, lo: number) => {
    top.push(`${x},${(-hi).toFixed(3)}`);
    bottom.push(`${x},${(-lo).toFixed(3)}`);
  };
  for (let c = 0; c < n; c++) {
    let hi = Math.min(1, cols.max[c]! * gain);
    let lo = Math.max(-1, cols.min[c]! * gain);
    if (hi - lo < 0.03) {
      const mid = (hi + lo) / 2;
      hi = mid + 0.015;
      lo = mid - 0.015;
    }
    // Joined through the middle of each column (not in steps), so a zoomed-in wave is smooth.
    if (c === 0) add(0, hi, lo);
    add(c + 0.5, hi, lo);
    if (c === n - 1) add(n, hi, lo);
  }
  return [...top, ...bottom.reverse()].join(' ');
}
