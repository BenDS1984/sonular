/**
 * Sonular is made for computers (mouse or trackpad plus keyboard); phones and tablets are not
 * supported (see docs/architecture.md, "Target devices").
 *
 * A device counts as a phone or tablet when it has no precise pointer at all (touch only), or
 * when its screen is phone-sized. A tablet with a mouse or trackpad attached passes. The check
 * looks at the screen, not the window, so a small browser window on a computer is never blocked.
 */
export function isUnsupportedDevice(): boolean {
  const hasFinePointer = window.matchMedia('(any-pointer: fine)').matches;
  const phoneSizedScreen = Math.min(window.screen.width, window.screen.height) < 500;
  return !hasFinePointer || phoneSizedScreen;
}
