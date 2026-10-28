/**
 * The mechs (docs/regolith/REGOLITH-WORLD.md, *The six mechs*), by die value, and the hooks a power plugs into
 * (ShipHooks). The 1 to 4 have the classic powers, built into the engine (ShipPower); the 5 strikes at range and
 * the 6 fires barriers, each a power of its own in powers/, and every mech has a zone of control (Picket).
 *
 * To try a change: how a power works or its text, its file in powers/; a power on another mech, move it in
 * MECHS; a new power, copy a file in powers/. When a power needs a new kind of hook, add it to ShipHooks and
 * read it where it applies in the engine (docs/regolith/PROTOTYPING.md §9).
 */
import type { ShipDef, ShipTable } from './data';
import { barrier } from './powers/barrier';
import { picket } from './powers/picket';
import { shoot } from './powers/shoot';
import type { Cell, Die, GameState } from './types';

/** What a power action (ShipHooks.action) is aimed at: a ship, a space, or both. */
export interface PowerChoice {
  target?: string;
  to?: Cell;
}

/**
 * A ship power, as hooks the engine reads, like SkillRule for skills: the engine never names the powers
 * that use them. Every hook is optional, and the engine skips ships without it.
 */
export interface ShipHooks {
  /**
   * Board cell indexes (r * cols + c) where an enemy ship that moves in must stop. It may still attack
   * from there, and one that starts its move on one may leave. Normal moves only.
   */
  stopsEnemies?(state: GameState, ship: Die, index: number): Iterable<number>;
  /** Extra spaces its owner may deploy into (the engine keeps only empty ones). */
  deployTargets?(state: GameState, ship: Die): Iterable<Cell>;
  /**
   * The enemy ships its power could attack from where it stands, whatever the cost now (as Shoot's
   * targets): the AI reads it to judge what the ship threatens beyond its normal attacks.
   */
  threatens?(state: GameState, ship: Die): Die[];
  /**
   * An action of its own: the `power` action. `options` are the legal choices now, cost included;
   * `apply` runs only for one of them, and pays for it.
   */
  action?: {
    options(state: GameState, ship: Die): PowerChoice[];
    apply(state: GameState, ship: Die, choice: PowerChoice): void;
  };
}

/** A whole power: its rules text and its hooks, one file each in powers/. Give it to a ship with `{ name, ...power }`. */
export interface Power {
  ability: ShipDef['ability'];
  hooks: ShipHooks;
}

const MECHS: ShipTable = {
  1: {
    name: 'Breacher',
    power: 'strike',
    ability: { name: 'Free Attack', text: 'Attack an adjacent enemy without using this mech’s move.' },
  },
  2: {
    name: 'Behemoth',
    power: 'transport',
    ability: { name: 'Carry & Move', text: 'Carry one of your nearby mechs as part of a move, then drop it next to you.' },
  },
  3: { name: 'Tactician', power: 'warp', ability: { name: 'Swap', text: 'Swap places with any of your other mechs.' } },
  4: { name: 'Chameleon', power: 'modify', ability: { name: 'Change to 3 or 5', text: 'Refit as a Tactician or a Sniper.' } },
  5: { name: 'Sniper', ...shoot },
  6: { name: 'Wisp', ...barrier },
};

/**
 * Zone of control, a rule rather than a power: every mech pickets the spaces next to it (a hex's 6 sides), so an
 * enemy mech moving in must stop there. Its rules text stays its own power's.
 */
export const SHIPS: ShipTable = Object.fromEntries(
  Object.entries(MECHS).map(([v, ship]: [string, ShipDef]) => [v, { ...ship, hooks: { ...ship.hooks, ...picket.hooks } }]),
);
