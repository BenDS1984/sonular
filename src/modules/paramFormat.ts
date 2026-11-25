import {
  formatCents,
  formatGainDb,
  formatHz,
  formatMs,
  formatNote,
  formatNumber,
  formatPan,
  formatPercent,
  formatSeconds,
  formatSemitones,
} from '../ui/format';
import type { ParamSpec } from './types';

/** Display function for a parameter, chosen from its spec. */
export function paramFormatter(spec: ParamSpec): (value: number) => string {
  switch (spec.format) {
    case 'gain-db':
      return formatGainDb;
    case 'semitones':
      return (v) => formatSemitones(v);
    case 'cents':
      return formatCents;
    case 'pan':
      return formatPan;
    case 'hz':
      return formatHz;
    case 'percent':
      return formatPercent;
    case 'seconds':
      return formatSeconds;
    case 'ms':
      return formatMs;
    case 'note':
      return formatNote;
    case 'times':
      return (v) => `×${v < 9.95 ? v.toFixed(1) : v.toFixed(0)}`;
    case 'degrees':
      return (v) => `${Math.round(v)}°`;
    case 'octaves':
      return (v) => formatNumber(v, 'oct');
    case 'toggle':
      return (v) => (v >= 0.5 ? 'On' : 'Off');
    case 'choice':
      return (v) => spec.choices?.[Math.round(v)] ?? String(v);
    default:
      return (v) => formatNumber(v);
  }
}
