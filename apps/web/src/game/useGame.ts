import { useCallback, useEffect, useRef, useState } from 'react';
import { checkInvariants, RuleError, say, type Action, type GameState, type PlayerId } from '@regolith/engine';
import { sfx } from '../sound';
import { begin, current, play, restore, saved, takeBack, type Past } from './past';
import { useErrorToast, useToasts } from './toasts';
import { loadSavedPast, saveGame } from './savedGame';
import { useAiDriver } from './useAiDriver';
import { useShortcut } from './useShortcut';
import type { GameView } from './view';

/** Applies an action; false (with an error shown) if the rules refuse it. */
export type Dispatch = (a: Action) => boolean;

/** The dev-only `window.__game` hook the browser tests (scripts/) drive a local game through. */
export type GameHook = { state(): GameState; load(s: GameState): void; dispatch: Dispatch };

/** On this device, the screen plays for every human seat. */
const human = (s: GameState) => (p: PlayerId) => !s.players[p].ai;

/** Logs an engine bug with the state and action that trigger it (replay with window.__game.load). */
function reportBug(what: string, state: GameState, action: Action, error?: unknown) {
  console.error(`[game] ${what}`, { action, error, state: JSON.stringify(state) });
}

/**
 * The game being played on this device: its state, `dispatch`, undo, toasts and errors. AI players move by
 * themselves. Its past (to look back at from the log, and undo) is saved with it, so a revisit has it too.
 */
export function useGame(initial: GameState): GameView {
  const [past, setPastState] = useState(() => restore(initial, loadSavedPast()));
  const game = current(past);
  const { error, showError } = useErrorToast();
  const { toasts, announce } = useToasts();
  const ref = useRef(past);
  const setPast = (next: Past) => {
    ref.current = next;
    setPastState(next);
  };

  const dispatch = useCallback(
    (a: Action): boolean => {
      const before = ref.current;
      const prev = current(before);
      let after: Past;
      try {
        after = play(before, a);
      } catch (e) {
        if (e instanceof RuleError) {
          showError(say(prev, e.message));
        } else {
          // An engine bug. Keep the game running and log what is needed to reproduce it.
          reportBug('apply threw', prev, a, e);
          showError(`Engine error: ${(e as Error).message} (details in the console)`);
        }
        return false;
      }
      const next = current(after);
      if (import.meta.env.DEV) {
        const broken = checkInvariants(next);
        if (broken.length) reportBug(`invariants broken: ${broken.join('; ')}`, prev, a);
      }
      setPast(after);
      announce(prev, next, human(next));
      return true;
    },
    [announce, showError],
  );

  const undo = useCallback(() => {
    const after = takeBack(ref.current);
    if (!after) return;
    setPast(after);
    sfx.select();
  }, []);

  const aiResponder = useAiDriver(game, dispatch, showError);

  // Keep the unfinished game in the browser so a revisit can resume it.
  useEffect(() => saveGame(current(past), saved(past)), [past]);

  // Dev-only hook for browser tests. A loaded state has no past.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const load = (s: GameState) => {
      const prev = current(ref.current);
      setPast(begin(s, s.logCounter));
      announce(prev, s, human(s));
    };
    (window as unknown as { __game: GameHook }).__game = { state: () => current(ref.current), load, dispatch };
  }, [announce, dispatch]);

  const mine = useCallback((p: PlayerId) => human(current(ref.current))(p), []);
  return {
    game,
    dispatch,
    mine,
    error,
    toasts,
    undo: past.undo.length > 0 ? undo : undefined,
    positions: past.positions,
    reviewAfter: past.after,
    aiResponder,
  };
}

/** Ctrl/Cmd+Z undoes the last move, unless the user is typing or a dialog is open over the board. */
export function useUndoShortcut(undo: (() => void) | undefined) {
  useShortcut(
    (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z',
    (e) => {
      e.preventDefault();
      undo?.();
    },
  );
}
