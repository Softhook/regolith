import type { CombatPending, Die, GameState, Pending } from '@regolith/engine';
import { ARC, LANCE, SHOT } from '../beats';
import { cardsUsed } from './steps';
import { reducedMotion } from './useMediaQuery';

/**
 * When a card's blow lands, in ms (beats.ts): Orbital Cannon's lance reaches the mech (.cfx-lance),
 * Unstable Reactor's arc joins the two (.cfx-arc). The mechs it destroys stay until then, and blow up then: seen
 * (staging, Explosions) and heard (sounds).
 */
const STRIKE_MS: Partial<Record<Pending['kind'], number>> = { orbitalCannon: LANCE.delay + LANCE.strike, unstableReactor: ARC.span };

/** The step from `before`'s card blow, in ms; 0 when it isn't one. */
export const strikeOf = (before: GameState) => (before.pending[0] && STRIKE_MS[before.pending[0].kind]) ?? 0;

/**
 * The mechs the step from `before` to `game` destroys, in `before`'s order: from the map to the salvageYard.
 * Invasion and Recycle take the player's own mechs there too — recalled or
 * salvaged rather than blown up (CardEffects draws their cloak or fold). One list, so each
 * mech's boom, blast and wait line up: heard (sounds), seen (Explosions) and kept on the map until then
 * (staging).
 */
export function destroyedOf(before: GameState, game: GameState): Die[] {
  const used = cardsUsed(before, game);
  if (used.has('invasion') || used.has('recycle')) return [];
  return before.dice.filter((d) => d.loc.zone === 'board' && game.dice.find((x) => x.id === d.id)?.loc.zone === 'salvageYard');
}

/**
 * How much longer a battle's stage takes for its shot (Shoot, the Sniper's ability: a missile crosses the map,
 * board/Shots, and the battle opens as it lands): its flight while a ranged battle is as it opened
 * (no atomic fired yet), else 0. Its overlay opens that late (CombatOverlay), so whatever waits on
 * the battle being seen waits that much more: the AI (useAiDriver) and online playback. None under reduced motion,
 * where no missile flies (useStepEffects).
 */
export const shotWait = (c: CombatPending) => (c.ranged && !c.attacker.atomic && !c.defender.atomic && !reducedMotion() ? SHOT.flight : 0);

/** The battle the step from `before` to `game` opened with a shot, if any (after an Unstable Reactor choice too). */
export function shotOf(before: GameState, game: GameState) {
  const head = game.pending[0];
  if (head?.kind !== 'combat' || !head.ranged) return null;
  const was = before.pending[0];
  return was?.kind === 'combat' && was.id === head.id ? null : head;
}
