/** The card market: which cards a player may take. */
import { effectOf } from '../data';
import { reserve } from '../lookups';
import type { GameState, PlayerId } from '../types';

/**
 * Whether the player may take this face-up card. A Reinforcements card needs a mech in the reserve, as
 * Expansion did: "If you already have both of your expansion mechs in the game, you cannot use EXPANSION
 * cards" (2013 rulebook p.9).
 */
export function canTakeCard(state: GameState, player: PlayerId, id: string): boolean {
  return effectOf(id) !== 'reinforcements' || reserve(state, player).length > 0;
}

/** Whether there is anything the player could do with a card pick. */
export function canTakeAnyCard(state: GameState, player: PlayerId): boolean {
  const m = state.market;
  return (
    [...m.skillRow, ...m.tacticRow].some((id) => canTakeCard(state, player, id)) ||
    (m.reinforcements > 0 && reserve(state, player).length > 0)
  );
}
