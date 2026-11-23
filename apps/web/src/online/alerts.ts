import { sfx } from '../audio/effects';
import { remember, storedJson } from '../storage';
import { appKey } from '../appId';

/**
 * Telling the player it has become their move in an online game, without getting in the way of one
 * they're watching: how depends on where they're looking (`alertYourMove`).
 */

/** Per game, the last turn change this browser alerted, so its tabs alert each one once between them. */
const ALERTED = appKey('online.alerted');
/** A tab the player isn't looking at waits this long before alerting, so a tab they are looking at goes first. */
const GRACE_MS = 2000;

/** Whether the player is looking at this page: on screen and, on a computer, not in a window behind another. */
export const attending = () => document.visibilityState === 'visible' && document.hasFocus();

/** Whether this tab is the first to alert `turn` (it is then marked as alerted). */
function claim(secret: string, turn: string): boolean {
  const done = storedJson<Record<string, string>>(ALERTED) ?? {};
  if (done[secret] === turn) return false;
  done[secret] = turn;
  remember(ALERTED, JSON.stringify(done));
  return true;
}

export interface YourMove {
  /** The game's link secret. */
  secret: string;
  /** What made it the player's move (a post, and the battle stage if a battle waits on them): alerted once. */
  turn: string;
  /** Where this tab is: a game's screen, or the lobby. */
  where: 'game' | 'lobby';
  /** It waits on the player's answer in a battle rather than on their turn. */
  battle: boolean;
}

/**
 * It has just become the player's move. Looking at the game: a soft chime, and only for their turn
 * (a battle waiting on them fills the screen already). Looking at the lobby: the chime and a buzz
 * (Android). Not looking: the chime, and the tab's title.
 */
export function alertYourMove(m: YourMove) {
  const go = () => {
    if (!claim(m.secret, m.turn)) return;
    if (attending()) {
      if (m.where === 'game') {
        if (!m.battle) sfx.yourMove(0.5);
      } else {
        sfx.yourMove();
        navigator.vibrate?.([80, 60, 80]);
      }
      return;
    }
    sfx.yourMove();
    flagTitle(m.secret);
  };
  if (attending()) go();
  else window.setTimeout(go, GRACE_MS);
}

/** The games waiting on the player since they last looked at this page, counted in its title. */
const waiting = new Set<string>();
let plainTitle = '';

function flagTitle(secret: string) {
  if (!waiting.size) plainTitle = document.title;
  waiting.add(secret);
  document.title = `(${waiting.size}) Your move · ${plainTitle}`;
}

/** The player looks again: the title goes back. */
function seen() {
  if (!attending() || !waiting.size) return;
  document.title = plainTitle;
  waiting.clear();
}
window.addEventListener('focus', seen);
document.addEventListener('visibilitychange', seen);
