/**
 * Picket: an enemy mech that moves into a space next to this one must stop there. Next to is a side away
 * (adjacent): any of a hex's 6 sides.
 */
import { grid } from '../board';
import { type MechAbility } from '../mechs';

export const picket: MechAbility = {
  ability: {
    name: 'Picket',
    text: 'An enemy mech that moves into a space next to this mech (not diagonally) must stop there. It may still attack from there.',
  },
  hooks: {
    // Not diagonally, as most mechs can't attack diagonally from where they stop; Ice Tunnels don't count.
    stopsEnemies: (state, _mech, index) => grid(state.board).ortho[index],
  },
};
