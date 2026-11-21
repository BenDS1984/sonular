/** Small per-user interface preferences, remembered in browser storage. */
import { browserStore } from '../platform/storage';

const KEY = 'sonular.ui';

interface Prefs {
  minimap: boolean;
  /** The welcome window has been seen and closed once. */
  welcomed: boolean;
  /** Seconds shown in the CPU graph. */
  cpuSpan: 30 | 120 | 600;
  /** The browser panel on the left of a patch is shown. */
  browserOpen: boolean;
  /** Width of the browser panel in pixels. */
  browserWidth: number;
  /** Module families folded in the browser. */
  browserFolded: string[];
}

const DEFAULTS: Prefs = {
  minimap: true,
  welcomed: false,
  cpuSpan: 30,
  browserOpen: true,
  browserWidth: 240,
  browserFolded: [],
};

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
