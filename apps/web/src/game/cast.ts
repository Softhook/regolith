import type { GameState, LogEntry } from '@regolith/engine';
import { lastLogId } from './useTransient';

/** The decisions a Tactic leaves its player, where it lands: each step that settles one is the card's doing. */
const LANDING = new Set(['showOfForce', 'warpGate', 'placeBarrier', 'kineticShunt', 'placeExpansion', 'unveil', 'changeOfHeart']);

/**
 * The card whose effect the step from `before` to `game` is: the Tactic whose decision it settles (Show of
 * Force's target…), else one it played or used (a Tactic, a skill, a skill firing by itself). A Tactic comes
 * first: its blow may set off skills of their own (Plundering after Show of Force), which cast for themselves
 * (see `gains`). Not a card taken: it flies from the market instead (CardFlight).
 */
export function castOf(before: GameState, game: GameState): LogEntry | undefined {
  const head = before.pending[0];
  if (head && LANDING.has(head.kind) && 'player' in head) {
    for (let i = before.log.length - 1; i >= 0; i--) {
      const e = before.log[i];
      if (e.turn || e.event === 'expansion') break;
      if (e.event !== 'cardPlayed') continue;
      if (e.player === head.player) return e;
      break;
    }
  }
  const last = lastLogId(before);
  return game.log.find((e) => e.id > last && e.card && e.event !== 'cardTaken');
}

/** Whether the game waits for a Tactic to land (its target, its gates…): until then the card has done nothing. */
export const landing = (s: GameState) => s.pending.some((p) => LANDING.has(p.kind));

/** Whether the AI is about to settle a Tactic it has just played: it waits a little, so the card is read first. */
export const landingNext = (s: GameState) => landing(s) && s.log.at(-1)?.event === 'cardPlayed';

/**
 * Whether `e` is a skill's start-of-turn bonus (Arrogant, Conformist) that its player also had at the start
 * of their last turn: news the first time, not every turn after. Logged all the same, but not shown.
 */
export function repeatsLastTurn(log: readonly LogEntry[], e: LogEntry): boolean {
  if (!e.gains) return false;
  let i = log.findIndex((x) => x.id === e.id) - 1;
  // The bonuses come right after the turn's heading.
  while (i >= 0 && log[i].gains) i--;
  if (i < 0 || !log[i].turn || log[i].player !== e.player) return false;
  // The heading of the player's turn before.
  i--;
  while (i >= 0 && !(log[i].turn && log[i].player === e.player)) i--;
  if (i < 0) return false;
  for (let j = i + 1; j < log.length && log[j].gains; j++) if (log[j].card === e.card) return true;
  return false;
}
