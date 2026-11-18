/** Small per-user interface preferences, remembered in browser storage. */
import { browserStore } from '../platform/storage';

const KEY = 'sonular.ui';

interface Prefs {
  minimap: boolean;
  /** The welcome window has been seen and closed once. */
  welcomed: boolean;
  /** Seconds shown in the CPU graph. */
  cpuSpan: 30 | 120 | 600;
}

const DEFAULTS: Prefs = { minimap: true, welcomed: false, cpuSpan: 30 };

function load(): Prefs {
  try {
    const raw = browserStore.get(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = $state<Prefs>(load());

$effect.root(() => {
  $effect(() => {
    browserStore.set(KEY, JSON.stringify(prefs));
  });
});
