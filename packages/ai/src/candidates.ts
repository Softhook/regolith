import {
  cellOf,
  die,
  distance,
  homePlanet,
  legalActions,
  orbitals,
  same,
  type Action,
  type Cell,
  type GameState,
  type PlayerId,
} from '@regolith/engine';

/** Calculating: the scrapyard numbers to take first (see candidates). */
const CALCULATING_ORDER = [4, 3, 5, 2, 6, 1];

/**
 * How much Kinetic Shunt pushing a barrier helps `me`: freeing a space of their own home's perimeter, or
 * putting the barrier on an enemy home's, is good; taking one of their own home's spaces is bad.
 */
export function barrierShuntRank(s: GameState, a: Action, me: PlayerId): number {
  if (a.type !== 'shuntBarrier') return 0;
  const home = homePlanet(s, me);
  const onHome = (c: Cell) => !!home && orbitals(s.board, home).some((o) => same(o, c));
  const onEnemyHome = (c: Cell) =>
    s.players.some((p) => {
      const h = p.id !== me && homePlanet(s, p.id);
      return !!h && orbitals(s.board, h).some((o) => same(o, c));
    });
  return (onHome(a.from) ? 3 : 0) - (onHome(a.to) ? 5 : 0) + (onEnemyHome(a.to) ? 2 : 0) - (onEnemyHome(a.from) ? 2 : 0);
}

/**
 * The legal actions an AI considers, ordered for the decisions where the evaluation ties (the first
 * wins a tie). Playing a stored Tactic (Patient) ends the action phase, and the evaluations don't
 * value the actions left, so it is only considered once they are spent.
 */
export function candidates(s: GameState, opts?: { includeCarry?: boolean }): Action[] {
  const all = legalActions(s, opts);
  const head = s.pending[0];
  // Calculating: the evaluation can't tell ship numbers in the scrapyard apart, so ties go to the
  // first. A Frigate (4) can become a 3 or 5 for free, the most flexible; over 200 games each,
  // Calculating won 57% this way against 40% taking 1s (docs/card-benchmark.md).
  if (head?.kind === 'clever' && head.source === 'calculating') {
    const rank = (a: Action) => (a.type === 'clever' ? CALCULATING_ORDER.indexOf(a.value) : 99);
    all.sort((a, b) => rank(a) - rank(b));
  }
  // Kinetic Shunt: enemy mechs first, pushed furthest first.
  if (head?.kind === 'kineticShunt') {
    const rank = (a: Action) =>
      a.type === 'kineticShunt'
        ? (die(s, a.die).owner !== head.player ? 100 : 0) + distance(cellOf(die(s, a.die))!, a.to)
        : barrierShuntRank(s, a, head.player) - 50;
    all.sort((a, b) => rank(b) - rank(a));
  }
  const options = nearestAttacks(all);
  return s.turn.actionsLeft > 0 ? options.filter((a) => a.type !== 'playStoredTactic') : options;
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
