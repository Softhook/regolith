/**
 * Shoot: attack an enemy in a straight line, without moving. Like a move or a normal attack it is the
 * ship's one action of the turn (and costs one action); the shooter never advances.
 */
import { straightLines } from '../board';
import { startCombat } from '../combat';
import { markMoved, spend } from '../core';
import { cellOf, die, dieAt, isEmptySpace } from '../lookups';
import { canMoveDie } from '../queries';
import { type Power } from '../ships';
import { type Die, type GameState } from '../types';

/** Enemy ships in range from where it stands, whatever the cost. */
export function shootTargets(s: GameState, d: Die): Die[] {
  const start = cellOf(d);
  if (!start) return [];
  const out: Die[] = [];
  // A shot flies as far as the first thing in its way (a ship, a planet, a barrier or the board's edge; it
  // flies over the void).
  for (const line of straightLines(s.board, start)) {
    for (const at of line) {
      const target = dieAt(s, at);
      if (target) {
        if (target.owner !== d.owner && !out.includes(target)) out.push(target);
        break;
      }
      if (!isEmptySpace(s, at)) break;
    }
  }
  return out;
}

export const shoot: Power = {
  ability: {
    name: 'Shoot',
    text: 'Instead of moving, attack the first mech in any straight line out of a side of its space (not diagonally), as far as it is clear (objectives, the edge of the board, barriers and mechs, friendly or enemy, block the line; the void does not). It stays where it is. Like a move or an attack, it is the mech’s one action of the turn.',
    hint: 'Shoot: choose an enemy in a clear straight line, not diagonally, at any distance. Your Sniper stays put. It uses the mech’s action for the turn.',
  },
  hooks: {
    threatens: shootTargets,
    action: {
      options(s, d) {
        if (!canMoveDie(s, d) || s.turn.actionsLeft < 1) return [];
        return shootTargets(s, d).map((x) => ({ target: x.id }));
      },
      apply(s, d, { target }) {
        spend(s, 1);
        markMoved(s, d);
        startCombat(s, d, die(s, target!), cellOf(d)!, true);
      },
    },
  },
};
