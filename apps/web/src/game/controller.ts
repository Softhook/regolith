import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  actor,
  attackChance,
  attackLaunches,
  attackFactors,
  cellOf,
  die as getDie,
  key,
  moveOptions,
  movePath,
  scrapyard,
  type Action,
  type Cell,
  type CombatRole,
  type GameState,
  type PlayerId,
} from '@regolith/engine';
import { sfx } from '../sound';
import { highlightsFor, noHighlights } from './highlights';
import { conquerTap, legalFor, NO_LEGAL } from './legal';
import type { Dispatch } from './useGame';

export type Sel =
  | { kind: 'none' }
  | { kind: 'ship'; die: string }
  // A Move attack on `target` that can go in from more than one space, waiting for the player to choose it.
  | { kind: 'attackFrom'; die: string; target: string }
  | { kind: 'scrap'; die: string }
  | { kind: 'swap'; die: string }
  | { kind: 'freeAttack'; die: string }
  /** A ship power's action (ShipHooks.action). */
  | { kind: 'power'; die: string }
  | { kind: 'tactical'; die: string }
  | { kind: 'kineticShunt'; die: string }
  // A planet that can be conquered in more than one way, waiting for the player to choose how.
  | { kind: 'conquer'; planet: number }
  // `tactical`: a 1-space transport using the Tactical skill instead of a Move action.
  | { kind: 'carryPassenger'; die: string; tactical?: boolean }
  | { kind: 'carryDest'; die: string; passenger: string; tactical?: boolean }
  | { kind: 'carryDrop'; die: string; passenger: string; to: Cell; tactical?: boolean };

const NONE: Sel = { kind: 'none' };

/** `mine`: whether this screen plays for a player (see GameView). */
export function useController(game: GameState, dispatch: Dispatch, mine: (p: PlayerId) => boolean) {
  const [sel, setSel] = useState<Sel>(NONE);
  const head = game.pending[0];
  const who = actor(game);
  const human = game.phase !== 'over' && mine(who);
  const actionPhase = game.phase === 'play' && !head && game.turn.phase === 'actions' && human;

  // Clear selection whenever the turn or the pending decision changes.
  const pendingSig = `${game.turn.number}:${head?.kind ?? ''}:${game.pending.length}`;
  useEffect(() => setSel(NONE), [pendingSig]);
  // Drop a selection that is no longer valid (ship destroyed, already moved…).
  useEffect(() => {
    if (sel.kind === 'none' || sel.kind === 'conquer') return;
    const d = game.dice.find((x) => x.id === sel.die);
    if (!d || d.loc.zone !== (sel.kind === 'scrap' ? 'scrapyard' : 'board')) setSel(NONE);
  }, [game, sel]);

  // Everything the human may do now. Highlights and buttons are derived from it, never from rules.
  const legal = useMemo(() => (human ? legalFor(game) : NO_LEGAL), [game, human]);
  const highlights = useMemo(
    () => (human ? highlightsFor(game, sel, legal, actionPhase) : noHighlights()),
    [game, sel, human, actionPhase, legal],
  );

  const attacks = useMemo(() => attackPreviews(game, sel, highlights.dice), [game, sel, highlights]);
  const routes = useMemo(() => attackRoutes(game, sel), [game, sel]);

  const select = useCallback((s: Sel) => {
    if (s.kind !== 'none') sfx.select();
    setSel(s);
  }, []);

  /** Sends a ship somewhere; on success, clears the selection. */
  const place = useCallback(
    (a: Action) => {
      if (dispatch(a)) setSel(NONE);
    },
    [dispatch],
  );

  /** A tap on a ship. Returns false when it had nothing to do, so the board can show the ship's info instead. */
  const onDie = useCallback(
    (id: string): false | void => {
      if (!human) return false;
      const tone = highlights.dice.get(id);
      if (head?.kind === 'showOfForce' && tone) return void dispatch({ type: 'showOfForce', die: id });
      if (head?.kind === 'kineticShunt' && tone)
        return select(sel.kind === 'kineticShunt' && sel.die === id ? NONE : { kind: 'kineticShunt', die: id });
      if (head) return false;
      if (sel.kind === 'swap' && tone === 'swap') return void (dispatch({ type: 'swap', die: sel.die, other: id }) && setSel(NONE));
      if (sel.kind === 'freeAttack' && tone === 'attack') return void dispatch({ type: 'freeAttack', die: sel.die, target: id });
      if (sel.kind === 'power' && tone === 'attack') return void (dispatch({ type: 'power', die: sel.die, target: id }) && setSel(NONE));
      if (sel.kind === 'tactical' && tone === 'attack') return void dispatch({ type: 'tactical', die: sel.die, target: id });
      if ((sel.kind === 'ship' || sel.kind === 'attackFrom') && (tone === 'attack' || tone === 'target')) {
        // One space to attack from: attack. Several: choose one, or tap the target again for the nearest.
        const options = legal.of('attack', (a) => a.die === sel.die && a.target === id);
        if (options.length === 1 || (sel.kind === 'attackFrom' && sel.target === id)) return void dispatch(options[0]);
        return select({ kind: 'attackFrom', die: sel.die, target: id });
      }
      if (sel.kind === 'attackFrom' && id === sel.die) {
        // The ship covers its own space: a tap on it attacks from where it is, if it may, or goes back.
        const here = cellOf(getDie(game, id))!;
        if (highlights.cells.has(key(here))) return void dispatch({ type: 'attack', die: sel.die, target: sel.target, from: here });
        return select({ kind: 'ship', die: sel.die });
      }
      if (sel.kind === 'carryPassenger' && tone === 'passenger')
        return select({ kind: 'carryDest', die: sel.die, passenger: id, tactical: sel.tactical });
      if (sel.kind === 'carryDest' && id === sel.die) {
        // Out-and-back transport: the flagship ends where it started.
        const here = cellOf(getDie(game, id));
        if (here && highlights.cells.has(key(here)))
          return select({ kind: 'carryDrop', die: sel.die, passenger: sel.passenger, to: here, tactical: sel.tactical });
      }
      const d = getDie(game, id);
      if (actionPhase && d.owner === game.turn.player) {
        return select(sel.kind === 'ship' && sel.die === id ? NONE : { kind: 'ship', die: id });
      }
      setSel(NONE);
      return false;
    },
    [human, highlights, head, sel, game, actionPhase, legal, dispatch, select],
  );

  const onCell = useCallback(
    (cell: Cell) => {
      if (!human) return;
      if (!highlights.cells.has(key(cell)))
        return setSel(sel.kind === 'scrap' ? sel : sel.kind === 'attackFrom' ? { kind: 'ship', die: sel.die } : NONE);
      if (head?.kind === 'advance') return void dispatch({ type: 'advance', move: true });
      if (head?.kind === 'warpGate') return void dispatch({ type: 'warpGate', cell });
      if (head?.kind === 'placeBarrier') return void dispatch({ type: 'placeBarrier', cell });
      if (head?.kind === 'kineticShunt' && sel.kind === 'kineticShunt') {
        dispatch({ type: 'kineticShunt', die: sel.die, to: cell });
        return setSel(NONE);
      }
      if (head?.kind === 'placeExpansion') return void dispatch({ type: 'placeExpansion', to: cell });
      if (head?.kind === 'placeShips') {
        // Place the selected ship, or the next one in the scrapyard.
        const d = sel.kind === 'scrap' ? sel.die : scrapyard(game, head.player)[0]?.id;
        if (d) dispatch({ type: 'placeShip', die: d, to: cell });
        return setSel(NONE);
      }
      if (head?.kind === 'unveil' && sel.kind === 'scrap') {
        dispatch({ type: 'unveilDeploy', die: sel.die, to: cell });
        return setSel(NONE);
      }
      switch (sel.kind) {
        case 'ship':
          return place({ type: 'move', die: sel.die, to: cell });
        case 'attackFrom':
          return place({ type: 'attack', die: sel.die, target: sel.target, from: cell });
        case 'scrap':
          return place({ type: 'deploy', die: sel.die, to: cell });
        case 'tactical':
          return place({ type: sel.kind, die: sel.die, to: cell });
        case 'power':
          return place({ type: 'power', die: sel.die, to: cell });
        case 'carryDest':
          return select({ kind: 'carryDrop', die: sel.die, passenger: sel.passenger, to: cell, tactical: sel.tactical });
        case 'carryDrop':
          return place({ type: sel.tactical ? 'tactical' : 'carry', die: sel.die, passenger: sel.passenger, to: sel.to, drop: cell });
      }
    },
    [human, highlights, head, sel, game, dispatch, select, place],
  );

  /** A tap on a planet. Returns false when it had nothing to do, so the board can show the planet's info instead. */
  const onPlanet = useCallback(
    (id: number): false | void => {
      if (!human) return false;
      const hl = highlights.planets.get(id);
      // A blocked planet (contested orbit) shows its info, which says why.
      if (!hl || hl.tone === 'blocked') return false;
      if (hl.tone === 'start') dispatch({ type: 'placeStart', planet: id });
      else if (hl.tone === 'infamy') dispatch({ type: 'infamy', planet: id });
      else if (hl.tone === 'conquer') {
        const tap = conquerTap(legal, id);
        if (tap === 'choose') select({ kind: 'conquer', planet: id });
        else if (tap) dispatch(tap);
      }
    },
    [human, highlights, legal, dispatch, select],
  );

  return { sel, select, highlights, legal, attacks, routes, onDie, onCell, onPlanet, human, actionPhase, mine };
}

export type Controller = ReturnType<typeof useController>;

/** How an attack on a ship would go: the chance to win, and what changes it beyond ships and dice. */
export interface AttackPreview {
  chance: number;
  factors: Record<CombatRole, string[]>;
}

/** For each ship the selected ship may attack: how it would go, from the space it would attack from. */
function attackPreviews(game: GameState, sel: Sel, dice: ReadonlyMap<string, string>): Map<string, AttackPreview> {
  const out = new Map<string, AttackPreview>();
  if (sel.kind !== 'ship' && sel.kind !== 'attackFrom' && sel.kind !== 'freeAttack' && sel.kind !== 'power' && sel.kind !== 'tactical')
    return out;
  const attacker = getDie(game, sel.die);
  // A Move attack goes in from a space next to the target (the nearest, until the player chooses);
  // the others attack from where the ship is.
  const moves = sel.kind === 'ship' || sel.kind === 'attackFrom' ? moveOptions(game, sel.die).attacks : null;
  for (const [id, tone] of dice) {
    if (tone !== 'attack' && !(tone === 'target' && sel.kind === 'attackFrom')) continue;
    const defender = getDie(game, id);
    const from = moves?.get(id)?.from ?? cellOf(attacker)!;
    out.set(id, { chance: attackChance(game, attacker, defender, from), factors: attackFactors(game, attacker, defender, from) });
  }
  return out;
}

/** A way a ship can attack along, drawn on the map, while the player chooses where to attack from. */
export interface Route {
  /** The space it attacks from: a tap on it, or on the way, chooses this way. */
  from: Cell;
  /** The spaces it flies over, from its own to `from`. */
  cells: Cell[];
  /** The target's space, which the ship goes halfway into from the last of `cells`. */
  strike: Cell;
  /** The nearest way, taken unless another is chosen. */
  main: boolean;
  /** The chance to win from there, when it differs between the ways (support from neighbouring ships). */
  odds?: number;
}

/**
 * Choosing where to attack from, the only time the way a ship flies matters: a way to each space
 * worth choosing (attackLaunches, the same spaces as the legal attacks), the nearest as the main one.
 */
function attackRoutes(game: GameState, sel: Sel): Route[] {
  if (sel.kind !== 'attackFrom') return [];
  const attacker = getDie(game, sel.die);
  const defender = getDie(game, sel.target);
  const routes = attackLaunches(game, sel.die, sel.target).map(({ from, at, diagonal }, i): Route => ({
    from,
    cells: movePath(game, sel.die, from, diagonal),
    strike: at,
    main: i === 0,
    odds: attackChance(game, attacker, defender, from),
  }));
  if (new Set(routes.map((r) => r.odds)).size < 2) for (const r of routes) delete r.odds;
  return routes;
}
