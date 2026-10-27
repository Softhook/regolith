/** Looking back from the log: each entry shows the position just after it was written. */
import { describe, expect, it } from 'vitest';
import type { GameState } from '@regolith/engine';
import { quickStart } from '../../../packages/engine/test/helpers';
import { keepReviewable, logPositions, reviewSteps } from '../src/game/review';

const base = quickStart(2, 1);

/** `s` after a move that writes `n` log entries. */
function after(s: GameState, n: number): GameState {
  const next = structuredClone(s);
  for (let i = 0; i < n; i++) next.log.push({ id: ++next.logCounter, text: `entry ${next.logCounter}` });
  return next;
}

describe('logPositions', () => {
  it('maps each entry to the position its move led to', () => {
    const a = after(base, 1);
    const b = after(a, 2);
    const c = after(b, 0);
    const d = after(c, 1);
    const at = logPositions([base, a, b, c, d], base.logCounter);
    const id = base.logCounter;
    expect(at.get(id + 1)).toBe(a);
    expect(at.get(id + 2)).toBe(b);
    expect(at.get(id + 3)).toBe(b);
    expect(at.get(id + 4)).toBe(d);
    // What was logged before the first known position can't be shown.
    for (const e of base.log) expect(at.has(e.id)).toBe(false);
    // Unless that position is the game's start: then what its creation logged shows it.
    const fromStart = logPositions([base, a]);
    for (const e of base.log) expect(fromStart.get(e.id)).toBe(base);
  });

  it('after an undo, an entry reusing an undone id shows the new position', () => {
    const a = after(base, 1);
    const undone = after(a, 1);
    const redone = after(a, 1);
    const at = logPositions([base, a, undone, a, redone]);
    expect(at.get(a.logCounter + 1)).toBe(redone);
    expect(at.get(a.logCounter)).toBe(a);
  });

  it('keeps only the positions the log can still show', () => {
    const a = after(base, 3);
    const b = after(a, 2);
    // The log has lost everything before b's entries: a (and base) show nothing any more.
    const c = after(b, 1);
    c.log = c.log.filter((e) => e.id > a.logCounter);
    const kept = keepReviewable([base, a, b, c]);
    expect(kept).toEqual([a, b, c]);
    const at = logPositions(kept);
    for (const e of c.log) expect(at.has(e.id)).toBe(true);
    // Nothing to drop while the log still reaches back to the first position.
    expect(keepReviewable([base, a, b])).toEqual([base, a, b]);
  });
});

describe('reviewSteps', () => {
  it('finds the move an entry belongs to, and steps from move to move', () => {
    const a = after(base, 2);
    const b = after(a, 3);
    const c = after(b, 1);
    const at = logPositions([base, a, b, c], base.logCounter);
    const entries = c.log.filter((e) => at.has(e.id));
    // Entries 0–1 show a, 2–4 show b, 5 shows c.
    expect(reviewSteps(entries, at, 0)).toEqual({ from: 0, to: 2, prev: undefined, next: 2 });
    expect(reviewSteps(entries, at, 3)).toEqual({ from: 2, to: 5, prev: 0, next: 5 });
    expect(reviewSteps(entries, at, 2)).toEqual({ from: 2, to: 5, prev: 0, next: 5 });
    expect(reviewSteps(entries, at, 5)).toEqual({ from: 5, to: 6, prev: 2, next: undefined });
  });
});
