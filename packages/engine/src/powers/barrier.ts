/**
 * Barrier: fire a barrier in a straight line, onto any clear space along it. Free, once a turn, besides
 * the ship's move. A barrier stays for good and blocks every move, deploy and shot (GameState.barriers);
 * on a planet's orbital space it holds that space, as a ship would, but never counts towards a conquest.
 */
import { straightLines } from '../board';
import { addBarrier, logTo, markAbility, name, shipName } from '../core';
import { cellOf, isEmptySpace } from '../lookups';
import { canHoldBarrier, canUseAbility } from '../queries';
import { type Power } from '../ships';
import { type Cell, type Die, type GameState } from '../types';

/** The spaces a barrier can land on from where the ship stands. */
export function barrierTargets(s: GameState, d: Die): Cell[] {
  const start = cellOf(d);
  if (!start) return [];
  const out: Cell[] = [];
  // Like a shot: every empty space up to the first thing in its way (a ship, a planet, a barrier or the
  // board's edge; it flies over the void and warp gates, but doesn't land on a gate, as Barricade's don't).
  for (const line of straightLines(s.board, start)) {
    for (const at of line) {
      if (!isEmptySpace(s, at)) break;
      if (canHoldBarrier(s, at) && !out.some((p) => p.r === at.r && p.c === at.c)) out.push(at);
    }
  }
  return out;
}

export const barrier: Power = {
  ability: {
    name: 'Barrier',
    text: 'Once a turn, besides its move and for no action, fire a barrier onto any empty space in a straight line out of a side of its space (not diagonally), as far as the line is clear (objectives, the edge of the board, mechs and barriers block it; the void and warp gates do not, but it can’t land on a gate). A barrier stays for good: no mech moves, drops or shoots through its space. It may hold a perimeter space.',
    hint: 'Barrier: choose a space in a clear straight line, not diagonally, at any distance. It costs no action, and the mech can still move.',
  },
  hooks: {
    action: {
      options(s, d) {
        if (!canUseAbility(s, d)) return [];
        return barrierTargets(s, d).map((to) => ({ to }));
      },
      apply(s, d, { to }) {
        markAbility(s, d);
        addBarrier(s, to!, d.owner);
        logTo(s, d.owner, `${name(s, d.owner)}'s ${shipName(s, d)} fires a barrier`, to!);
      },
    },
  },
};
