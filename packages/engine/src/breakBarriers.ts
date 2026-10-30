/**
 * Breaking barriers, a rule on trial (RuleSet.breakBarriers, off in every mode; scripts/stall-probe.ts and
 * power-ab.ts switch it on): a mech destroys a barrier next to it as its one action of the turn, the way it
 * attacks. No roll, nothing to defend it; any barrier, the player's own and the map's too.
 *
 * - `smash`: only a barrier next to where the mech stands; it doesn't move.
 * - `attack`: like an attack, from any space the mech could move to (the nearest), and a Sniper shoots the
 *   first barrier in a straight line. The mech ends on the space it broke it from.
 */
import { adjacent, same, straightLines } from './board';
import { fail, logTo, markMoved, name, ownShip, requireActionPhase, shipName, spend, type Handlers } from './core';
import { barrierAt, boardLoc, cellOf, isEmptySpace } from './lookups';
import { shoot } from './powers/shoot';
import { canMoveDie, moveOptions } from './queries';
import { hooksOf, rulesOf } from './rules';
import type { Cell, Die, GameState } from './types';

/** A barrier a mech can break (`cell`), and the space it breaks it from. */
export interface BarrierBreak {
  cell: Cell;
  from: Cell;
}

/** The barriers `d` can break this turn, each once, from the nearest space. */
export function barrierBreaks(s: GameState, d: Die): BarrierBreak[] {
  const rule = rulesOf(s).breakBarriers;
  const start = cellOf(d);
  if (!rule || !start || !s.barriers?.length || !canMoveDie(s, d) || s.turn.actionsLeft < 1) return [];
  const out: BarrierBreak[] = [];
  const add = (cell: Cell, from: Cell) => {
    if (!out.some((x) => same(x.cell, cell))) out.push({ cell, from });
  };
  const nextTo = (from: Cell) => {
    for (const p of adjacent(s.board, from)) if (barrierAt(s, p)) add(p, from);
  };
  nextTo(start);
  if (rule === 'smash') return out;
  // Nearest first: a Sniper's shot from where it stands, then the spaces it could move to.
  if (hooksOf(s, d)?.action === shoot.hooks.action) {
    for (const line of straightLines(s.board, start)) {
      for (const at of line) {
        if (barrierAt(s, at)) add(at, start);
        if (!isEmptySpace(s, at)) break;
      }
    }
  }
  for (const m of [...moveOptions(s, d.id).moves.values()].sort((a, b) => a.steps - b.steps)) nextTo(m.cell);
  return out;
}

export const barrierBreakHandlers = {
  breakBarrier(s, a) {
    requireActionPhase(s);
    const d = ownShip(s, a.die, 'board');
    const opt = barrierBreaks(s, d).find((x) => same(x.cell, a.cell));
    if (!opt) fail('No barrier this mech can break there');
    spend(s, 1);
    markMoved(s, d);
    d.loc = boardLoc(opt.from);
    // A new list, never the old one changed: queries cache by it (core.ts addBarrier).
    s.barriers = s.barriers!.filter((b) => !same(b, a.cell));
    logTo(s, d.owner, `${name(s, d.owner)}'s ${shipName(s, d)} breaks a barrier`, a.cell);
  },
} satisfies Partial<Handlers>;
