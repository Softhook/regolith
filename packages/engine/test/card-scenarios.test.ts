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
  claimCheck,
  dropTargets,
  die,
  effectOf,
  legalActions,
  MODES,
  RULESETS,
  mechsOnBoard,
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
 * middle 8 at (6,4) is ringed by (5,4), (5,5), (6,3), (6,5), (7,3) and (7,4). Cards go by their effect (the
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
 * doesn't offer: scenarios reach decisions (Relocation, Headhunter, Science Survey, Signal Jammer…) that
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

/** Player 0 attacks player 1 with fixed dice, both at 3 Power; player 0's mech (p0d0) wins or loses. */
function duel(seed: number, skills: { me?: string[]; foe?: string[] }, attackerWins: boolean): GameState {
  let s = arrange(quickStart(2, seed), attackerWins ? { p0d0: [7, 2, 2], p1d0: [7, 3, 6] } : { p0d0: [7, 2, 6], p1d0: [7, 3, 1] });
  s.turn.player = 0;
  s.players[0].skills = (skills.me ?? []).map((id) => ({ id, active: true }));
  s.players[1].skills = (skills.foe ?? []).map((id) => ({ id, active: true }));
  for (const pl of s.players) pl.power = 3;
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

describe('tactics and reinforcements', () => {
  DECKS.tactics.forEach((tactic, i) =>
    cardCase([tactic.id], tactic.name, () => {
      let s = quickStart(2, 200 + i);
      const p = s.turn.player;
      const foe = 1 - p;
      setSkills(s, p, []);
      const before = structuredClone(s);
      const mechs = mechsOnBoard(s).length;
      const r = resolveWithAi(takeTactic(s, tactic.id), seededRandom(i * 31 + 5));
      s = r.s;
      switch (effectOf(tactic.id)) {
        case 'power-grab':
          expect(s.players[p].power).toBe(Math.min(6, before.players[p].power + 2));
          break;
        case 'contraband':
          expect(s.players[p].atomics).toBe(before.players[p].atomics + 2);
          break;
        case 'forced-march':
          expect(s.players[p].bonusTurns).toEqual([...before.players[p].bonusTurns, 2]);
          break;
        case 'kill-zone':
          expect(s.players[p].killZone).toBe(2);
          break;
        case 'sabotage':
          expect(s.players[foe].actionPenalty).toBe(before.players[foe].actionPenalty + 2);
          break;
        case 'ice-tunnel':
          expect(s.tunnels).toHaveLength(2);
          break;
        case 'headhunter':
          expect(r.seen).toContain('headhunter');
          expect(s.players[p].skills).toHaveLength(1);
          break;
        case 'orbital-cannon':
          expect(r.seen).toContain('orbitalCannon');
          expect(mechsOnBoard(s).length).toBe(mechs - 1);
          break;
        case 'invasion':
          expect(r.seen).toContain('invasion');
          break;
        case 'barricade':
          expect(r.seen).toContain('barricade');
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

  cardCase([DECKS.reinforcement!.id], 'Reinforcements', () => {
    let s = quickStart(2, 199);
    const p = s.turn.player;
    s.market.reinforcements = 1;
    s.pending.unshift({ kind: 'takeCard', player: p, count: 1 });
    const mechs = mechsOnBoard(s, p).length;
    s = resolveWithAi(apply(s, { type: 'takeCard', deck: 'reinforcement', index: 0 }), seededRandom(3)).s;
    expect(mechsOnBoard(s, p)).toHaveLength(mechs + 1);
  });
});

describe('activated skills', () => {
  cardCase(['r-stand-down'], 'Stand Down', () => {
    let s = quickStart(2, 601);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-stand-down', active: true }];
    s.players[p].power = 3;
    s.players[p].research = 1;
    s = apply(s, { type: 'standDown' });
    expect(s.players[p].power).toBe(2);
    expect(s.players[p].research).toBe(4);
  });

  cardCase(['r-final-push'], 'Final Push', () => {
    let s = quickStart(2, 603);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-final-push', active: true }];
    const actions = s.turn.actionsLeft;
    s = apply(s, { type: 'finalPush' });
    expect(s.turn.actionsLeft).toBe(actions + 1);
    expect(s.players[p].ambitionTokens).toBe(1);
  });

  cardCase(['r-field-refit'], 'Field Refit', () => {
    let s = quickStart(2, 604);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-field-refit', active: true }];
    const mech = mechsOnBoard(s, p)[0].id;
    die(s, mech).value = 3;
    s = apply(s, { type: 'fieldRefit', die: mech, delta: 1 });
    expect(die(s, mech).value).toBe(4);
  });

  cardCase(['r-recycle'], 'Recycle', () => {
    let s = quickStart(2, 606);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-recycle', active: true }];
    const mech = mechsOnBoard(s, p)[0].id;
    const actions = s.turn.actionsLeft;
    s = apply(s, { type: 'recycle', die: mech });
    expect(die(s, mech).loc.zone).toBe('salvageYard');
    expect(s.turn.actionsLeft).toBe(actions + 1);
  });

  cardCase(['r-advance'], 'Advance', () => {
    let s = arrange(quickStart(2, 608), { p0d0: [7, 2, 3] });
    s.players[0].skills = [{ id: 'r-advance', active: true }];
    s.turn.player = 0;
    s = apply(s, { type: 'advanceSkill', die: 'p0d0', to: { r: 7, c: 3 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 3 });
  });

  cardCase(['r-strategic-plan'], 'Strategic Plan', () => {
    let s = quickStart(2, 611);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-strategic-plan', active: true }];
    s = takeTactic(s, 'r-power-grab', true);
    expect(s.players[p].storedTactics).toEqual(['r-power-grab']);
    const power = s.players[p].power;
    s = apply(s, { type: 'strategicPlanPlay', card: 'r-power-grab' });
    expect(s.players[p].power).toBe(power + 2);
    expect(s.players[p].storedTactics).toEqual([]);
    expect(legalActions(s)).toEqual([{ type: 'endTurn' }]);
  });

  cardCase(['r-prospectors'], 'Prospectors (CE)', () => {
    let s = quickStart(2, 713);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-prospectors', active: true }];
    s.players[p].research = 1;
    for (let i = 0; i < 3; i++) s = apply(s, { type: 'research' });
    expect(s.turn.actionsLeft).toBe(0);
    s = apply(s, { type: 'research' });
    expect(s.turn.prospectorsUsed).toBe(true);
    expect(s.players[p].research).toBe(5);
    expect(legalActions(s).filter((a) => a.type !== 'change')).toEqual([{ type: 'endTurn' }]);
  });

  cardCase(['r-arms-deal'], 'Arms Deal', () => {
    let s = quickStart(2, 716);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-arms-deal', active: true }];
    s.pending.unshift({ kind: 'takeCard', player: p, count: 1, claim: 1 });
    const atomics = s.players[p].atomics;
    s = apply(s, { type: 'armsDeal' });
    expect(s.players[p].atomics).toBe(atomics + 1);
  });
});

describe('triggered and choice skills', () => {
  cardCase(['r-engineering'], 'Engineering', () => {
    // CE: after a Refit, keep the number or change it by 1.
    let s = arrange(quickStart(2, 701), { p0d0: [7, 2, 3] });
    s.turn.player = 0;
    s.players[0].skills = [{ id: 'r-engineering', active: true }];
    s = apply(s, { type: 'refit', die: 'p0d0' });
    expect(s.pending[0]).toMatchObject({ kind: 'engineering', source: 'engineering' });
    const rolled = die(s, 'p0d0').value;
    s = apply(s, { type: 'engineering', value: rolled });
    expect(die(s, 'p0d0').value).toBe(rolled);
  });

  cardCase(['r-remodel'], 'Remodel', () => {
    // Player 1's defending mech is destroyed: its owner picks the number it shows in the salvage yard.
    let s = duel(703, { foe: ['r-remodel'] }, true);
    expect(die(s, 'p1d0').loc.zone).toBe('salvageYard');
    expect(s.pending.find((p) => p.kind === 'engineering')).toMatchObject({ player: 1, die: 'p1d0', source: 'remodel' });
    while (s.pending[0].kind !== 'engineering') s = apply(s, legalActions(s)[0]);
    s = apply(s, { type: 'engineering', value: 4 });
    expect(die(s, 'p1d0').value).toBe(4);
  });

  cardCase(['r-science-survey'], 'Science Survey', () => {
    let s = quickStart(2, 704);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-science-survey', active: true }];
    s.players[p].research = 1;
    s = apply(s, { type: 'endTurn' });
    s = apply(s, { type: 'endTurn' });
    expect(s.players[p].research).toBe(3);
  });

  cardCase(['r-signal-jammer'], 'Signal Jammer', () => {
    let s = duel(707, { me: ['r-signal-jammer'], foe: ['r-tune-up'] }, true);
    expect(s.pending[0]).toMatchObject({ kind: 'signalJammer', player: 0, victim: 1 });
    s = apply(s, { type: 'signalJammer', skill: 'r-tune-up' });
    expect(s.players[1].skills[0]).toMatchObject({ active: false, disabledUntil: 0 });
  });

  cardCase(['r-stolen-flag'], 'Stolen Flag', () => {
    let s = duel(708, { foe: ['r-stolen-flag'] }, true);
    expect(s.pending[0]).toMatchObject({ kind: 'stolenFlag', player: 0, victim: 1 });
    s = apply(s, { type: 'stolenFlag', take: true });
    expect(s.players[0].skills).toEqual([{ id: 'r-stolen-flag', active: true }]);
    expect(s.players[1].skills).toEqual([]);
  });

  cardCase(['r-unstable-reactor'], 'Unstable Reactor', () => {
    let s = arrange(quickStart(2, 709), { p0d0: [7, 2, 3], p1d0: [7, 3, 3] });
    s.turn.player = 0;
    s.players[1].skills = [{ id: 'r-unstable-reactor', active: true }];
    s = apply(s, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    expect(s.pending[0]).toMatchObject({ kind: 'unstableReactor', player: 1 });
    s = apply(s, { type: 'unstableReactor', destroy: true });
    expect(die(s, 'p0d0').loc.zone).toBe('salvageYard');
    expect(die(s, 'p1d0').loc.zone).toBe('salvageYard');
  });

  cardCase(['r-boost'], 'Boost', () => {
    // A mech's ability twice in a turn: a Tactician swaps, and swaps back.
    let s = arrange(quickStart(2, 714), { p0d0: [0, 5, 3], p0d1: [12, 2, 6] });
    s.players[0].skills = [{ id: 'r-boost', active: true }];
    s.turn.player = 0;
    s = apply(s, { type: 'swap', die: 'p0d0', other: 'p0d1' });
    s = apply(s, { type: 'swap', die: 'p0d0', other: 'p0d1' });
    expect(s.turn.oncePerTurn).toContain('boost');
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 0, c: 5 });
  });
});

describe('passive skills and rule hooks', () => {
  cardCase(['r-tune-up'], 'Tune Up', () => {
    // A 3 moves 3 (Regolith's cap), and Tune Up's +1 on top: 4 along row 7.
    let s = arrange(quickStart(2, 801), { p0d0: [7, 2, 3] });
    s.turn.player = 0;
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 6 } })).toThrow();
    s.players[0].skills = [{ id: 'r-tune-up', active: true }];
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 6 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 6 });
  });

  cardCase(['r-sneak'], 'Sneak', () => {
    let s = arrange(quickStart(2, 803), { p0d0: [7, 2, 2], p1d0: [7, 3, 4] });
    s.turn.player = 0;
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } })).toThrow();
    s.players[0].skills = [{ id: 'r-sneak', active: true }];
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 4 });
  });

  cardCase(['r-infiltration'], 'Infiltration', () => {
    let s = quickStart(2, 805);
    s.turn.player = 0;
    die(s, 'p0d0').loc = { zone: 'salvageYard' };
    const normal = dropTargets(s, 0).length;
    s.players[0].skills = [{ id: 'r-infiltration', active: true }];
    const targets = dropTargets(s, 0);
    expect(targets.length).toBeGreaterThan(normal);
    s = apply(s, { type: 'drop', die: 'p0d0', to: targets[targets.length - 1] });
    expect(die(s, 'p0d0').loc.zone).toBe('board');
  });

  cardCase(['r-double-time'], 'Double Time', () => {
    let s = arrange(quickStart(2, 807), { p0d0: [7, 2, 1] });
    s.players[0].skills = [{ id: 'r-double-time', active: true }];
    s.turn.player = 0;
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 3 } });
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } });
    expect(die(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 4 });
  });

  cardCase(['r-veteran-crew'], 'Veteran Crew', () => {
    const s = quickStart(2, 809);
    s.players[0].skills = [];
    expect(skillLimit(s, 0)).toBe(3);
    s.players[0].skills = [{ id: 'r-veteran-crew', active: true }];
    expect(skillLimit(s, 0)).toBe(5);
  });

  cardCase(['r-rush-research'], 'Rush Research', () => {
    let s = quickStart(2, 810);
    s.turn.player = 0;
    s.players[0].research = 4;
    expect(apply(s, { type: 'endTurn' }).pending.some((p) => p.kind === 'takeCard')).toBe(false);
    s.players[0].skills = [{ id: 'r-rush-research', active: true }];
    s = apply(s, { type: 'endTurn' });
    expect(s.pending.some((p) => p.kind === 'takeCard')).toBe(true);
  });

  cardCase(['r-fanatics'], 'Fanatics', () => {
    // Keeps Power when a mech is destroyed, and blocks every research gain.
    const before = duel(812, {}, false).players[1].power;
    expect(duel(812, {}, true).players[1].power).toBeLessThan(before);
    expect(duel(812, { foe: ['r-fanatics'] }, true).players[1].power).toBe(before);
    const s = quickStart(2, 813);
    s.players[s.turn.player].skills = [{ id: 'r-fanatics', active: true }];
    expect(() => apply(s, { type: 'research' })).toThrow('You cannot gain research');
  });

  cardCase(['r-paired-cannons'], 'Paired Cannons', () => {
    const s = arrange(quickStart(2, 820), { p0d0: [7, 2, 6], p1d0: [7, 3, 3] });
    s.players[0].skills = [{ id: 'r-paired-cannons', active: true }];
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

  cardCase(['r-armour-piercing'], 'Armour Piercing', () => {
    expect(total(['r-armour-piercing'], 0).out.attacker.total).toBe(total([], 0).out.attacker.total - 1);
  });

  cardCase(['r-drill-sergeant'], 'Drill Sergeant', () => {
    const { s, combat } = total(['r-drill-sergeant'], 0);
    combat.attacker.dice = [6];
    expect(combatOutcome(s, combat).attacker.roll).toBe(3);
  });

  cardCase(['r-close-protection'], 'Close Protection', () => {
    const support = { p0d1: [8, 2, 2] as [number, number, number] };
    expect(total(['r-close-protection'], 0, support).out.attacker.total).toBe(total([], 0, support).out.attacker.total - 2);
  });

  cardCase(['r-entrenched'], 'Entrenched', () => {
    const { out } = total(['r-entrenched'], 1, { p1d0: [7, 3, 6] });
    expect(out.attackerWins).toBe(false);
    expect(out.entrenched).toBe(true);
    expect(out.winner).toBe('defender');
    expect(out.destroyed).toBe('attacker');
  });

  /** Whether the current player can claim the middle 8 with these mechs (in its perimeter) and skills. */
  function claims(id: string | null, mechs: [number, number, number][], research?: number, power?: number) {
    const base = quickStart(2, 830);
    const me = base.turn.player;
    const s = arrange(base, Object.fromEntries(mechs.map((p, i) => [`p${me}d${i}`, p])));
    s.players[me].skills = id ? [{ id, active: true }] : [];
    if (research !== undefined) s.players[me].research = research;
    if (power !== undefined) s.players[me].power = power;
    const centre = s.board.objectives.find((p) => p.number === 8)!.id;
    return claimCheck(s, me, centre).ok;
  }

  cardCase(['r-hacking', 'r-martial-law'], 'Claim skills', () => {
    const cases: [string, [number, number, number][], number?][] = [
      [
        'r-hacking',
        [
          [5, 4, 3],
          [7, 4, 4],
        ],
      ], // 7 for an 8
      ['r-martial-law', [[5, 4, 6]], 2], // mech 6 + power 2
    ];
    for (const [id, mechs, power] of cases) {
      expect(claims(null, mechs, undefined, power), `${id} needed`).toBe(false);
      expect(claims(id, mechs, undefined, power), id).toBe(true);
    }
  });

  cardCase(['r-science'], 'Science', () => {
    // Mech 6 + 2 of research 3; mechs 12 − 4 of research 5; research 2 has only 1 to spend.
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
    for (const [mechs, research, ok] of cases) {
      expect(claims(null, mechs, research)).toBe(false);
      expect(claims('r-science', mechs, research), `research ${research}`).toBe(ok);
    }
  });

  cardCase(['r-free-drop'], 'Free Drop', () => {
    let s = quickStart(2, 814);
    const p = s.turn.player;
    s.players[p].skills = [{ id: 'r-free-drop', active: true }];
    s = apply(apply(s, { type: 'endTurn' }), { type: 'endTurn' });
    expect(s.turn.freeDrops).toBe(1);
  });

  cardCase(['r-breakthrough'], 'Breakthrough', () => {
    // The attack's action is given back.
    expect(duel(835, { me: ['r-breakthrough'] }, true).turn.actionsLeft).toBe(3);
    expect(duel(835, {}, true).turn.actionsLeft).toBe(2);
  });

  cardCase(['r-exploit'], 'Exploit', () => {
    const s = duel(837, { me: ['r-exploit'] }, true);
    expect(s.players[0].research).toBe(duel(837, {}, true).players[0].research + 3);
  });

  cardCase(['r-trophy-hunters'], 'Trophy Hunters', () => {
    const s = duel(839, { me: ['r-trophy-hunters'] }, true);
    expect(s.players[0].power).toBe(duel(839, {}, true).players[0].power + 1);
  });
});

it('has a scenario for every card', () => {
  const cards = MODES.flatMap((m) =>
    m.cards ? [...m.cards.skills, ...m.cards.tactics, ...(m.cards.reinforcement ? [m.cards.reinforcement] : [])] : [],
  );
  expect(cards.map((c) => c.id).filter((id) => !covered.has(id))).toEqual([]);
});
