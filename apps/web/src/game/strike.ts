import type { CombatPending, Die, GameState } from '@regolith/engine';
import { ARC, LANCE, SHOT } from '../beats';
import { lastLogId } from './useTransient';

/**
 * When a card's blow lands, in ms (beats.ts): Show of Force's lance reaches the ship (.cfx-lance),
 * Dangerous's arc joins the two (.cfx-arc). The ships it destroys stay until then, and blow up then: seen
 * (staging, Explosions) and heard (sounds).
 */
const STRIKE_MS: Partial<Record<string, number>> = { showOfForce: LANCE.delay + LANCE.strike, dangerous: ARC.span };

/** The step from `before`'s card blow, in ms; 0 when it isn't one. */
export const strikeOf = (before: GameState) => STRIKE_MS[before.pending[0]?.kind ?? ''] ?? 0;

/**
 * The ships the step from `before` to `game` destroys, in `before`'s order: from the map to the scrapyard.
 * Unveil the Fleet, Reorganization and Resourceful take the player's own ships there too — recalled or
 * scrapped rather than blown up (CardEffects draws their cloak or fold). One list for all three, so each
 * ship's boom, blast and wait line up: heard (sounds), seen (Explosions) and kept on the map until then
 * (staging).
 */
export function destroyedOf(before: GameState, game: GameState): Die[] {
  const head = before.pending[0];
  if (head?.kind === 'unveil' && head.reorganize) return [];
  const last = lastLogId(before);
  if (game.log.some((e) => e.id > last && (e.card === 'unveil-the-fleet' || e.card === 'resourceful'))) return [];
  return before.dice.filter((d) => d.loc.zone === 'board' && game.dice.find((x) => x.id === d.id)?.loc.zone === 'scrapyard');
}

/**
 * How much longer a battle's stage takes for its shot (Shoot, a prototype power: a missile crosses the map,
 * board/Shots, and the battle opens as it lands): its flight while a ranged battle is as it opened
 * (no re-roll or missile yet), else 0. Its overlay opens that late (CombatOverlay), so whatever waits on
 * the battle being seen waits that much more: the AI (useAiDriver) and online playback.
 */
export const shotWait = (c: CombatPending) =>
  c.ranged && !c.rerolls.length && !c.attacker.missile && !c.defender.missile ? SHOT.flight : 0;

/** The battle the step from `before` to `game` opened with a shot, if any (after a Dangerous choice too). */
export function shotOf(before: GameState, game: GameState) {
  const head = game.pending[0];
  if (head?.kind !== 'combat' || !head.ranged) return null;
  const was = before.pending[0];
  return was?.kind === 'combat' && was.id === head.id ? null : head;
}
