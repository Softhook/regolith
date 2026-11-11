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
  salvageYard,
  type Action,
  type Cell,
  type CombatRole,
  type GameState,
  type PlayerId,
} from '@regolith/engine';
import { sfx } from '../sound';
import { highlightsFor, noHighlights } from './highlights';
import { claimTap, legalFor, NO_LEGAL } from './legal';
import type { Dispatch } from './useGame';

export type Sel =
  | { kind: 'none' }
  | { kind: 'mech'; die: string }
  // A Move attack on `target` that can go in from more than one space, waiting for the player to choose it.
  | { kind: 'attackFrom'; die: string; target: string }
  | { kind: 'salvage'; die: string }
  | { kind: 'swap'; die: string }
  | { kind: 'freeAttack'; die: string }
  /** A mech ability's action (MechHooks.action). */
  | { kind: 'ability'; die: string }
  | { kind: 'advanceSkill'; die: string }
  | { kind: 'kineticShunt'; die: string }
  | { kind: 'kineticShuntBarrier'; from: Cell }
  // An objective that can be claimed in more than one way, waiting for the player to choose how.
  | { kind: 'claim'; objective: number }
  // `advanceSkill`: a 1-space carry using the Advance skill instead of a Move action.
  | { kind: 'carryPassenger'; die: string; advanceSkill?: boolean }
  | { kind: 'carryDest'; die: string; passenger: string; advanceSkill?: boolean }
  | { kind: 'carrySetDown'; die: string; passenger: string; to: Cell; advanceSkill?: boolean };

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
  // Drop a selection that is no longer valid (mech destroyed, already moved…).
  useEffect(() => {
    if (sel.kind === 'none' || sel.kind === 'claim' || sel.kind === 'kineticShuntBarrier') return;
    const d = game.dice.find((x) => x.id === sel.die);
    if (!d || d.loc.zone !== (sel.kind === 'salvage' ? 'salvageYard' : 'board')) setSel(NONE);
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

  /** Sends a mech somewhere; on success, clears the selection. */
  const place = useCallback(
    (a: Action) => {
      if (dispatch(a)) setSel(NONE);
    },
    [dispatch],
  );

  /** A tap on a mech. Returns false when it had nothing to do, so the board can show the mech's info instead. */
  const onDie = useCallback(
    (id: string): false | void => {
      if (!human) return false;
      const tone = highlights.dice.get(id);
      if (head?.kind === 'orbitalCannon' && tone) return void dispatch({ type: 'orbitalCannon', die: id });
      if (head?.kind === 'kineticShunt' && tone)
        return select(sel.kind === 'kineticShunt' && sel.die === id ? NONE : { kind: 'kineticShunt', die: id });
      if (head) return false;
      if (sel.kind === 'swap' && tone === 'swap') return void (dispatch({ type: 'swap', die: sel.die, other: id }) && setSel(NONE));
      if (sel.kind === 'freeAttack' && tone === 'attack') return void dispatch({ type: 'freeAttack', die: sel.die, target: id });
      if (sel.kind === 'ability' && tone === 'attack')
        return void (dispatch({ type: 'ability', die: sel.die, target: id }) && setSel(NONE));
      if (sel.kind === 'advanceSkill' && tone === 'attack') return void dispatch({ type: 'advanceSkill', die: sel.die, target: id });
      if ((sel.kind === 'mech' || sel.kind === 'attackFrom') && (tone === 'attack' || tone === 'target')) {
        // One space to attack from: attack. Several: choose one, or tap the target again for the nearest.
        const options = legal.of('attack', (a) => a.die === sel.die && a.target === id);
        if (options.length === 1 || (sel.kind === 'attackFrom' && sel.target === id)) return void dispatch(options[0]);
        return select({ kind: 'attackFrom', die: sel.die, target: id });
      }
      if (sel.kind === 'attackFrom' && id === sel.die) {
        // The mech covers its own space: a tap on it attacks from where it is, if it may, or goes back.
        const here = cellOf(getDie(game, id))!;
        if (highlights.cells.has(key(here))) return void dispatch({ type: 'attack', die: sel.die, target: sel.target, from: here });
        return select({ kind: 'mech', die: sel.die });
      }
      if (sel.kind === 'carryPassenger' && tone === 'passenger')
        return select({ kind: 'carryDest', die: sel.die, passenger: id, advanceSkill: sel.advanceSkill });
      if (sel.kind === 'carryDest' && id === sel.die) {
        // Out-and-back carry: the carrier ends where it started.
        const here = cellOf(getDie(game, id));
        if (here && highlights.cells.has(key(here)))
          return select({ kind: 'carrySetDown', die: sel.die, passenger: sel.passenger, to: here, advanceSkill: sel.advanceSkill });
      }
      const d = getDie(game, id);
      if (actionPhase && d.owner === game.turn.player) {
        return select(sel.kind === 'mech' && sel.die === id ? NONE : { kind: 'mech', die: id });
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
        return setSel(sel.kind === 'salvage' ? sel : sel.kind === 'attackFrom' ? { kind: 'mech', die: sel.die } : NONE);
      if (head?.kind === 'advance') return void dispatch({ type: 'advance', move: true });
      if (head?.kind === 'iceTunnel') return void dispatch({ type: 'iceTunnel', cell });
      if (head?.kind === 'barricade') return void dispatch({ type: 'barricade', cell });
      // A barrier to push: tapping one picks it, whatever was picked before.
      if (head?.kind === 'kineticShunt' && highlights.cells.get(key(cell))?.tone === 'barrier')
        return select({ kind: 'kineticShuntBarrier', from: cell });
      if (head?.kind === 'kineticShunt' && sel.kind === 'kineticShunt') {
        dispatch({ type: 'kineticShunt', die: sel.die, to: cell });
        return setSel(NONE);
      }
      if (head?.kind === 'kineticShunt' && sel.kind === 'kineticShuntBarrier' && highlights.cells.get(key(cell))?.tone === 'move') {
        dispatch({ type: 'kineticShuntBarrier', from: sel.from, to: cell });
        return setSel(NONE);
      }
      if (head?.kind === 'reinforcements') return void dispatch({ type: 'reinforcements', to: cell });
      if (head?.kind === 'placeMechs') {
        // Place the selected mech, or the next one in the salvage yard.
        const d = sel.kind === 'salvage' ? sel.die : salvageYard(game, head.player)[0]?.id;
        if (d) dispatch({ type: 'placeMech', die: d, to: cell });
        return setSel(NONE);
      }
      if (head?.kind === 'invasion' && sel.kind === 'salvage') {
        dispatch({ type: 'invasionDrop', die: sel.die, to: cell });
        return setSel(NONE);
      }
      switch (sel.kind) {
        case 'mech':
          return place({ type: 'move', die: sel.die, to: cell });
        case 'attackFrom':
          return place({ type: 'attack', die: sel.die, target: sel.target, from: cell });
        case 'salvage':
          return place({ type: 'drop', die: sel.die, to: cell });
        case 'advanceSkill':
          return place({ type: sel.kind, die: sel.die, to: cell });
        case 'ability':
          return place({ type: 'ability', die: sel.die, to: cell });
        case 'carryDest':
          return select({ kind: 'carrySetDown', die: sel.die, passenger: sel.passenger, to: cell, advanceSkill: sel.advanceSkill });
        case 'carrySetDown':
          return place({
            type: sel.advanceSkill ? 'advanceSkill' : 'carry',
            die: sel.die,
            passenger: sel.passenger,
            to: sel.to,
            setDown: cell,
          });
      }
    },
    [human, highlights, head, sel, game, dispatch, select, place],
  );

  /** A tap on an objective. Returns false when it had nothing to do, so the board can show the objective's info instead. */
  const onObjective = useCallback(
    (id: number): false | void => {
      if (!human) return false;
      const hl = highlights.objectives.get(id);
      // A blocked objective (contested perimeter) shows its info, which says why.
      if (!hl || hl.tone === 'blocked') return false;
      if (hl.tone === 'start') dispatch({ type: 'placeStart', objective: id });
      else if (hl.tone === 'infamy') dispatch({ type: 'infamy', objective: id });
      else if (hl.tone === 'claim') {
        const tap = claimTap(legal, id);
        if (tap === 'choose') select({ kind: 'claim', objective: id });
        else if (tap) dispatch(tap);
      }
    },
    [human, highlights, legal, dispatch, select],
  );

  return { sel, select, highlights, legal, attacks, routes, onDie, onCell, onObjective, human, actionPhase, mine };
}

export type Controller = ReturnType<typeof useController>;

/** How an attack on a mech would go: the chance to win, and what changes it beyond mechs and dice. */
export interface AttackPreview {
  chance: number;
  factors: Record<CombatRole, string[]>;
}

/** For each mech the selected mech may attack: how it would go, from the space it would attack from. */
function attackPreviews(game: GameState, sel: Sel, dice: ReadonlyMap<string, string>): Map<string, AttackPreview> {
  const out = new Map<string, AttackPreview>();
  if (
    sel.kind !== 'mech' &&
    sel.kind !== 'attackFrom' &&
    sel.kind !== 'freeAttack' &&
    sel.kind !== 'ability' &&
    sel.kind !== 'advanceSkill'
  )
    return out;
  const attacker = getDie(game, sel.die);
  // A Move attack goes in from a space next to the target (the nearest, until the player chooses);
  // the others attack from where the mech is.
  const moves = sel.kind === 'mech' || sel.kind === 'attackFrom' ? moveOptions(game, sel.die).attacks : null;
  for (const [id, tone] of dice) {
    if (tone !== 'attack' && !(tone === 'target' && sel.kind === 'attackFrom')) continue;
    const defender = getDie(game, id);
    const from = moves?.get(id)?.from ?? cellOf(attacker)!;
    out.set(id, { chance: attackChance(game, attacker, defender, from), factors: attackFactors(game, attacker, defender, from) });
  }
  return out;
}

/** A way a mech can attack along, drawn on the map, while the player chooses where to attack from. */
export interface Route {
  /** The space it attacks from: a tap on it, or on the way, chooses this way. */
  from: Cell;
  /** The spaces it flies over, from its own to `from`. */
  cells: Cell[];
  /** The target's space, which the mech goes halfway into from the last of `cells`. */
  strike: Cell;
  /** The nearest way, taken unless another is chosen. */
  main: boolean;
  /** The chance to win from there, when it differs between the ways (support from neighbouring mechs). */
  odds?: number;
}

/**
 * Choosing where to attack from, the only time the way a mech flies matters: a way to each space
 * worth choosing (attackLaunches, the same spaces as the legal attacks), the nearest as the main one.
 */
function attackRoutes(game: GameState, sel: Sel): Route[] {
  if (sel.kind !== 'attackFrom') return [];
  const attacker = getDie(game, sel.die);
  const defender = getDie(game, sel.target);
  const routes = attackLaunches(game, sel.die, sel.target).map(({ from, at }, i): Route => ({
    from,
    cells: movePath(game, sel.die, from),
    strike: at,
    main: i === 0,
    odds: attackChance(game, attacker, defender, from),
  }));
  if (new Set(routes.map((r) => r.odds)).size < 2) for (const r of routes) delete r.odds;
  return routes;
}
