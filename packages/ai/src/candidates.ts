import {
  cellOf,
  die,
  distance,
  homeObjective,
  legalActions,
  perimeterSpaces,
  same,
  type Action,
  type Cell,
  type GameState,
  type PlayerId,
} from '@regolith/engine';

/** Remodel: the salvage yard numbers to take first (see candidates). */
const REMODEL_ORDER = [4, 3, 5, 2, 6, 1];

/**
 * How much Kinetic Shunt pushing a barrier helps `me`: freeing a space of their own home's perimeter, or
 * putting the barrier on an enemy home's, is good; taking one of their own home's spaces is bad.
 */
export function barrierShuntRank(s: GameState, a: Action, me: PlayerId): number {
  if (a.type !== 'kineticShuntBarrier') return 0;
  const home = homeObjective(s, me);
  const onHome = (c: Cell) => !!home && perimeterSpaces(s.board, home).some((o) => same(o, c));
  const onEnemyHome = (c: Cell) =>
    s.players.some((p) => {
      const h = p.id !== me && homeObjective(s, p.id);
      return !!h && perimeterSpaces(s.board, h).some((o) => same(o, c));
    });
  return (onHome(a.from) ? 3 : 0) - (onHome(a.to) ? 5 : 0) + (onEnemyHome(a.to) ? 2 : 0) - (onEnemyHome(a.from) ? 2 : 0);
}

/**
 * The legal actions an AI considers, ordered for the decisions where the evaluation ties (the first
 * wins a tie). Playing a stored Tactic (Strategic Plan) ends the action phase, and the evaluations don't
 * value the actions left, so it is only considered once they are spent.
 */
export function candidates(s: GameState, opts?: { includeCarry?: boolean }): Action[] {
  const all = legalActions(s, opts);
  const head = s.pending[0];
  // Remodel: the evaluation can't tell mech numbers in the salvage yard apart, so ties go to the
  // first. A Chameleon (4) can become a 3 or 5 for free, the most flexible; over 200 games each,
  // Remodel won 57% this way against 40% taking 1s (docs/card-benchmark.md).
  if (head?.kind === 'engineering' && head.source === 'remodel') {
    const rank = (a: Action) => (a.type === 'engineering' ? REMODEL_ORDER.indexOf(a.value) : 99);
    all.sort((a, b) => rank(a) - rank(b));
  }
  // Kinetic Shunt: enemy mechs first, pushed furthest first.
  if (head?.kind === 'kineticShunt') {
    const rank = (a: Action) =>
      a.type === 'kineticShunt'
        ? (die(s, a.die).owner !== head.player ? 100 : 0) + distance(cellOf(die(s, a.die))!, a.to)
        : barrierShuntRank(s, a, head.player) - 50;
    const ranked = new Map(all.map((a) => [a, rank(a)]));
    all.sort((a, b) => ranked.get(b)! - ranked.get(a)!);
  }
  const options = nearestAttacks(all).filter((a) => !idleCarry(s, a));
  return s.turn.actionsLeft > 0 ? options.filter((a) => a.type !== 'strategicPlanPlay') : options;
}

/**
 * A Behemoth carry that flies out and back and sets its passenger down where it was: it changes nothing but
 * the spent ability, so the search would only waste its budget on it (and a tie could pick it over ending the turn).
 */
function idleCarry(s: GameState, a: Action): boolean {
  if (a.type !== 'carry') return false;
  const from = cellOf(die(s, a.die));
  const at = cellOf(die(s, a.passenger));
  return !!from && !!at && same(from, a.to) && same(at, a.setDown);
}

/**
 * One Move attack per target, from the nearest space (the first offered). The other spaces would
 * each be scored as a separate action: noisy samples favour whichever got lucky, and the search
 * spends its budget on near-copies.
 */
function nearestAttacks(all: Action[]): Action[] {
  const seen = new Set<string>();
  return all.filter((a) => {
    if (a.type !== 'attack') return true;
    const k = `${a.die}>${a.target}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
