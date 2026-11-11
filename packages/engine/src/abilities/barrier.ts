/**
 * Barrier: fire a barrier in a straight line, onto any clear space along it. Free, once a turn, besides
 * the mech's move. A barrier stays put (only Kinetic Shunt moves it) and blocks every move, drop and shot (GameState.barriers);
 * on an objective's perimeter space it holds that space, as a mech would, but never counts towards a claim.
 */
import { straightLines } from '../board';
import { addBarrier, logTo, markAbility, name, mechName } from '../core';
import { cellOf, isEmptySpace } from '../lookups';
import { canHoldBarrier, canUseAbility } from '../queries';
import { type MechAbility } from '../mechs';
import { type Cell, type Die, type GameState } from '../types';

/** The spaces a barrier can land on from where the mech stands. */
export function barrierTargets(s: GameState, d: Die): Cell[] {
  const start = cellOf(d);
  if (!start) return [];
  const out: Cell[] = [];
  // Like a shot: every empty space up to the first thing in its way (a mech, an objective, a barrier or the
  // board's edge; it flies over the Alien Artefacts and Ice Tunnels, but doesn't land on a tunnel, as Barricade's don't).
  for (const line of straightLines(s.board, start)) {
    for (const at of line) {
      if (!isEmptySpace(s, at)) break;
      if (canHoldBarrier(s, at) && !out.some((p) => p.r === at.r && p.c === at.c)) out.push(at);
    }
  }
  return out;
}

export const barrier: MechAbility = {
  ability: {
    name: 'Barrier',
    text: 'Once a turn, besides its move and for no action, fire a barrier onto any empty space in a straight line out of a side of its space (not diagonally), as far as the line is clear (objectives, the edge of the board, mechs and barriers block it; Alien Artefacts and Ice Tunnels do not, but it can’t land on an Ice Tunnel). A barrier stays for good: no mech moves, drops or shoots through its space. It may hold a perimeter space.',
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
        logTo(s, d.owner, `${name(s, d.owner)}'s ${mechName(s, d)} fires a barrier`, to!);
      },
    },
  },
};
