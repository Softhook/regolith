/** Barriers: the spaces one can go on, and Kinetic Shunt, which pushes a mech or a barrier. */
import { otherTunnel, same, spaces, straightLines } from '../board';
import { cellOf, isEmptySpace, mechsOnBoard } from '../lookups';
import type { Cell, Die, GameState } from '../types';

/** Whether a barrier can go on `p`, by Barricade or a Wisp: an empty space with no Ice Tunnel on it. */
export function canHoldBarrier(state: GameState, p: Cell): boolean {
  return isEmptySpace(state, p) && !state.tunnels.some((g) => same(g, p)) && !state.wormhole?.some((g) => same(g, p));
}

/** The spaces Barricade can place a barrier on. */
export function barrierSpaces(state: GameState): Cell[] {
  return spaces(state.board).filter((p) => canHoldBarrier(state, p));
}

/** How far Kinetic Shunt pushes a mech or a barrier. */
const SHUNT_RANGE = 4;

/** A space Kinetic Shunt can push a mech to, and whether it gets there through an Ice Tunnel. */
export interface ShuntPath {
  to: Cell;
  tunnel: boolean;
}

/**
 * Where Kinetic Shunt can push a mech: the empty spaces up to 4 away in a straight line, stopping before
 * anything in its way (an objective, a mech, a barrier, the Alien Artefacts or the board's edge). A mech pushed onto an
 * Ice Tunnel (Ice Tunnel) may come out of the other one, which counts as a space, and go on in the same line;
 * one already on a tunnel may be pushed through it, then out of the other tunnel along any line.
 */
export function shuntPaths(state: GameState, d: Die): ShuntPath[] {
  const start = cellOf(d);
  if (!start) return [];
  const out: ShuntPath[] = [];
  // A space reached both ways counts as a straight push.
  const add = (to: Cell, tunnel: boolean) => {
    const seen = out.find((p) => same(p.to, to));
    if (!seen) out.push({ to, tunnel });
    else if (!tunnel) seen.tunnel = false;
  };
  /** The empty spaces at the start of `line`, at most `n` of them. */
  const clear = (line: Cell[], n: number) => {
    const blocked = line.slice(0, n).findIndex((p) => !isEmptySpace(state, p));
    return line.slice(0, blocked < 0 ? n : blocked);
  };
  const partner = otherTunnel(state, start);
  if (partner && isEmptySpace(state, partner)) {
    add(partner, true);
    for (const line of straightLines(state.board, partner)) for (const p of clear(line, SHUNT_RANGE - 1)) add(p, true);
  }
  straightLines(state.board, start).forEach((line, side) => {
    clear(line, SHUNT_RANGE).forEach((p, k) => {
      add(p, false);
      // Onto the tunnel at step k + 1, out of the other at k + 2, then on along the same line.
      const exit = otherTunnel(state, p);
      if (!exit || !isEmptySpace(state, exit) || k + 2 > SHUNT_RANGE) return;
      add(exit, true);
      for (const q of clear(straightLines(state.board, exit)[side], SHUNT_RANGE - k - 2)) add(q, true);
    });
  });
  return out;
}

/** The spaces Kinetic Shunt can push a mech to (shuntPaths). */
export function shuntTargets(state: GameState, d: Die): Cell[] {
  return shuntPaths(state, d).map((p) => p.to);
}

/**
 * Where Kinetic Shunt can push a barrier: the spaces up to 4 away in a straight line that can hold one, stopping
 * before anything in its way. A barrier doesn't use the Ice Tunnel and can't stop on a tunnel.
 */
export function barrierShuntTargets(state: GameState, from: Cell): Cell[] {
  return straightLines(state.board, from).flatMap((line) => {
    const blocked = line.slice(0, SHUNT_RANGE).findIndex((p) => !isEmptySpace(state, p));
    return line.slice(0, blocked < 0 ? SHUNT_RANGE : blocked).filter((p) => canHoldBarrier(state, p));
  });
}

/** Whether Kinetic Shunt has anything to push: a mech or a barrier on the map with somewhere to go. */
export function canShunt(state: GameState): boolean {
  return (
    mechsOnBoard(state).some((d) => shuntPaths(state, d).length > 0) ||
    (state.barriers ?? []).some((b) => barrierShuntTargets(state, b).length > 0)
  );
}
