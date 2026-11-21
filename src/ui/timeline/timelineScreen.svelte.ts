/**
 * Screen state of the timeline (zoom and scroll position), kept while other views are shown.
 * Not saved in the project and not part of undo.
 */
import { DEFAULT_PPB } from './timelineGeometry';

export const timelineView = $state({
  /** Zoom: pixels per beat. */
  ppb: DEFAULT_PPB,
  scrollLeft: 0,
  scrollTop: 0,
  /** Patches whose automation lanes are folded away, by patch id. */
  folded: {} as Record<string, boolean>,
});
