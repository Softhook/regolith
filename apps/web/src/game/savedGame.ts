import { checkInvariants, MODES, type GameState } from '@regolith/engine';
import { forget, remember, stored } from '../storage';
import type { SavedPast } from './past';
import { appKey } from '../appId';

/** The unfinished game, kept in localStorage so a revisit can resume it. */
const KEY = appKey('savedGame');
/** And its past (past.ts), to look back at it from the log after a revisit too. */
const PAST_KEY = appKey('savedPast');

export function saveGame(state: GameState, past?: SavedPast) {
  if (state.phase === 'over') return clearSavedGame();
  remember(KEY, JSON.stringify(state));
  if (past) remember(PAST_KEY, JSON.stringify(past));
}

export function clearSavedGame() {
  forget(KEY);
  forget(PAST_KEY);
}

/** The saved game's past, unchecked: restore() checks that it leads to the game. */
export function loadSavedPast(): SavedPast | null {
  try {
    return JSON.parse(stored(PAST_KEY) ?? 'null') as SavedPast | null;
  } catch {
    return null;
  }
}

/** The saved game as stored, unchecked: for a crash report. */
export function savedGameJson(): string | null {
  return stored(KEY);
}

/** The saved game, or null if there is none or it no longer fits this version of the engine. */
export function loadSavedGame(): GameState | null {
  const raw = stored(KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Omit<GameState, 'mode'> & { mode: string };
    const mode = MODES.find((m) => m.id === saved.mode)?.id;
    if (!mode) throw new Error('stale save');
    const state: GameState = { ...saved, mode };
    if (state?.version !== 1 || state.phase === 'over' || checkInvariants(state).length) throw new Error('stale save');
    return state;
  } catch {
    clearSavedGame();
    return null;
  }
}

/**
 * Per tab: a game on this device is on screen. A reload then brings it back instead of the lobby: a new
 * version taking over in the background (src/pwa.ts), pull to refresh, or the browser reloading the tab.
 */
const ON_SCREEN = appKey('gameOnScreen');

export function markGameOnScreen(on: boolean) {
  try {
    if (on) sessionStorage.setItem(ON_SCREEN, '1');
    else sessionStorage.removeItem(ON_SCREEN);
  } catch {
    // no session storage: a reload shows the lobby, with the game to resume
  }
}

/** The saved game, if it was on screen when this tab last reloaded. */
export function gameOnScreenBeforeReload(): GameState | null {
  try {
    return sessionStorage.getItem(ON_SCREEN) ? loadSavedGame() : null;
  } catch {
    return null;
  }
}
