/**
 * A scenario per card, driving it through its real trigger (an actual combat, card pick or turn
 * change) and asserting its effect. Cards in real games, at every AI level and on many maps, are
 * checked by the card audit (card-audit.test.ts).
 *
 * Scenarios are registered with `cardCase`, so the coverage check at the end is built when the
 * file is collected and doesn't depend on which tests run, or in what order.
 */
import { describe, expect, it } from 'vitest';
import { chooseAction } from '../../ai/src';
import {
  apply as applyAction,
  checkInvariants,
  combatOutcome,
  conquerCheck,
  deployTargets,
  die,
  effectOf,
  legalActions,
  MODES,
  RULESETS,
  shipsOnBoard,
  skillLimit,
  type Action,
  type CombatPending,
  type GameState,
} from '../src';
import { setSkills, toRow } from './audit';
import { keyOf, unofferedAnswers } from './decisions';
import { arrange, quickStart, seededRandom } from './helpers';

/*
 * Regolith on Alpha Sector (hex), in axial cells (docs/HEX.md): row 7 runs clear from (7,2) to (7,6), and the
 * middle 8 at (6,4) is orbited by (5,4), (5,5), (6,3), (6,5), (7,3) and (7,4). Cards go by their effect (the
 * Community card each started as).
 */
const DECKS = RULESETS.regolith.cards!;

const covered = new Set<string>();

/** Registers a scenario for these cards. */
function cardCase(ids: string[], name: string, fn: () => void) {
  for (const id of ids) covered.add(id);
  it(name, fn);
}

/**
 * apply(), after checking that the engine accepts no answer to an open decision that legalActions()
 * doesn't offer: scenarios reach decisions (Relocation, Change of Heart, Brilliant, Ruthless…) that
 * the AI games of consistency.test.ts rarely do.
 */
function apply(s: GameState, a: Action): GameState {
  if (s.phase !== 'over' && s.pending.length) expect(unofferedAnswers(s), `accepted but not offered at ${s.pending[0].kind}`).toEqual([]);
  return applyAction(s, a);
}

function expectValid(s: GameState, context: string) {
  expect(checkInvariants(s), context).toEqual([]);
}

/** Resolves every open decision with the AI, asserting invariants; returns the decision kinds seen. */
function resolveWithAi(state: GameState, random: () => number): { s: GameState; seen: Set<string> } {
  let s = state;
  const seen = new Set<string>();
  for (let i = 0; s.pending.length; i++) {
    if (i > 50) throw new Error(`decisions did not resolve: ${s.pending.map((p) => p.kind)}`);
    seen.add(s.pending[0].kind);
    const action = chooseAction(s, { random });
    if (!action) throw new Error(`AI has no action for ${s.pending[0].kind}`);
    s = apply(s, action);
    expectValid(s, `after ${keyOf(action)}`);
  }
  return { s, seen };
}

/** The combat now waiting to be resolved. */
function combatOf(s: GameState): CombatPending {
  const head = s.pending[0];
  if (head?.kind !== 'combat') throw new Error(`expected a combat, got ${head?.kind ?? 'nothing'}`);
  return head;
}

/** Player 0 attacks player 1 with fixed dice, both at 3 Dominance; player 0's ship (p0d0) wins or loses. */
function duel(seed: number, skills: { me?: string[]; foe?: string[] }, attackerWins: boolean): GameState {
  let s = arrange(quickStart(2, seed), attackerWins ? { p0d0: [7, 2, 2], p1d0: [7, 3, 6] } : { p0d0: [7, 2, 6], p1d0: [7, 3, 1] });
  s.turn.player = 0;
  s.players[0].skills = (skills.me ?? []).map((id) => ({ id, active: true }));
  s.players[1].skills = (skills.foe ?? []).map((id) => ({ id, active: true }));
  for (const pl of s.players) pl.dominance = 3;
  s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
  const combat = combatOf(s);
  combat.attacker.dice = attackerWins ? [1] : [6];
  combat.defender.dice = attackerWins ? [6] : [1];
  s = apply(s, { type: 'resolveCombat' });
  if (s.pending[0]?.kind === 'advance') s = apply(s, { type: 'advance', move: false });
  return s;
}

/** The current player takes `id` from the tactic row, as if earned in the card phase. */
function takeTactic(s: GameState, id: string, store = false): GameState {
  toRow(s, 'tactic', id);
  s.pending.unshift({ kind: 'takeCard', player: s.turn.player, count: 1 });
  return apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store });
}

describe('tactics and expansion', () => {
  DECKS.tactics.forEach((tactic, i) =>
    cardCase([tactic.id], tactic.name, () => {
      let s = quickStart(2, 200 + i);
      const p = s.turn.player;
      const foe = 1 - p;
      setSkills(s, p, []);
      const before = structuredClone(s);
      const ships = shipsOnBoard(s).length;
      const r = resolveWithAi(takeTactic(s, tactic.id), seededRandom(i * 31 + 5));
      s = r.s;
      switch (effectOf(tactic.id)) {
        case 'aggression':
          expect(s.players[p].dominance).toBe(Math.min(6, before.players[p].dominance + 2));
          break;
        case 'black-market':
          expect(s.players[p].missiles).toBe(before.players[p].missiles + 2);
          break;
        case 'momentum':
          expect(s.players[p].bonusTurns).toEqual([...before.players[p].bonusTurns, 2]);
          break;
        case 'plan-ahead':
          expect(s.players[p].planAhead).toBe(2);
          break;
        case 'sabotage-double':
          expect(s.players[foe].actionPenalty).toBe(before.players[foe].actionPenalty + 2);
          break;
        case 'warp-gate':
          expect(s.gates).toHaveLength(2);
          break;
        case 'change-of-heart':
          expect(r.seen).toContain('changeOfHeart');
          expect(s.players[p].skills).toHaveLength(1);
          break;
        case 'show-of-force':
          expect(r.seen).toContain('showOfForce');
          expect(shipsOnBoard(s).length).toBe(ships - 1);
          break;
        case 'unveil-the-fleet':
          expect(r.seen).toContain('unveil');
          break;
        case 'barrier':
          expect(r.seen).toContain('placeBarrier');
          expect(s.barriers).toHaveLength((before.barriers?.length ?? 0) + 2);
          break;
        case 'kinetic-shunt':
          expect(r.seen).toContain('kineticShunt');
          break;
        default:
          throw new Error(`no scenario for ${tactic.id}`);
      }
    }),
  );

  cardCase([DECKS.expansion!.id], 'Expansion', () => {
    let s = quickStart(2, 199);
    const p = s.turn.player;
    s.market.expansions = 1;
    s.pending.unshift({ kind: 'takeCard', player: p, count: 1 });
    const ships = shipsOnBoard(s, p).length;
    s = resolveWithAi(apply(s, { type: 'takeCard', deck: 'expansion', index: 0 }), seededRandom(3)).s;
    expect(shipsOnBoard(s, p)).toHaveLength(ships + 1);
  });
});

describe('activated skills', () => {
  cardCase(['r-composed'], 'Composed', () => {
    let s = quickStart(2, 601);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-composed', active: true }];
    s.players[p].dominance = 3;
    s.players[p].research = 1;
    s = apply(s, { type: 'composed' });
    expect(s.players[p].dominance).toBe(2);
    expect(s.players[p].research).toBe(4);
  });

  cardCase(['r-ambitious'], 'Ambitious', () => {
    let s = quickStart(2, 603);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-ambitious', active: true }];
    const actions = s.turn.actionsLeft;
    s = apply(s, { type: 'ambitious' });
    expect(s.turn.actionsLeft).toBe(actions + 1);
    expect(s.players[p].ambitionTokens).toBe(1);
  });

  cardCase(['r-flexible'], 'Flexible', () => {
    let s = quickStart(2, 604);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-flexible', active: true }];
    const ship = shipsOnBoard(s, p)[0].id;
    die(s, ship).value = 3;
    s = apply(s, { type: 'flexible', die: ship, delta: 1 });
    expect(die(s, ship).value).toBe(4);
  });

  cardCase(['r-resourceful'], 'Resourceful', () => {
    let s = quickStart(2, 606);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-resourceful', active: true }];
    const ship = shipsOnBoard(s, p)[0].id;
    const actions = s.turn.actionsLeft;
    s = apply(s, { type: 'resourceful', die: ship });
    expect(die(s, ship).loc.zone).toBe('scrapyard');
    expect(s.turn.actionsLeft).toBe(actions + 1);
  });

  cardCase(['r-tactical'], 'Tactical', () => {
    let s = arrange(quickStart(2, 608), { p0d0: [7, 2, 3] });
    s.players[0].skills = [{ id: 'r-tactical', active: true }];
    s.turn.player = 0;
    s = apply(s, { type: 'tactical', die: 'p0d0', to: { r: 7, c: 3 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 3 });
  });

  cardCase(['r-patient'], 'Patient', () => {
    let s = quickStart(2, 611);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-patient', active: true }];
    s = takeTactic(s, 'r-aggression', true);
    expect(s.players[p].storedTactics).toEqual(['r-aggression']);
    const dominance = s.players[p].dominance;
    s = apply(s, { type: 'playStoredTactic', card: 'r-aggression' });
    expect(s.players[p].dominance).toBe(dominance + 2);
    expect(s.players[p].storedTactics).toEqual([]);
    expect(legalActions(s)).toEqual([{ type: 'endTurn' }]);
  });

  cardCase(['r-curious'], 'Curious (CE)', () => {
    let s = quickStart(2, 713);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-curious', active: true }];
    s.players[p].research = 1;
    for (let i = 0; i < 3; i++) s = apply(s, { type: 'research' });
    expect(s.turn.actionsLeft).toBe(0);
    s = apply(s, { type: 'research' });
    expect(s.turn.curiousUsed).toBe(true);
    expect(s.players[p].research).toBe(5);
    expect(legalActions(s).filter((a) => a.type !== 'change')).toEqual([{ type: 'endTurn' }]);
  });

  cardCase(['r-profiteering'], 'Profiteering', () => {
    let s = quickStart(2, 716);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-profiteering', active: true }];
    s.pending.unshift({ kind: 'takeCard', player: p, count: 1, conquer: 1 });
    const missiles = s.players[p].missiles;
    s = apply(s, { type: 'profiteer' });
    expect(s.players[p].missiles).toBe(missiles + 1);
  });
});

describe('triggered and choice skills', () => {
  cardCase(['r-clever'], 'Clever', () => {
    // CE: after a Reconfigure, keep the number or change it by 1.
    let s = arrange(quickStart(2, 701), { p0d0: [7, 2, 3] });
    s.turn.player = 0;
    s.players[0].skills = [{ id: 'r-clever', active: true }];
    s = apply(s, { type: 'reconfigure', die: 'p0d0' });
    expect(s.pending[0]).toMatchObject({ kind: 'clever', source: 'clever' });
    const rolled = die(s, 'p0d0').value;
    s = apply(s, { type: 'clever', value: rolled });
    expect(die(s, 'p0d0').value).toBe(rolled);
  });

  cardCase(['r-calculating'], 'Calculating', () => {
    // Player 1's defending ship is destroyed: its owner picks the number it shows in the scrapyard.
    let s = duel(703, { foe: ['r-calculating'] }, true);
    expect(die(s, 'p1d0').loc.zone).toBe('scrapyard');
    expect(s.pending.find((p) => p.kind === 'clever')).toMatchObject({ player: 1, die: 'p1d0', source: 'calculating' });
    while (s.pending[0].kind !== 'clever') s = apply(s, legalActions(s)[0]);
    s = apply(s, { type: 'clever', value: 4 });
    expect(die(s, 'p1d0').value).toBe(4);
  });

  cardCase(['r-brilliant'], 'Brilliant', () => {
    let s = quickStart(2, 704);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-brilliant', active: true }];
    s.players[p].research = 1;
    s = apply(s, { type: 'endTurn' });
    s = apply(s, { type: 'endTurn' });
    expect(s.players[p].research).toBe(3);
  });

  cardCase(['r-ruthless'], 'Ruthless', () => {
    let s = duel(707, { me: ['r-ruthless'], foe: ['r-agile'] }, true);
    expect(s.pending[0]).toMatchObject({ kind: 'ruthless', player: 0, victim: 1 });
    s = apply(s, { type: 'ruthless', skill: 'r-agile' });
    expect(s.players[1].skills[0]).toMatchObject({ active: false, disabledUntil: 0 });
  });

  cardCase(['r-prideful'], 'Prideful', () => {
    let s = duel(708, { foe: ['r-prideful'] }, true);
    expect(s.pending[0]).toMatchObject({ kind: 'prideful', player: 0, victim: 1 });
    s = apply(s, { type: 'prideful', take: true });
    expect(s.players[0].skills).toEqual([{ id: 'r-prideful', active: true }]);
    expect(s.players[1].skills).toEqual([]);
  });

  cardCase(['r-dangerous'], 'Dangerous', () => {
    let s = arrange(quickStart(2, 709), { p0d0: [7, 2, 3], p1d0: [7, 3, 3] });
    s.turn.player = 0;
    s.players[1].skills = [{ id: 'r-dangerous', active: true }];
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    expect(s.pending[0]).toMatchObject({ kind: 'dangerous', player: 1 });
    s = apply(s, { type: 'dangerous', destroy: true });
    expect(die(s, 'p0d0').loc.zone).toBe('scrapyard');
    expect(die(s, 'p1d0').loc.zone).toBe('scrapyard');
  });

  cardCase(['r-cunning'], 'Cunning', () => {
    // A ship's ability twice in a turn: a Tactician swaps, and swaps back.
    let s = arrange(quickStart(2, 714), { p0d0: [0, 5, 3], p0d1: [12, 2, 6] });
    s.players[0].skills = [{ id: 'r-cunning', active: true }];
    s.turn.player = 0;
    s = apply(s, { type: 'swap', die: 'p0d0', other: 'p0d1' });
    s = apply(s, { type: 'swap', die: 'p0d0', other: 'p0d1' });
    expect(s.turn.oncePerTurn).toContain('cunning');
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 0, c: 5 });
  });
});

describe('passive skills and rule hooks', () => {
  cardCase(['r-agile'], 'Agile', () => {
    // A 3 moves 3 (Regolith's cap), and Agile's +1 on top: 4 along row 7.
    let s = arrange(quickStart(2, 801), { p0d0: [7, 2, 3] });
    s.turn.player = 0;
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 6 } })).toThrow();
    s.players[0].skills = [{ id: 'r-agile', active: true }];
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 6 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 6 });
  });

  cardCase(['r-devious'], 'Devious', () => {
    let s = arrange(quickStart(2, 803), { p0d0: [7, 2, 2], p1d0: [7, 3, 4] });
    s.turn.player = 0;
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } })).toThrow();
    s.players[0].skills = [{ id: 'r-devious', active: true }];
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 4 });
  });

  cardCase(['r-stealthy'], 'Stealthy', () => {
    let s = quickStart(2, 805);
    s.turn.player = 0;
    die(s, 'p0d0').loc = { zone: 'scrapyard' };
    const normal = deployTargets(s, 0).length;
    s.players[0].skills = [{ id: 'r-stealthy', active: true }];
    const targets = deployTargets(s, 0);
    expect(targets.length).toBeGreaterThan(normal);
    s = apply(s, { type: 'deploy', die: 'p0d0', to: targets[targets.length - 1] });
    expect(die(s, 'p0d0').loc.zone).toBe('board');
  });

  cardCase(['r-steadfast'], 'Steadfast', () => {
    let s = arrange(quickStart(2, 807), { p0d0: [7, 2, 1] });
    s.players[0].skills = [{ id: 'r-steadfast', active: true }];
    s.turn.player = 0;
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 3 } });
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 4 });
  });

  cardCase(['r-talented'], 'Talented', () => {
    const s = quickStart(2, 809);
    s.players[0].skills = [];
    expect(skillLimit(s, 0)).toBe(3);
    s.players[0].skills = [{ id: 'r-talented', active: true }];
    expect(skillLimit(s, 0)).toBe(5);
  });

  cardCase(['r-precocious'], 'Precocious', () => {
    let s = quickStart(2, 810);
    s.turn.player = 0;
    s.players[0].research = 4;
    expect(apply(s, { type: 'endTurn' }).pending.some((p) => p.kind === 'takeCard')).toBe(false);
    s.players[0].skills = [{ id: 'r-precocious', active: true }];
    s = apply(s, { type: 'endTurn' });
    expect(s.pending.some((p) => p.kind === 'takeCard')).toBe(true);
  });

  cardCase(['r-righteous'], 'Righteous', () => {
    // Keeps Dominance when a ship is destroyed, and blocks every research gain.
    const before = duel(812, {}, false).players[1].dominance;
    expect(duel(812, {}, true).players[1].dominance).toBeLessThan(before);
    expect(duel(812, { foe: ['r-righteous'] }, true).players[1].dominance).toBe(before);
    const s = quickStart(2, 813);
    s.players[s.turn.player].skills = [{ id: 'r-righteous', active: true }];
    expect(() => apply(s, { type: 'research' })).toThrow('You cannot gain research');
  });

  cardCase(['r-brutal'], 'Brutal', () => {
    const s = arrange(quickStart(2, 820), { p0d0: [7, 2, 6], p1d0: [7, 3, 3] });
    s.players[0].skills = [{ id: 'r-brutal', active: true }];
    s.turn.player = 0;
    expect(combatOf(apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' })).attacker.dice).toHaveLength(2);
  });

  /** The attacker's combat total with fixed dice of 3 each, with `skills` on `side`. */
  function total(skills: string[], side: 0 | 1, placements: Record<string, [number, number, number]> = {}) {
    let s = arrange(quickStart(2, 821), { p0d0: [7, 2, 6], p1d0: [7, 3, 3], ...placements });
    s.players[side].skills = skills.map((id) => ({ id, active: true }));
    s.turn.player = 0;
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    const combat = combatOf(s);
    combat.attacker.dice = [3];
    combat.defender.dice = [3];
    return { s, combat, out: combatOutcome(s, combat) };
  }

  cardCase(['r-ferocious'], 'Ferocious', () => {
    expect(total(['r-ferocious'], 0).out.attacker.total).toBe(total([], 0).out.attacker.total - 1);
  });

  cardCase(['r-rational'], 'Rational', () => {
    const { s, combat } = total(['r-rational'], 0);
    combat.attacker.dice = [6];
    expect(combatOutcome(s, combat).attacker.roll).toBe(3);
  });

  cardCase(['r-strategic'], 'Strategic', () => {
    const support = { p0d1: [8, 2, 2] as [number, number, number] };
    expect(total(['r-strategic'], 0, support).out.attacker.total).toBe(total([], 0, support).out.attacker.total - 2);
  });

  cardCase(['r-stubborn'], 'Stubborn', () => {
    const { out } = total(['r-stubborn'], 1, { p1d0: [7, 3, 6] });
    expect(out.attackerWins).toBe(false);
    expect(out.stubborn).toBe(true);
  });

  /** Whether the current player can conquer the middle 8 with these ships (in its orbit) and skills. */
  function conquers(id: string | null, ships: [number, number, number][], research?: number, dominance?: number) {
    const base = quickStart(2, 830);
    const me = base.turn.player;
    const s = arrange(base, Object.fromEntries(ships.map((p, i) => [`p${me}d${i}`, p])));
    s.players[me].skills = id ? [{ id, active: true }] : [];
    if (research !== undefined) s.players[me].research = research;
    if (dominance !== undefined) s.players[me].dominance = dominance;
    const centre = s.board.planets.find((p) => p.number === 8)!.id;
    return conquerCheck(s, me, centre).ok;
  }

  cardCase(['r-intelligent', 'r-tyrannical'], 'Conquer skills', () => {
    const cases: [string, [number, number, number][], number?][] = [
      [
        'r-intelligent',
        [
          [5, 4, 3],
          [7, 4, 4],
        ],
      ], // 7 for an 8
      ['r-tyrannical', [[5, 4, 6]], 2], // ship 6 + dominance 2
    ];
    for (const [id, ships, dominance] of cases) {
      expect(conquers(null, ships, undefined, dominance), `${id} needed`).toBe(false);
      expect(conquers(id, ships, undefined, dominance), id).toBe(true);
    }
  });

  cardCase(['r-pioneering'], 'Science', () => {
    // Ship 6 + 2 of research 3; ships 12 − 4 of research 5; research 2 has only 1 to spend.
    const cases: [[number, number, number][], number, boolean][] = [
      [[[5, 4, 6]], 3, true],
      [
        [
          [5, 4, 6],
          [7, 4, 6],
        ],
        5,
        true,
      ],
      [[[5, 4, 6]], 2, false],
    ];
    for (const [ships, research, ok] of cases) {
      expect(conquers(null, ships, research)).toBe(false);
      expect(conquers('r-pioneering', ships, research), `research ${research}`).toBe(ok);
    }
  });

  cardCase(['r-industrious'], 'Industrious', () => {
    let s = quickStart(2, 814);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-industrious', active: true }];
    s = apply(apply(s, { type: 'endTurn' }), { type: 'endTurn' });
    expect(s.turn.freeDeploys).toBe(1);
  });

  cardCase(['r-hostile'], 'Hostile', () => {
    // The attack's action is given back.
    expect(duel(835, { me: ['r-hostile'] }, true).turn.actionsLeft).toBe(3);
    expect(duel(835, {}, true).turn.actionsLeft).toBe(2);
  });

  cardCase(['r-plundering'], 'Plundering', () => {
    const s = duel(837, { me: ['r-plundering'] }, true);
    expect(s.players[0].research).toBe(duel(837, {}, true).players[0].research + 3);
  });

  cardCase(['r-ravenous'], 'Ravenous', () => {
    const s = duel(839, { me: ['r-ravenous'] }, true);
    expect(s.players[0].dominance).toBe(duel(839, {}, true).players[0].dominance + 1);
  });
});

it('has a scenario for every card', () => {
  const cards = MODES.flatMap((m) =>
    m.cards ? [...m.cards.skills, ...m.cards.tactics, ...(m.cards.expansion ? [m.cards.expansion] : [])] : [],
  );
  expect(cards.map((c) => c.id).filter((id) => !covered.has(id))).toEqual([]);
});
