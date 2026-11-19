/**
 * Which main view is shown under the tab bar: a patch on the canvas, or the mixer. Screen state
 * only: not saved in the project and not part of undo.
 */
export const view = $state({ mixer: false });
