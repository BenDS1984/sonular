import { describe, expect, it } from 'vitest';
import { UndoStack } from './UndoStack';

describe('UndoStack', () => {
  it('undoes and redoes in order', () => {
    const s = new UndoStack('a');
    s.push('b');
    s.push('c');
    expect(s.undo()).toBe('b');
    expect(s.undo()).toBe('a');
    expect(s.undo()).toBeNull();
    expect(s.redo()).toBe('b');
    expect(s.redo()).toBe('c');
    expect(s.redo()).toBeNull();
  });

  it('drops the redo branch when something new happens', () => {
    const s = new UndoStack('a');
    s.push('b');
    s.undo();
    s.push('x');
    expect(s.canRedo).toBe(false);
    expect(s.undo()).toBe('a');
  });

  it('ignores identical snapshots and respects the limit', () => {
    const s = new UndoStack('0', 3);
    expect(s.push('0')).toBe(false);
    for (const v of ['1', '2', '3', '4']) s.push(v);
    expect(s.undo()).toBe('3');
    expect(s.undo()).toBe('2');
    expect(s.undo()).toBe('1');
    expect(s.undo()).toBeNull(); // '0' fell off the end
  });
});
