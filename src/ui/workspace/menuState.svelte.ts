/** The right-click menu of a module: where it is open (screen pixels), or null when closed. */
export const moduleMenu = $state<{ open: { x: number; y: number } | null }>({ open: null });
