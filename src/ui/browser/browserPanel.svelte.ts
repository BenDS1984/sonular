/**
 * The browser panel on the left of the patch (the modules): open or closed and its
 * width are remembered per computer (prefs); where a module picked next goes is screen state.
 */
import type { Point } from '../../patch/geometry';
import { prefs } from '../prefs.svelte';

export const BROWSER_MIN_WIDTH = 180;
export const BROWSER_MAX_WIDTH = 420;
export const BROWSER_DEFAULT_WIDTH = 240;

/** Drag-and-drop data type for a module dragged from the browser onto the canvas. */
export const MODULE_DRAG_TYPE = 'application/x-sonular-module';

export const sideBrowser = $state({
  /** Where the next module picked in the browser goes (canvas px), set by a double-click on the canvas. */
  place: null as Point | null,
  /** Increments when the search field should take the focus. */
  focusTick: 0,
});

export const clampBrowserWidth = (w: number) => Math.round(Math.min(BROWSER_MAX_WIDTH, Math.max(BROWSER_MIN_WIDTH, w)));

export function toggleBrowserPanel() {
  prefs.browserOpen = !prefs.browserOpen;
  if (!prefs.browserOpen) sideBrowser.place = null;
}

/** Double-click on the canvas: open the browser with the cursor in its search field. */
export function requestBrowserSearch(place: Point) {
  prefs.browserOpen = true;
  sideBrowser.place = place;
  sideBrowser.focusTick++;
}
