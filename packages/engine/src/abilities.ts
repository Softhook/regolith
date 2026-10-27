/**
 * Ship abilities (rulebook p.8): once per die per turn, on your own turn, ships on the map only.
 * They cost no action, except that Transport (2) and Manoeuvre (5) happen during a move.
 * Manoeuvre is part of the move handler (actions.ts); the other five are here, with the action of a
 * prototype power (ShipHooks.action).
 */
import { key, same } from './board';
import { startCombat } from './combat';
import {
  fail,
  note,
  logTo,
  markAbility,
  markMoved,
  markSeen,
  name,
  ownShip,
  requireActionPhase,
  rerollNew,
  aShip,
  shipName,
  spendPeaceful,
  type Handlers,
} from './core';
import type { ShipPower } from './data';
import { boardLoc, cellOf, die } from './lookups';
import { canMoveDie, carryOptions, carryPassengers, freeAttackTargets } from './queries';
import { hasPower, hooksOf, rulesOf, shipOf } from './rules';
import type { Cell, Die, GameState } from './types';

function useAbility(s: GameState, d: Die, power: ShipPower) {
  if (d.loc.zone !== 'board') fail('Only ships on the map can use abilities');
  if (!hasPower(s, d, power)) {
    const ship = Object.values(rulesOf(s).ships).find((x) => x.power === power);
    fail(ship ? `Only a ${ship.name} can do that` : 'No ship has that ability in this mode');
  }
  markAbility(s, d);
}

/**
 * Flagship Transport: picks up `passenger` from a surrounding space, flies to `to` (within `range`,
 * default the flagship's movement) and drops it at `drop`, next to the flagship. Validates first;
 * the caller pays for it.
 */
export function transport(s: GameState, flagship: Die, passenger: string, to: Cell, drop: Cell, range?: number) {
  if (!carryPassengers(s, flagship.id).some((x) => x.id === passenger)) fail('Passenger must be next to the flagship');
  const dest = carryOptions(s, flagship.id, passenger, range).get(key(to));
  if (!dest || !dest.drops.some((p) => same(p, drop))) fail('Invalid carry');
  if (same(to, drop)) fail('Drop the passenger next to the flagship');
  return () => {
    flagship.loc = boardLoc(to);
    die(s, passenger).loc = boardLoc(drop);
  };
}

export const abilityHandlers = {
  /** 1 Battlestation — Strike: a free 1-space move/attack that must attack; doesn't use its move. */
  freeAttack(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    if (!freeAttackTargets(s, d.id).some((x) => x.id === a.target)) fail('Target must be adjacent');
    useAbility(s, d, 'strike');
    startCombat(s, d, die(s, a.target), cellOf(d)!);
  },
  /** 2 Flagship — Transport: pick up a ship from a surrounding space, move, drop it in a surrounding space. */
  carry(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    if (!canMoveDie(s, d)) fail('This ship already moved this turn');
    const fly = transport(s, d, a.passenger, a.to, a.drop);
    spendPeaceful(s); // a Transport is a move without an attack, so Curious can pay for it
    useAbility(s, d, 'transport');
    fly();
    markMoved(s, d);
    logTo(s, d.owner, `${name(s, d.owner)}'s ${shipName(s, d)} carries their ${shipName(s, die(s, a.passenger))}`, a.to);
  },
  /** 3 Destroyer — Warp: swap places with another of your ships on the map; not its move. */
  swap(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    const o = ownShip(s, a.other, 'board');
    if (o.id === d.id) fail('Choose another ship');
    useAbility(s, d, 'warp');
    [d.loc, o.loc] = [o.loc, d.loc];
    note(s, `${name(s, d.owner)}'s ${shipName(s, d)} swaps places with their ${shipName(s, o)}.`, d.owner);
  },
  /** 4 Frigate — Modify: become a 3 or a 5 (and so can't use the new ship's ability this turn). */
  change(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    useAbility(s, d, 'modify');
    const was = shipName(s, d);
    d.value = a.value;
    markSeen(s, d);
    note(s, `${name(s, d.owner)} changes their ${was} into ${aShip(s, d)}.`, d.owner);
  },
  /** 6 Scout — Free Reconfigure. */
  freeReconfigure(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    useAbility(s, d, 'freeReconfigure');
    const was = shipName(s, d);
    rerollNew(s, d);
    note(s, `${name(s, d.owner)}'s ${was} reconfigures itself into ${aShip(s, d)}.`, d.owner);
  },
  /** A prototype power's action (ShipHooks.action): legal exactly when its hooks offer it. */
  power(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    const action = hooksOf(s, d)?.action;
    if (!action) fail('This ship has no such power');
    const choice = action.options(s, d).find((c) => c.target === a.target && (c.to && a.to ? same(c.to, a.to) : c.to === a.to));
    if (!choice) fail('This ship can’t do that now');
    const logged = s.logCounter;
    const ship = shipOf(s, d.value);
    action.apply(s, d, choice);
    // Most powers say what they did (an attack, say); one that doesn't is still logged.
    if (s.logCounter === logged) note(s, `${name(s, d.owner)}'s ${ship.name} uses ${ship.ability.name}.`, d.owner);
  },
} satisfies Partial<Handlers>;
