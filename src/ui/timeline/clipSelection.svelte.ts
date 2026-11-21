/**
 * The blocks selected on the timeline (moving, Delete, Ctrl+D, Ctrl+C and the keys A–H act on
 * them), as keys "<patch id>/<block id>". Screen state: not saved and not part of undo.
 */
export const clipSelection = $state({ keys: [] as string[] });

export const clipKey = (patchId: string, clipId: string) => `${patchId}/${clipId}`;

/** Select only this block. */
export function selectClip(patchId: string, clipId: string) {
  clipSelection.keys = [clipKey(patchId, clipId)];
}

/** Add a block to the selection, or take it out. */
export function toggleClip(patchId: string, clipId: string) {
  const key = clipKey(patchId, clipId);
  clipSelection.keys = clipSelection.keys.includes(key)
    ? clipSelection.keys.filter((k) => k !== key)
    : [...clipSelection.keys, key];
}

export function setClipSelection(keys: string[]) {
  clipSelection.keys = keys;
}

export function clearClipSelection() {
  clipSelection.keys = [];
}

export const isClipSelected = (patchId: string, clipId: string) => clipSelection.keys.includes(clipKey(patchId, clipId));
