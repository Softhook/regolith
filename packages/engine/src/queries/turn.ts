/** Turn limits: once-per-turn effects, and what a player's skills let them do this turn. */
import { rulesOf } from '../rules';
import { anySkill, ruleOf, skillRules } from '../skillRules';
import type { Die, GameState, OncePerTurn, PlayerId, TurnState } from '../types';

/** Whether a once-per-turn effect has been used this turn. */
export function usedThisTurn(state: GameState, tag: OncePerTurn): boolean {
  return state.turn.oncePerTurn.includes(tag);
}

/** Boost: one mech ability may be used a second time each turn. */
export function boostAvailable(state: GameState, player: PlayerId): boolean {
  return anySkill(state, player, (r) => r.abilityTwice) && !usedThisTurn(state, 'boost');
}

export function canUseAbility(state: GameState, d: Die): boolean {
  return !state.turn.abilityUsed[d.id] || boostAvailable(state, d.owner);
}

/**
 * Refit targets one of your mechs on the map or in your salvage yard (2013 rulebook p.5), which still
 * has a number it hasn't shown this turn (Community Edition).
 */
export function canRefit(state: GameState, d: Die): boolean {
  return d.loc.zone !== 'reserve' && (state.turn.seen[d.id]?.length ?? 1) < 6;
}

/**
 * Unlike other skills, a held Veteran Crew raises the limit at once, before it becomes active at the end
 * of the turn, so taking it as a 4th skill forces no discard (RULES.md ruling 13).
 */
export function skillLimit(state: GameState, player: PlayerId): number {
  return Math.max(3, ...state.players[player].skills.map((s) => ruleOf(s.id).skillLimit ?? 0));
}

/** Research that makes a Discovery: a card at the end of the turn, and Research back to 1. */
export function discoveryAt(state: GameState, player: PlayerId): number {
  const limit = rulesOf(state).researchLimit;
  return Math.min(limit, ...skillRules(state, player).map((r) => r.discoveryAt ?? limit));
}

/** Power needed for Take Over (normally 6, or 4 with Stolen Flag). */
export function takeOverAt(state: GameState, player: PlayerId): number {
  return Math.min(6, ...skillRules(state, player).map((r) => r.takeOverAt ?? 6));
}

/**
 * Whether no more actions may be taken this turn, only ending it (or playing a stored Tactic): after
 * the Prospectors extra action or a stored Tactic (Strategic Plan).
 */
export function actionsClosed(t: TurnState): boolean {
  return !!(t.prospectorsUsed || t.storedTacticPlayed);
}

/** Prospectors: whether the player may take an additional Move or Research action. */
export function canProspectors(state: GameState, player: PlayerId): boolean {
  const t = state.turn;
  return (
    anySkill(state, player, (r) => r.peacefulExtraAction) &&
    player === t.player &&
    t.phase === 'actions' &&
    !t.attacked &&
    (t.claimed ?? 0) === 0 &&
    !t.prospectorsUsed
  );
}

/** Strategic Plan: whether the player can play a stored Tactic at the end of their turn. */
export function canPlayStoredTactic(state: GameState, player: PlayerId): boolean {
  const t = state.turn;
  const pl = state.players[player];
  return (
    anySkill(state, player, (r) => r.storeTactics) &&
    player === t.player &&
    t.phase === 'actions' &&
    !t.storedTacticPlayed &&
    (pl.storedTactics?.length ?? 0) > 0
  );
}

/** Arms Deal: whether the current card pick may be taken as an atomic instead. */
export function canArmsDeal(state: GameState): boolean {
  const head = state.pending[0];
  return head?.kind === 'takeCard' && (head.claim ?? 0) > 0 && anySkill(state, head.player, (r) => r.atomicForClaim);
}

/** Whether the player can gain research at all. */
export function canGainResearch(state: GameState, player: PlayerId): boolean {
  return !anySkill(state, player, (r) => r.noResearch);
}
