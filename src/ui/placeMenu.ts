/**
 * Svelte action for a menu with `position: fixed`: places it at (x, y) but keeps it inside the
 * window. When it does not fit below `y`, it opens above `above` instead (the top of the button
 * it belongs to, or the pointer for a right-click menu) if there is more room there; it never
 * gets taller than the room it has, and scrolls inside when it is longer.
 */
export interface MenuPlace {
  x: number;
  y: number;
  /** Where the menu's bottom goes when it opens upwards. Defaults to `y`. */
  above?: number;
}

const MARGIN = 8;

export function placeMenu(node: HTMLElement, place: MenuPlace) {
  function update(p: MenuPlace) {
    const above = p.above ?? p.y;
    const roomBelow = window.innerHeight - MARGIN - p.y;
    const roomAbove = above - MARGIN;
    node.style.maxHeight = '';
    node.style.overflowY = 'auto';
    const natural = node.scrollHeight;
    // A height limit from the menu's own style still applies.
    const cssMax = parseFloat(getComputedStyle(node).maxHeight) || Infinity;
    const fitsBelow = Math.min(natural, cssMax) <= roomBelow;
    const up = !fitsBelow && roomAbove > roomBelow;
    const room = Math.min(cssMax, up ? roomAbove : roomBelow);
    const height = Math.min(natural, room);
    node.style.maxHeight = `${room}px`;
    node.style.top = `${up ? above - height : p.y}px`;
    const width = node.offsetWidth;
    node.style.left = `${Math.max(MARGIN, Math.min(p.x, window.innerWidth - MARGIN - width))}px`;
  }
  update(place);
  return { update };
}
