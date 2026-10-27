import type { Action, GameState } from './types';

/** Deterministic phase-1 actions a player may take back. Anything involving dice or cards is final. */
const UNDOABLE = new Set<Action['type']>([
  'move',
  'deploy',
  'research',
  'conquer',
  'carry',
  'swap',
  'change',
  'flexible',
  'composed',
  'ambitious',
  'tactical',
]);

/**
 * Whether `action` (which turned `prev` into `next`) may be undone: it must be a
 * deterministic move by the current player that consumed no randomness, revealed no
 * cards and did not start a battle or end the game. Undo exists to fix misclicks,
 * never to re-roll.
 */
export function isUndoable(prev: GameState, action: Action, next: GameState): boolean {
  if (!UNDOABLE.has(action.type)) return false;
  if (action.type === 'tactical' && action.target) return false;
  if (next.rng !== prev.rng || next.phase !== 'play') return false;
  if (next.turn.number !== prev.turn.number || next.pending.length) return false;
  const m = (s: GameState) =>
    [s.market.skillDeck.length, s.market.tacticDeck.length, s.market.skillRow.join(), s.market.tacticRow.join()].join('|');
  return m(prev) === m(next);
}
