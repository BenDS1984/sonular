/**
 * The waveform of the part of a sample that a clip plays, as a mirrored filled shape
 * (width 100, height 20) for an SVG polygon, from the library's coarse overview peaks.
 */
export function clipWavePoints(peaks: readonly number[], from: number, to: number, columns = 48): string {
  const n = peaks.length;
  if (n === 0 || !(to > from)) return '';
  const f = Math.min(1, Math.max(0, from));
  const t = Math.min(1, Math.max(f, to));
  const top: string[] = [];
  const bottom: string[] = [];
  for (let c = 0; c < columns; c++) {
    const lo = f + ((t - f) * c) / columns;
    const hi = f + ((t - f) * (c + 1)) / columns;
    const i0 = Math.min(n - 1, Math.floor(lo * n));
    const i1 = Math.min(n, Math.max(i0 + 1, Math.ceil(hi * n)));
    let peak = 0;
    for (let i = i0; i < i1; i++) peak = Math.max(peak, peaks[i]!);
    const h = Math.max(0.4, peak * 9.5);
    const x = ((c + 0.5) / columns) * 100;
    top.push(`${x.toFixed(2)},${(10 - h).toFixed(2)}`);
    bottom.push(`${x.toFixed(2)},${(10 + h).toFixed(2)}`);
  }
  return [...top, ...bottom.reverse()].join(' ');
}
