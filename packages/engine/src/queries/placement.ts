/** Where mechs come onto the map: the starting spaces at setup, and drops. */
import { key, linked, perimeterSpaces, same, spaces } from '../board';
import { dieAt, isEmptySpace } from '../lookups';
import { hooksOf, modeHasHook } from '../rules';
import { anySkill } from '../skillRules';
import type { Cell, GameState, PlayerId } from '../types';
import { homeObjective, perimeterBlockers } from './claim';

/** Empty perimeter positions of a starting objective. */
export function startSlots(state: GameState, objectiveId: number): Cell[] {
  return perimeterSpaces(state.board, state.board.objectives[objectiveId]).filter((p) => isEmptySpace(state, p));
}

export function dropTargets(state: GameState, player: PlayerId): Cell[] {
  const targets = new Map<string, Cell>();
  for (const objective of state.board.objectives) {
    if (!objective.cubes.includes(player)) continue;
    for (const p of perimeterSpaces(state.board, objective)) {
      if (isEmptySpace(state, p)) targets.set(key(p), p);
    }
  }
  if (modeHasHook(state, 'dropTargets')) {
    for (const d of state.dice) {
      const extra = d.owner === player && d.loc.zone === 'board' ? hooksOf(state, d)?.dropTargets : undefined;
      if (extra) for (const p of extra(state, d)) if (isEmptySpace(state, p)) targets.set(key(p), p);
    }
  }
  if (anySkill(state, player, (r) => r.dropIsolated)) {
    for (const p of spaces(state.board)) {
      if (isEmptySpace(state, p) && !linked(state, p).some((q) => dieAt(state, q))) targets.set(key(p), p);
    }
  }
  // Contested drop (PROTOTYPING.md §6.8): every way of dropping (Reinforcements and Infiltration too) stays out of
  // a contested perimeter, except a home objective's, so nobody is shut out.
  const home = homeObjective(state, player);
  for (const objective of state.board.objectives) {
    if (objective !== home && perimeterBlockers(state, player, objective).length)
      for (const p of perimeterSpaces(state.board, objective))
        if (!(home && perimeterSpaces(state.board, home).some((h) => same(h, p)))) targets.delete(key(p));
  }
  return [...targets.values()];
}
