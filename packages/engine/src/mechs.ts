/**
 * The mechs (docs/regolith/REGOLITH-WORLD.md, *The six mechs*), by die value, and the hooks an ability plugs into
 * (MechHooks). The 1 to 4 have the classic abilities, built into the engine (BuiltInAbility); the 5 strikes at range and
 * the 6 fires barriers, each an ability of its own in abilities/, and every mech has a zone of control (Picket).
 *
 * To try a change: how an ability works or its text, its file in abilities/; an ability on another mech, move it in
 * BASE_MECHS; a new ability, copy a file in abilities/. When an ability needs a new kind of hook, add it to MechHooks and
 * read it where it applies in the engine (docs/regolith/PROTOTYPING.md §9).
 */
import type { MechDef, MechTable } from './data';
import { barrier } from './abilities/barrier';
import { picket } from './abilities/picket';
import { shoot } from './abilities/shoot';
import type { Cell, Die, GameState } from './types';

/** What an ability action (MechHooks.action) is aimed at: a mech, a space, or both. */
export interface AbilityChoice {
  target?: string;
  to?: Cell;
}

/**
 * A mech ability, as hooks the engine reads, like SkillRule for skills: the engine never names the abilities
 * that use them. Every hook is optional, and the engine skips mechs without it.
 */
export interface MechHooks {
  /**
   * Board cell indexes (r * cols + c) where an enemy mech that moves in must stop. It may still attack
   * from there, and one that starts its move on one may leave. Normal moves only.
   */
  stopsEnemies?(state: GameState, mech: Die, index: number): Iterable<number>;
  /** Extra spaces its owner may drop into (the engine keeps only empty ones). */
  dropTargets?(state: GameState, mech: Die): Iterable<Cell>;
  /**
   * The enemy mechs its ability could attack from where it stands, whatever the cost now (as Shoot's
   * targets): the AI reads it to judge what the mech threatens beyond its normal attacks.
   */
  threatens?(state: GameState, mech: Die): Die[];
  /**
   * An action of its own: the `ability` action. `options` are the legal choices now, cost included;
   * `apply` runs only for one of them, and pays for it.
   */
  action?: {
    options(state: GameState, mech: Die): AbilityChoice[];
    apply(state: GameState, mech: Die, choice: AbilityChoice): void;
  };
}

/** A whole ability: its rules text and its hooks, one file each in abilities/. Give it to a mech with `{ name, ...ability }`. */
export interface MechAbility {
  ability: MechDef['ability'];
  hooks: MechHooks;
}

const BASE_MECHS: MechTable = {
  1: {
    name: 'Breacher',
    builtIn: 'strike',
    ability: { name: 'Free Attack', text: 'Attack an adjacent enemy without using this mech’s move.' },
  },
  2: {
    name: 'Behemoth',
    builtIn: 'transport',
    ability: { name: 'Carry & Move', text: 'Carry one of your nearby mechs as part of a move, then drop it next to you.' },
  },
  3: { name: 'Tactician', builtIn: 'warp', ability: { name: 'Swap', text: 'Swap places with any of your other mechs.' } },
  4: { name: 'Chameleon', builtIn: 'modify', ability: { name: 'Change to 3 or 5', text: 'Refit as a Tactician or a Sniper.' } },
  5: { name: 'Sniper', ...shoot },
  6: { name: 'Wisp', ...barrier },
};

/**
 * Zone of control, a rule rather than an ability: every mech pickets the spaces next to it (a hex's 6 sides), so an
 * enemy mech moving in must stop there. Its rules text stays its own ability's.
 */
export const MECHS: MechTable = Object.fromEntries(
  Object.entries(BASE_MECHS).map(([v, mech]: [string, MechDef]) => [v, { ...mech, hooks: { ...mech.hooks, ...picket.hooks } }]),
);
