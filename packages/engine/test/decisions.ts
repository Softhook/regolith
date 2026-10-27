/**
 * The cross-check for decisions, shared by consistency.test.ts (AI games) and card-scenarios.test.ts
 * (one scenario per card, which reaches decisions the AI games rarely do): every answer worth trying to
 * the open decision, legal or not, and those the engine accepts although legalActions() doesn't offer them.
 */
import { ALL_CARDS, legalActions, tryApply, type Action, type Cell, type GameState, type Pending } from '../src';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

/** An action as a string that is the same for equal actions, whatever their key order, nested cells included. */
export const keyOf = (a: Action) => JSON.stringify(canonical(a));

export const CARD_IDS = ALL_CARDS.map((c) => c.id);
const ROW_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Every answer worth trying to each kind of decision, legal or not: every player, side, card, planet
 * and cell, not just the ones DECISION_CANDIDATES lists. Typed per kind, so a new decision needs an entry.
 */
const DECISION_BRUTE_FORCE: { [K in Pending['kind']]: (s: GameState) => Action[] } = {
  setupRoll: () => [{ type: 'setupKeep' }, { type: 'setupReroll' }],
  skillDraft: () => CARD_IDS.map((skill) => ({ type: 'draftSkill', skill })),
  placeStart: (s) => s.board.planets.map((p) => ({ type: 'placeStart', planet: p.id })),
  placeShips: (s) => s.dice.flatMap((d) => allCells(s).map((to) => ({ type: 'placeShip', die: d.id, to }) as const)),
  combat: (s) => [
    { type: 'resolveCombat' },
    ...s.players.flatMap((p) => (['attacker', 'defender'] as const).map((side) => ({ type: 'missile', by: p.id, side }) as const)),
  ],
  dangerous: () => [
    { type: 'dangerous', destroy: true },
    { type: 'dangerous', destroy: false },
  ],
  clever: () => [0, 1, 2, 3, 4, 5, 6, 7].map((value) => ({ type: 'clever', value })),
  advance: () => [
    { type: 'advance', move: true },
    { type: 'advance', move: false },
  ],
  infamy: (s) => s.board.planets.map((p) => ({ type: 'infamy', planet: p.id })),
  takeCard: () => [
    { type: 'profiteer' },
    ...(['skill', 'tactic', 'expansion'] as const).flatMap((deck) =>
      ROW_INDEXES.flatMap((index) => [{ type: 'takeCard', deck, index } as const, { type: 'takeCard', deck, index, store: true } as const]),
    ),
  ],
  peek: () => [
    { type: 'peekChoice', takeTop: true },
    { type: 'peekChoice', takeTop: false },
  ],
  discardSkill: () => CARD_IDS.map((skill) => ({ type: 'discardSkill', skill })),
  placeExpansion: (s) => [{ type: 'placeExpansion', to: null }, ...allCells(s).map((to) => ({ type: 'placeExpansion', to }) as const)],
  showOfForce: (s) => s.dice.map((d) => ({ type: 'showOfForce', die: d.id })),
  warpGate: (s) => allCells(s).map((cell) => ({ type: 'warpGate', cell })),
  placeBarrier: (s) => allCells(s).map((cell) => ({ type: 'placeBarrier', cell })),
  kineticShunt: (s) => s.dice.flatMap((d) => allCells(s).map((to) => ({ type: 'kineticShunt', die: d.id, to }) as const)),
  changeOfHeart: () => CARD_IDS.map((skill) => ({ type: 'changeOfHeart', skill })),
  patientTactic: () => [{ type: 'patientTactic' }, ...ROW_INDEXES.map((index) => ({ type: 'patientTactic', index }) as const)],
  prideful: () => [
    { type: 'prideful', take: true },
    { type: 'prideful', take: false },
  ],
  ruthless: () => [{ type: 'ruthless' }, ...CARD_IDS.map((skill) => ({ type: 'ruthless', skill }) as const)],
  unveil: (s) => [
    { type: 'unveilDone' },
    ...s.dice.flatMap((d) => [
      { type: 'unveilReroll', die: d.id } as const,
      ...allCells(s).map((to) => ({ type: 'unveilDeploy', die: d.id, to }) as const),
    ]),
  ],
};

/** Every cell of the board, planets and off-board cells included. */
function allCells(s: GameState): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < s.board.rows; r++) for (let c = 0; c < s.board.cols; c++) out.push({ r, c });
  return out;
}

/** Every answer worth trying to the pending decision, legal or not. */
export function bruteForceDecision(s: GameState): Action[] {
  return DECISION_BRUTE_FORCE[s.pending[0].kind](s);
}

/** Answers to the open decision that apply() accepts but legalActions() doesn't offer (none, if they agree). */
export function unofferedAnswers(s: GameState): string[] {
  const offered = new Set(legalActions(s).map(keyOf));
  return bruteForceDecision(s)
    .filter((a) => !offered.has(keyOf(a)) && tryApply(s, a))
    .map(keyOf);
}
