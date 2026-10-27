import { actor, apply, isUndoable, type Action, type GameState } from '@regolith/engine';
import { keepReviewable } from './review';

/** A move of a game on this device: an action, or null for an undo. */
type Move = Action | null;

/**
 * A game on this device so far: its positions, oldest first, for looking back at it from the log, and
 * the moves between them (`positions[i + 1]` is `moves[i]` played on `positions[i]`). The game is
 * deterministic (its dice come from its own seed), so the start and the moves are enough to rebuild
 * the rest: that is what is saved with it.
 */
export interface Past {
  positions: readonly GameState[];
  moves: readonly Move[];
  /** The positions before each undoable move this turn, what an undo goes back to. Cleared by anything random or final. */
  undo: readonly GameState[];
  /** Log entries up to this id were written before `positions[0]`, and can't be shown (0: it is the game's start). */
  after: number;
}

/** What is saved of a game's past: enough to rebuild it. */
export interface SavedPast {
  start: GameState;
  moves: readonly Move[];
  after: number;
}

/** The position the game is at now. */
export const current = (past: Past): GameState => past.positions.at(-1)!;

/** A game with no past yet: `state` is its start, or (`after` its log) where it was picked up. */
export function begin(state: GameState, after = 0): Past {
  return { positions: [state], moves: [], undo: [], after };
}

/** `past` with `a` played on its last position. Throws what `apply` throws. */
export function play(past: Past, a: Action): Past {
  const prev = current(past);
  const next = apply(prev, a);
  const human = !prev.players[actor(prev)].ai;
  const undo = human && isUndoable(prev, a, next) ? [...past.undo, prev] : [];
  return keep({ positions: [...past.positions, next], moves: [...past.moves, a], undo, after: past.after });
}

/** `past` with its last undoable move taken back, or null if there is none. */
export function takeBack(past: Past): Past | null {
  const prev = past.undo.at(-1);
  if (!prev) return null;
  return keep({ positions: [...past.positions, prev], moves: [...past.moves, null], undo: past.undo.slice(0, -1), after: past.after });
}

/**
 * Drops the positions the log can no longer show (keepReviewable), and their moves, but not the
 * position an undo would go back to: the past must still rebuild to the same undo.
 */
function keep(past: Past): Past {
  let from = past.positions.length - keepReviewable(past.positions).length;
  if (past.undo.length) from = Math.min(from, past.positions.indexOf(past.undo[0]));
  if (from <= 0) return past;
  return { ...past, positions: past.positions.slice(from), moves: past.moves.slice(from) };
}

export function saved(past: Past): SavedPast {
  return { start: past.positions[0], moves: past.moves, after: past.after };
}

/**
 * The past of `game` from what was saved, played again; or, if it doesn't lead to `game` (another
 * game's, an older engine's, or none), `game` picked up with no past.
 */
export function restore(game: GameState, from: SavedPast | null): Past {
  if (from) {
    try {
      let past = begin(from.start, from.after);
      for (const m of from.moves) {
        const next = m ? play(past, m) : takeBack(past);
        if (!next) throw new Error('nothing to undo');
        past = next;
      }
      if (JSON.stringify(current(past)) === JSON.stringify(game)) return past;
    } catch {
      // falls through: the game goes on without its past
    }
  }
  return begin(game, game.logCounter);
}
