/** Small per-user interface preferences, remembered in browser storage. */
import { browserStore } from '../platform/storage';

const KEY = 'sonular.ui';

interface Prefs {
  minimap: boolean;
  /** The welcome window has been seen and closed once. */
  welcomed: boolean;
}

const DEFAULTS: Prefs = { minimap: true, welcomed: false };

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
