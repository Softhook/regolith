import { cellOf, die, distance, legalActions, type Action, type GameState } from '@regolith/engine';

/** Calculating: the scrapyard numbers to take first (see candidates). */
const CALCULATING_ORDER = [4, 3, 5, 2, 6, 1];

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
      a.type === 'kineticShunt' ? (die(s, a.die).owner !== head.player ? 100 : 0) + distance(cellOf(die(s, a.die))!, a.to, s.board) : 0;
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
