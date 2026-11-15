/** How a control maps its 0..1 travel onto a parameter range. */
export type Scale = 'linear' | 'log';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Parameter value -> normalised position (0..1). */
export function toNormalized(value: number, min: number, max: number, scale: Scale): number {
  if (max === min) return 0;
  const t =
    scale === 'log' && min > 0
      ? Math.log(value / min) / Math.log(max / min)
      : (value - min) / (max - min);
  return clamp(Number.isFinite(t) ? t : 0, 0, 1);
}

/** Normalised position (0..1) -> parameter value. */
export function fromNormalized(t: number, min: number, max: number, scale: Scale): number {
  const n = clamp(t, 0, 1);
  return scale === 'log' && min > 0 ? min * Math.pow(max / min, n) : min + (max - min) * n;
}

/** Snap a value to a step grid anchored at `min`. A step of 0 means continuous. */
export function quantize(value: number, step: number, min: number): number {
  if (!step) return value;
  return min + Math.round((value - min) / step) * step;
}
