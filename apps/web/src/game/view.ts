import type { GameState, PlayerId } from '@regolith/engine';
import type { Toast } from './toasts';
import type { Dispatch } from './useGame';

/** Whether the game is over and lost for this screen: it plays for someone (`mine`), but not for the winner. */
export function lost(game: GameState, mine: (p: PlayerId) => boolean): boolean {
  return game.winner !== null && !mine(game.winner) && game.players.some((_, p) => mine(p));
}

/**
 * A game as the screen sees it, whether it is played on this device (useGame) or online
 * (useOnlineGame). Board, panels and overlays render it and don't care which it is.
 */
export interface GameView {
  game: GameState;
  dispatch: Dispatch;
  /** Whether this screen plays for `p` (on this device: every human; online: this browser's seats). */
  mine(p: PlayerId): boolean;
  undo?: () => void;
  /** Every position of the game so far, oldest first, to look back at from the log (on this device: since it was opened). */
  positions: readonly GameState[];
  /** Log entries up to this id were written before `positions[0]`, and can't be looked back at (none if 0 or missing: it is the game's start). */
  reviewAfter?: number;
  /**
   * Online: counts the times the screen has skipped ahead over moves instead of playing them out, so
   * the board treats each as a jump to another position (no moves or explosions drawn across the gap).
   */
  jumps?: number;
  toasts: Toast[];
  error: { id: number; text: string } | null;
  /** On this device: the AI about to fire a missile in the battle on screen. */
  aiResponder?: PlayerId | null;
  /**
   * Online only: a battle waits for the players who may respond to say they are done, and once
   * decided, if this browser fights in it, stays on screen until dismissed.
   */
  combat?: {
    /** This browser's seats that may still respond. */
    responders: PlayerId[];
    /** Whether the battle waits for this browser. */
    mustAnswer: boolean;
    /** Other players the battle waits for. */
    waitingOn: PlayerId[];
    pass(): void;
    /** Moves on from the battle once it has been decided; only for this browser's own battles. */
    dismiss?: () => void;
  };
}
