/**
 * Service worker registration (offline support and updates).
 * Browser-specific: a desktop build would replace this with its own update mechanism.
 */
import { registerSW } from 'virtual:pwa-register';
import { showToast } from '../ui/toast.svelte';

export const pwaState = $state({
  /** A new version has been downloaded and is waiting for a reload. */
  updateReady: false,
});

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export function startPwa() {
  if (!('serviceWorker' in navigator)) return;
  applyUpdate = registerSW({
    onNeedRefresh() {
      pwaState.updateReady = true;
    },
    onOfflineReady() {
      showToast('Sonular is ready to work offline');
    },
  });
}

/** Activate the waiting version and reload the page. */
export function installUpdate() {
  pwaState.updateReady = false;
  void applyUpdate?.(true);
}

export function dismissUpdate() {
  pwaState.updateReady = false;
}
