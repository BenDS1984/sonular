/**
 * Which main view is shown under the tab bar: a patch on the canvas, the mixer or the timeline.
 * Screen state only: not saved in the project and not part of undo.
 */
export type MainView = 'patch' | 'mixer' | 'timeline';

export const view = $state({ main: 'patch' as MainView });
