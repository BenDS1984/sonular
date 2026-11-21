/**
 * Automation points copied with Ctrl+C on a lane, to paste on any lane with Ctrl+V. Screen state:
 * not saved and not part of undo.
 */
import type { CopiedPoint } from '../../patch/timeline';

export const laneClipboard: { points: CopiedPoint[] } = { points: [] };
