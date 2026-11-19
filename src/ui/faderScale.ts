/**
 * The console-style dB scale shared by the Channel's fader and its meter, so the numbers on the
 * meter also read off the fader: +6 dB at the top, 0 dB at 80 %, −∞ at the bottom.
 */

/** Position (0 = bottom, 1 = top) for these dB values; in between is interpolated. */
const TAPER: readonly [db: number, pos: number][] = [
  [-60, 0.04],
  [-48, 0.1],
  [-24, 0.3],
  [-12, 0.48],
  [-6, 0.62],
  [0, 0.8],
  [6, 1],
];

/** dB values printed on the scale (plus −∞ at the bottom). */
export const SCALE_MARKS = [6, 0, -6, -12, -24, -48] as const;

export function dbToPos(db: number): number {
  if (db <= TAPER[0]![0]) return Math.max(0, TAPER[0]![1] * (1 - (TAPER[0]![0] - db) / 20));
  for (let i = 1; i < TAPER.length; i++) {
    const [d1, p1] = TAPER[i]!;
    const [d0, p0] = TAPER[i - 1]!;
    if (db <= d1) return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
  }
  return 1;
}

export function posToDb(pos: number): number {
  if (pos <= 0) return -Infinity;
  if (pos <= TAPER[0]![1]) return TAPER[0]![0] - (1 - pos / TAPER[0]![1]) * 20;
  for (let i = 1; i < TAPER.length; i++) {
    const [d1, p1] = TAPER[i]!;
    const [d0, p0] = TAPER[i - 1]!;
    if (pos <= p1) return d0 + ((pos - p0) / (p1 - p0)) * (d1 - d0);
  }
  return TAPER[TAPER.length - 1]![0];
}

/** Position of a linear gain (1 = 0 dB). */
export const gainToPos = (gain: number) => (gain <= 1e-5 ? 0 : dbToPos(20 * Math.log10(gain)));
