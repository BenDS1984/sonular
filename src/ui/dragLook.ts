/**
 * A steady look while something is dragged. What is dragged often jumps in grid steps while the
 * pointer moves smoothly, so the pointer keeps crossing its edges: without this the cursor and
 * the hover colours under the pointer would flicker. While a drag lasts, the whole page shows one
 * cursor, and styles written as `:global(html:not(.dragging)) .thing:hover` stay off.
 */
export function startDragLook(cursor: string) {
  const root = document.documentElement;
  root.style.setProperty('--drag-cursor', cursor);
  root.classList.add('dragging');
}

export function endDragLook() {
  const root = document.documentElement;
  root.classList.remove('dragging');
  root.style.removeProperty('--drag-cursor');
}
