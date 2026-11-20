/**
 * The block selected on the timeline (Delete, Ctrl+D and the keys 1–8 act on it).
 * Screen state: not saved and not part of undo.
 */
export const clipSelection = $state({ patch: null as string | null, clip: null as string | null });

export function selectClip(patchId: string, clipId: string) {
  clipSelection.patch = patchId;
  clipSelection.clip = clipId;
}

export function clearClipSelection() {
  clipSelection.patch = null;
  clipSelection.clip = null;
}

export const isClipSelected = (patchId: string, clipId: string) =>
  clipSelection.patch === patchId && clipSelection.clip === clipId;
