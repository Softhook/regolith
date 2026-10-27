import { delta, type GameState } from '@regolith/engine';
import { SHOT } from '../../beats';
import { shotOf } from '../../game/strike';
import { useStepEffects } from '../../game/useTransient';
import { EffectBox, type MapEffect } from './EffectBox';

/** The impact's flash outlasts the flight. */
const SHOT_EFFECT_MS = SHOT.flight + SHOT.hit;

/** A shot fired in the step from `before` to `game`: from the shooter to its target, the short way round on a wrapping map. */
function shotsOf(before: GameState, game: GameState): MapEffect[] {
  const shot = shotOf(before, game);
  if (!shot) return [];
  const { from } = shot;
  const d = delta(from, shot.at, game.board);
  return [{ id: `shot:${shot.id}`, at: from, to: { r: from.r + d.r, c: from.c + d.c }, color: game.players[shot.attacker.player].color }];
}

/**
 * A shot on the map, instead of the attacker lunging at its target: a muzzle flash, a missile and its
 * trail along the line, and an impact as it lands. Over the ships; remounted for a jump to another position (`key`).
 */
export function Shots({ game, cell }: { game: GameState; cell: number }) {
  return useStepEffects(game, SHOT_EFFECT_MS, shotsOf).map((e) => (
    <EffectBox board={game.board} key={e.id} e={e} cell={cell} className="cfx cfx-shot">
      <span className="shot-flash" />
      <span className="shot-path">
        <i className="shot-trail" />
        <i className="shot-missile" />
        <i className="shot-hit" />
      </span>
    </EffectBox>
  ));
}
