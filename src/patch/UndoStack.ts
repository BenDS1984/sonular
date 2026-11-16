/**
 * A bounded undo/redo stack of snapshots (strings). Pure logic, no timing or UI.
 */
export class UndoStack {
  private past: string[] = [];
  private future: string[] = [];
  private current: string;
  private readonly limit: number;

  constructor(initial: string, limit = 200) {
    this.current = initial;
    this.limit = limit;
  }

  /** The state the stack considers current (the latest recorded or restored one). */
  get currentSnapshot(): string {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Record a new state. Ignored if identical to the current one; clears the redo stack. */
  push(snapshot: string): boolean {
    if (snapshot === this.current) return false;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = snapshot;
    this.future = [];
    return true;
  }

  /** Step back; returns the state to restore, or null. */
  undo(): string | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.current);
    this.current = prev;
    return prev;
  }

  /** Step forward; returns the state to restore, or null. */
  redo(): string | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.current);
    this.current = next;
    return next;
  }

  /** Forget all history and start from this state. */
  reset(snapshot: string): void {
    this.past = [];
    this.future = [];
    this.current = snapshot;
  }
}
