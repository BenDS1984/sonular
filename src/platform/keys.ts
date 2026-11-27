/** Mac keyboards have Cmd where other computers have Ctrl; used in tooltips so they name the right key. */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const MOD_KEY = isMac ? 'Cmd' : 'Ctrl';
/** Redo: Cmd+Shift+Z on a Mac, Ctrl+Y elsewhere (both work everywhere). */
export const REDO_KEYS = isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y';
