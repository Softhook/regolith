/**
 * Mech abilities (rulebook p.8): once per die per turn, on your own turn, mechs on the map only.
 * They cost no action, except that Transport (2) and Manoeuvre (5) happen during a move.
 * Manoeuvre is part of the move handler (actions.ts); the other five are here, with the action of a
 * ability with hooks (MechHooks.action).
 */
import { key, same } from '../board';
import { startCombat } from '../combat';
import {
  fail,
  note,
  logTo,
  markAbility,
  markMoved,
  markSeen,
  name,
  ownMech,
  requireActionPhase,
  aMech,
  mechName,
  spendPeaceful,
  type Handlers,
} from '../core';
import type { BuiltInAbility } from '../data';
import { boardLoc, cellOf, die } from '../lookups';
import { canMoveDie, carryOptions, carryPassengers, freeAttackTargets } from '../queries';
import { hasAbility, hooksOf, rulesOf, mechOf } from '../rules';
import type { Cell, Die, GameState } from '../types';

function useAbility(s: GameState, d: Die, ability: BuiltInAbility) {
  if (d.loc.zone !== 'board') fail('Only mechs on the map can use abilities');
  if (!hasAbility(s, d, ability)) {
    const mech = Object.values(rulesOf(s).mechs).find((x) => x.builtIn === ability);
    fail(mech ? `Only a ${mech.name} can do that` : 'No mech has that ability in this mode');
  }
  markAbility(s, d);
}

/**
 * The Behemoth's Carry & Move: picks up `passenger` from a surrounding space, flies to `to` (within `range`,
 * default the carrier's movement) and sets it down at `setDown`, next to the carrier. Validates first;
 * the caller pays for it.
 */
export function transport(s: GameState, carrier: Die, passenger: string, to: Cell, setDown: Cell, range?: number) {
  if (!carryPassengers(s, carrier.id).some((x) => x.id === passenger)) fail(`The carried mech must be next to the ${mechName(s, carrier)}`);
  const dest = carryOptions(s, carrier.id, passenger, range).get(key(to));
  if (!dest || !dest.setDowns.some((p) => same(p, setDown))) fail('Invalid carry');
  if (same(to, setDown)) fail(`Set the carried mech down next to the ${mechName(s, carrier)}`);
  return () => {
    carrier.loc = boardLoc(to);
    die(s, passenger).loc = boardLoc(setDown);
  };
}

export const abilityHandlers = {
  /** 1 Breacher — Free Attack: a free 1-space move/attack that must attack; doesn't use its move. */
  freeAttack(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die, 'board');
    if (!freeAttackTargets(s, d.id).some((x) => x.id === a.target)) fail('Target must be adjacent');
    useAbility(s, d, 'strike');
    startCombat(s, d, die(s, a.target), cellOf(d)!);
  },
  /** 2 Behemoth — Carry & Move: pick up a mech from a surrounding space, move, set it down in a surrounding space. */
  carry(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die, 'board');
    if (!canMoveDie(s, d)) fail('This mech already moved this turn');
    const fly = transport(s, d, a.passenger, a.to, a.setDown);
    spendPeaceful(s); // a Transport is a move without an attack, so Curious can pay for it
    useAbility(s, d, 'transport');
    fly();
    markMoved(s, d);
    logTo(s, d.owner, `${name(s, d.owner)}'s ${mechName(s, d)} carries their ${mechName(s, die(s, a.passenger))}`, a.to);
  },
  /** 3 Tactician — Swap: swap places with another of your mechs on the map; not its move. */
  swap(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die, 'board');
    const o = ownMech(s, a.other, 'board');
    if (o.id === d.id) fail('Choose another mech');
    useAbility(s, d, 'warp');
    [d.loc, o.loc] = [o.loc, d.loc];
    note(s, `${name(s, d.owner)}'s ${mechName(s, d)} swaps places with their ${mechName(s, o)}.`, d.owner);
  },
  /** 4 Chameleon — Change to 3 or 5: become a 3 or a 5 (and so can't use the new mech's ability this turn). */
  change(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die, 'board');
    useAbility(s, d, 'modify');
    const was = mechName(s, d);
    d.value = a.value;
    markSeen(s, d);
    note(s, `${name(s, d.owner)} changes their ${was} into ${aMech(s, d)}.`, d.owner);
  },
  /** An ability's action (MechHooks.action): legal exactly when its hooks offer it. */
  ability(s, a) {
    requireActionPhase(s);
    const d = ownMech(s, a.die, 'board');
    const action = hooksOf(s, d)?.action;
    if (!action) fail('This mech has no such ability');
    const choice = action.options(s, d).find((c) => c.target === a.target && (c.to && a.to ? same(c.to, a.to) : c.to === a.to));
    if (!choice) fail('This mech can’t do that now');
    const logged = s.logCounter;
    const mech = mechOf(s, d.value);
    action.apply(s, d, choice);
    // Most abilities say what they did (an attack, say); one that doesn't is still logged.
    if (s.logCounter === logged) note(s, `${name(s, d.owner)}'s ${mech.name} uses ${mech.ability.name}.`, d.owner);
  },
} satisfies Partial<Handlers>;
