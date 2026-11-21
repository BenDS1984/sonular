/**
 * Sequencer blocks copied with Ctrl+C on the timeline, to paste at the playhead with Ctrl+V on
 * the same sequencers. Screen state: not saved and not part of undo.
 */
export interface CopiedBlock {
  patch: string;
  module: string;
  /** Beats from the start of the first copied block. */
  offset: number;
  length: number;
  bank: number;
}

export const blockClipboard: { blocks: CopiedBlock[] } = { blocks: [] };
