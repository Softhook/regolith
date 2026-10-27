/**
 * Picket: an enemy ship that moves into a space next to this one must stop there. Next to is a side away
 * (adjacent): up, down, left or right on squares, any of a hex's 6 sides; never diagonally.
 */
import { grid } from '../board';
import { type Power } from '../ships';

export const picket: Power = {
  ability: {
    name: 'Picket',
    text: 'An enemy mech that moves into a space next to this mech (not diagonally) must stop there. It may still attack from there.',
  },
  hooks: {
    // Not diagonally, as most ships can't attack diagonally from where they stop; Warp Gates don't count.
    stopsEnemies: (state, _ship, index) => grid(state.board).ortho[index],
  },
};
