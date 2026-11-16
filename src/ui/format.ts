/** Display formatting for parameter values. All UI numbers go through here. */

const MINUS = '−';

function withSign(s: string): string {
  return s.startsWith('-') ? MINUS + s.slice(1) : s;
}

/** Compact number with an optional unit, e.g. "440 Hz", "1.25 kHz", "0.50 s". */
export function formatNumber(value: number, unit = ''): string {
  const a = Math.abs(value);
  if (unit === 'Hz' && a >= 1000) {
    return withSign((value / 1000).toFixed(a >= 10000 ? 1 : 2)) + ' kHz';
  }
  const s = a >= 100 ? value.toFixed(0) : a >= 10 ? value.toFixed(1) : value.toFixed(2);
  return withSign(s) + (unit ? ` ${unit}` : '');
}

/** Linear gain -> decibels, e.g. "−6.0 dB", "+2.5 dB", "−∞ dB". */
export function formatGainDb(gain: number): string {
  if (gain <= 1e-5) return `${MINUS}∞ dB`;
  const db = 20 * Math.log10(gain);
  const rounded = Math.abs(db) < 0.05 ? 0 : db;
  return (rounded > 0 ? '+' : '') + withSign(rounded.toFixed(1)) + ' dB';
}

/** Pan position (−1..1) -> "L 40", "C", "R 25". */
export function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.005) return 'C';
  return (pan < 0 ? 'L ' : 'R ') + Math.round(Math.abs(pan) * 100);
}

/** Semitones with explicit sign, e.g. "+7 st", "−12 st". */
export function formatSemitones(st: number, decimals = 0): string {
  const r = Number(st.toFixed(decimals));
  if (r === 0) return '0 st';
  return (r > 0 ? '+' : '') + withSign(r.toFixed(decimals)) + ' st';
}

/** Cents with explicit sign, e.g. "+12 ct". */
export function formatCents(ct: number): string {
  const r = Math.round(ct);
  if (r === 0) return '0 ct';
  return (r > 0 ? '+' : '') + withSign(String(r)) + ' ct';
}

/** Frequency, e.g. "440 Hz", "1.20 kHz". */
export function formatHz(hz: number): string {
  return formatNumber(hz, 'Hz');
}

/** Seconds, e.g. "0.45 s", "2.50 s", "12.0 s". */
export function formatSeconds(s: number): string {
  return formatNumber(s, 's');
}

/** Milliseconds, e.g. "0 ms", "8.5 ms", "120 ms". */
export function formatMs(ms: number): string {
  if (Math.abs(ms) < 0.05) return '0 ms';
  const a = Math.abs(ms);
  return withSign(a >= 100 ? ms.toFixed(0) : ms.toFixed(1)) + ' ms';
}

/** 0..1 as a percentage, e.g. "35%". */
export function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}
