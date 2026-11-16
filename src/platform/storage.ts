/**
 * Small key/value store for app data that must survive a reload (the autosaved patch).
 *
 * Browser-specific code lives here so a desktop build can swap in its own implementation.
 * Every access is guarded: storage can be unavailable (private windows, blocked site data).
 */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
}

export const browserStore: KeyValueStore = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing to remove.
    }
  },
};
