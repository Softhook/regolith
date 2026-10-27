import { combatOutcome, copyState, die, rulesOf, tryApply, type Action, type CombatPending, type GameState } from '@regolith/engine';

/**
 * The possible results of an action, with their probabilities.
 *
 * Re-rolls and combat are enumerated exactly. Level 1 sampled them a few times and then took
 * the best-looking action, which favours whichever random action got lucky in the samples:
 * the reason it reconfigured so often. Other random effects (cards drawn, tactic dice) are
 * sampled, with the same seeds for every candidate so that they are compared fairly.
 */

export interface Outcome {
  state: GameState;
  p: number;
}

/** Actions with a random result that is not enumerated exactly. */
const SAMPLED = new Set<Action['type']>(['takeCard', 'peekChoice', 'patientTactic', 'resourceful', 'unveilReroll']);

/** Outcomes of `a` in `s`, or null if it is illegal. `seeds` are used for sampled actions. */
export function outcomes(s: GameState, a: Action, seeds: number[]): Outcome[] | null {
  if (SAMPLED.has(a.type)) {
    const out: Outcome[] = [];
    for (const rng of seeds) {
      const next = tryApply({ ...s, rng }, a);
      if (!next) return null;
      out.push({ state: next, p: 1 / seeds.length });
    }
    return out;
  }
  const next = tryApply(s, a);
  if (!next) return null;
  // Under Clever the rolled number is replaced by the player's choice, so the roll doesn't branch.
  if ((a.type === 'reconfigure' || a.type === 'freeReconfigure') && next.pending[0]?.kind !== 'clever') return rerolls(s, next, a.die);
  if (next.pending[0]?.kind === 'combat' && s.pending[0]?.kind !== 'combat') return battles(next, next.pending[0]);
  return [{ state: next, p: 1 }];
}

/** Every value the re-rolled die can show, equally likely. */
function rerolls(prev: GameState, next: GameState, dieId: string): Outcome[] {
  const old = die(prev, dieId).value;
  const unseen = rulesOf(prev).reconfigure === 'unseen';
  const seen = unseen ? (prev.turn.seen[dieId] ?? [old]) : [old];
  const values = [1, 2, 3, 4, 5, 6].filter((v) => !seen.includes(v));
  return values.map((v) => {
    const state = copyState(next);
    die(state, dieId).value = v;
    if (unseen) state.turn.seen[dieId] = [...seen, v];
    return { state, p: 1 / values.length };
  });
}

type Result = 'win' | 'stubborn' | 'repel';

/** The combat dice are rolled when an attack starts: one outcome per possible result. */
function battles(state: GameState, combat: CombatPending): Outcome[] {
  const na = combat.attacker.dice.length;
  const nd = combat.defender.dice.length;
  const total = 6 ** (na + nd);
  const tally = new Map<Result, { count: number; dice: number[] }>();
  for (let i = 0; i < total; i++) {
    const dice: number[] = [];
    for (let k = 0, x = i; k < na + nd; k++, x = Math.floor(x / 6)) dice.push((x % 6) + 1);
    const out = combatOutcome(state, withDice(combat, dice));
    const r: Result = out.attackerWins ? 'win' : out.stubborn ? 'stubborn' : 'repel';
    const t = tally.get(r);
    if (t) t.count++;
    else tally.set(r, { count: 1, dice });
  }
  return [...tally.values()].map(({ count, dice }) => {
    const next = copyState(state);
    next.pending[0] = withDice(next.pending[0] as CombatPending, dice);
    return { state: next, p: count / total };
  });
}

function withDice(c: CombatPending, dice: number[]): CombatPending {
  const na = c.attacker.dice.length;
  return {
    ...c,
    attacker: { ...c.attacker, dice: dice.slice(0, na) },
    defender: { ...c.defender, dice: dice.slice(na) },
  };
}
