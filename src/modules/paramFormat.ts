import {
  formatCents,
  formatGainDb,
  formatHz,
  formatMs,
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
    case 'toggle':
      return (v) => (v >= 0.5 ? 'On' : 'Off');
    case 'choice':
      return (v) => spec.choices?.[Math.round(v)] ?? String(v);
    default:
      return (v) => formatNumber(v);
  }
}
