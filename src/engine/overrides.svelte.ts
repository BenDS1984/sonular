/**
 * Automated controls the user took over by turning them: their lanes pause until the next Play.
 * Screen state only: not saved and not part of undo.
 */

/** Keys "<patch id>/<module id>:<param>" of the controls taken over. */
export const overrides = $state({ keys: {} as Record<string, true> });

export const overrideKey = (patchId: string, moduleId: string, param: string) => `${patchId}/${moduleId}:${param}`;

export function clearOverrides() {
  for (const k of Object.keys(overrides.keys)) delete overrides.keys[k];
}
