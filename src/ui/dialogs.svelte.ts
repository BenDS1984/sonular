/** Which app-level dialog is open. */
export const dialogs = $state({
  /** "Save patch" dialog asking for a name (shown when the patch is still untitled). */
  save: false,
  /** Welcome / about window: opens by itself on the first visit (see App.svelte). */
  welcome: false,
});
