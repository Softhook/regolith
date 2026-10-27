import type { GameState, PlayerId } from '@regolith/engine';
import { storedTacticValue } from './cardValues';

/**
 * Tactics the player holds with Patient, for the evaluations. The one played this turn still counts
 * until the turn ends, so playing it is judged by its effect alone (ties go to playing it).
 */
export function storedTactics(s: GameState, p: PlayerId): number {
  const playedNow = s.turn.player === p && s.turn.storedTacticPlayed ? 1.01 : 0;
  return (s.players[p].storedTactics?.length ?? 0) + playedNow;
}

/** What the player's stored Tactics are worth, card by card; like storedTactics, the one played this turn still counts. */
export function storedTacticsValue(s: GameState, p: PlayerId): number {
  let v = (s.players[p].storedTactics ?? []).reduce((sum, id) => sum + storedTacticValue(id), 0);
  // The stored Tactic played this turn is the last one discarded.
  const played = s.turn.player === p && s.turn.storedTacticPlayed ? s.market.tacticDiscard.at(-1) : undefined;
  if (played) v += 1.01 * storedTacticValue(played);
  return v;
}
