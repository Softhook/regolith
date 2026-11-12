import { delta, type Board } from '@regolith/engine';
import { SHOT } from '../../beats';
import type { MapEffect } from '../../game/cardEffects';
import { shotOf } from '../../game/strike';
import type { Step } from '../../game/staging';
import { useMapEffects } from '../../game/useTransient';
import { EffectBox } from './EffectBox';

/** The impact's flash outlasts the flight. */
const SHOT_EFFECT_MS = SHOT.flight + SHOT.hit;

/** A shot fired in the step: from the shooter to its target, a straight line. */
function shotsOf({ before, game }: Step): MapEffect[] {
  const shot = shotOf(before, game);
  if (!shot) return [];
  const { from } = shot;
  const d = delta(from, shot.at);
  return [{ id: `shot:${shot.id}`, at: from, to: { r: from.r + d.r, c: from.c + d.c }, color: game.players[shot.attacker.player].color }];
}

/**
 * A shot on the map, instead of the attacker lunging at its target: a muzzle flash, a round and its
 * trail along the line, and an impact as it lands. Over the mechs; remounted for a jump to another position (`key`).
 */
export function Shots({ step, board, cell }: { step: Step | null; board: Board; cell: number }) {
  return useMapEffects(step, SHOT_EFFECT_MS, shotsOf).map((e) => (
    <EffectBox board={board} key={e.id} e={e} cell={cell} className="cfx cfx-shot">
      <span className="shot-flash" />
      <span className="shot-path">
        <i className="shot-trail" />
        <i className="shot-round" />
        <i className="shot-hit" />
      </span>
    </EffectBox>
  ));
}
