/**
 * Regolith mode (docs/regolith/PROTOTYPING.md; rulesets.ts, mechs.ts, powers/): Community Edition with movement capped at 3,
 * zones of control (every mech pickets the spaces around it), a new power for the 5 (Shoot), which
 * replaces Manoeuvre, a 6 that fires barriers, contested perimeters, and over-claim (a perimeter of 12) when
 * REGOLITH_OVER_CLAIM is on. The first block checks the two modes, Basic and Regolith.
 *
 * Scenarios run on Alpha Sector (hex), the basic map for 2 players, in axial cells (docs/HEX.md): a space's
 * sides are a row or column away, or (-1, +1) and (+1, -1). The middle 8 is at (6,4); row 7 runs clear from
 * (7,2) to (7,6), with the 7 at (7,1) to its left; column 5 runs clear from (2,5) down to (7,5); the top
 * start, a 7, is at (1,5), with (0,5) and (0,6) above it.
 */
import { describe, expect, it } from 'vitest';
import {
  adjacent,
  apply,
  perimeterSpaces,
  claimCheck,
  dropTargets,
  homeObjective,
  infamyTargets,
  objectivesAround,
  grid,
  attackLaunches,
  cardKind,
  effectOf,
  reinforcementCard,
  isEmptySpace,
  legalActions,
  MODES,
  moveIndexes,
  movePath,
  moveOptions,
  mulberry32,
  objectiveFreeSlots,
  rulesOf,
  RULESETS,
  mechsByIndex,
  shuntTargets,
  barrierShuntTargets,
  spaces,
  stopZone,
  tryApply,
  type Action,
  type BarrierBreakRule,
  type GameMode,
  type GameState,
  MAPS,
} from '../src';
import { cubeLeft } from '../src/core';
import { beginPlay, settle } from '../src/turn';
import { REGOLITH_DECKS, REGOLITH_OVER_CLAIM } from '../src/rulesets';
import { barrier as barrierAbility, barrierTargets } from '../src/abilities/barrier';
import { picket } from '../src/abilities/picket';
import { shoot as shootAbility, shootTargets } from '../src/abilities/shoot';
import { arrange, quickStart } from './helpers';
import { toRow } from './audit';

/** Regolith on Alpha Sector (hex); `open`, on Arcadia Planitia, whose blank tiles are next to no objective. */
const BASE: Record<'regolith' | 'open', GameState> = {
  regolith: quickStart(2, 1, 'regolith', 'alpha-hex'),
  open: quickStart(2, 1, 'regolith', 'arcadia-planitia'),
};

/** Player 0 to act with 3 fresh actions, only the listed mechs on the map, and the given skills. */
function scenario(dice: Record<string, [number, number, number]>, skills: string[] = [], map: keyof typeof BASE = 'regolith'): GameState {
  const s = structuredClone(BASE[map]);
  for (const d of s.dice) if (d.loc.zone === 'board') d.loc = { zone: 'salvageYard' };
  for (const [id, [r, c, value]] of Object.entries(dice)) {
    const d = s.dice.find((x) => x.id === id)!;
    d.loc = { zone: 'board', r, c };
    d.value = value;
  }
  for (const p of s.players) p.skills = p.id === 0 ? skills.map((id) => ({ id, active: true })) : [];
  s.turn = { ...s.turn, player: 0, phase: 'actions', actionsLeft: 3, moved: {}, abilityUsed: {}, seen: {}, claims: 0, oncePerTurn: [] };
  for (const d of s.dice) s.turn.seen[d.id] = [d.value];
  return s;
}

const at = (s: GameState, id: string) => s.dice.find((d) => d.id === id)!;
const farthest = (s: GameState, id: string) => Math.max(...[...moveOptions(s, id).moves.values()].map((m) => m.steps));
const offered = (s: GameState, type: Action['type']) => legalActions(s).filter((a) => a.type === type);
/** The mechs p0d0 may shoot now, by the legal actions (so cost and power included). */
const shots = (s: GameState) =>
  legalActions(s)
    .flatMap((a) => (a.type === 'ability' && a.die === 'p0d0' && a.target ? [a.target] : []))
    .sort();

describe('Regolith mode', () => {
  it('is listed after Basic, and plays like Community otherwise', () => {
    expect(MODES.map((m) => m.id)).toEqual(['basic', 'regolith'] satisfies GameMode[]);
    const regolith = rulesOf(BASE.regolith);
    expect(regolith.name).toBe('Full Game');
    // Its own decks: each card plays by the rules (`effect`) of the Community card it started as (`from`) under
    // its own id and name, unless reworked or new.
    const own = regolith.cards!;
    expect(own.skills).toBe(REGOLITH_DECKS.skills);
    expect(own.tactics).toBe(REGOLITH_DECKS.tactics);
    expect(own.reinforcement).toBe(REGOLITH_DECKS.reinforcements[0]);
    expect(own.tactics.filter((c) => !c.from).map((c) => c.id)).toEqual(['r-barricade', 'r-kinetic-shunt']);
    for (const c of [...own.skills, ...own.tactics, own.reinforcement!]) {
      if (c.status === 'new') {
        expect(['r-barricade', 'r-kinetic-shunt']).toContain(c.id);
        expect(c.from).toBeUndefined();
        expect(cardKind(c.id)).toBe('tactic');
        expect(c.count).toBe(2);
        expect(c.category).toBe('movement');
        if (c.id === 'r-barricade') {
          expect(effectOf(c.id)).toBe('barricade');
          expect(c.text).toBe('Place two barriers.');
        } else {
          expect(effectOf(c.id)).toBe('kinetic-shunt');
          expect(c.text).toBe('Choose any mech or barrier. Push it up to 4 spaces in a straight line.');
        }
      } else {
        expect(c.from, c.id).toBeDefined();
      }
      // A card's id is its name; its effect, the id without the r-.
      expect(c.id).toBe(`r-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      expect(effectOf(c.id), c.id).toBe(c.id.slice(2));
    }
    expect(reinforcementCard(BASE.regolith)).toBe(own.reinforcement);
    expect(regolith.mapGroups).toEqual(['hex', 'open', 'drift', 'prepared']);
    const played = MAPS.filter((m) => ['hex', 'open', 'drift', 'prepared'].includes(m.group));
    for (const m of played) expect(m.world, m.id).toBeDefined();
    expect(played.map((m) => m.id)).toContain('twin-drift');
    expect(regolith.overClaim).toBe(REGOLITH_OVER_CLAIM);
    expect(regolith.mechs[5].hooks).toEqual({ ...shootAbility.hooks, ...picket.hooks });
    expect(regolith.mechs[5].builtIn).toBeUndefined();
    expect(regolith.mechs[6].hooks).toEqual({ ...barrierAbility.hooks, ...picket.hooks });
    expect(regolith.mechs[6].builtIn).toBeUndefined();
    expect([1, 2, 3, 4].map((v) => regolith.mechs[v].builtIn)).toEqual(['freeAttack', 'carry', 'swap', 'change']);
    expect([1, 2, 3, 4, 5, 6].map((v) => regolith.mechs[v].name)).toEqual([
      'Breacher',
      'Behemoth',
      'Tactician',
      'Chameleon',
      'Sniper',
      'Wisp',
    ]);
    for (const v of [1, 2, 3, 4, 5, 6]) expect(regolith.mechs[v].hooks?.stopsEnemies, `mech ${v}`).toBe(picket.hooks.stopsEnemies);
  });

  it('has Basic, Regolith without its cards, as its learning game', () => {
    const { id, name, title, summary, cards, ...basic } = RULESETS.basic;
    expect([id, name, title, cards]).toEqual(['basic', 'Basic', 'Basic', null]);
    expect(summary).toMatch(/without any cards/);
    const { id: _id, name: _name, title: _title, summary: _summary, cards: _cards, ...regolith } = RULESETS.regolith;
    expect(basic).toEqual(regolith);
    const s = scenario({ p0d0: [7, 2, 5], p1d0: [7, 4, 4], p1d1: [12, 2, 6] });
    s.mode = 'basic';
    expect(offered(s, 'ability')).toEqual([{ type: 'ability', die: 'p0d0', target: 'p1d0' }]);
    expect(stopZone(s, 0, mechsByIndex(s))).toBeDefined();
  });

  it('uses mode-configured regular-turn actions and research cap', () => {
    const rules = RULESETS.regolith;
    const oldActions = rules.actionsPerTurn;
    const oldResearchLimit = rules.researchLimit;
    try {
      rules.actionsPerTurn = 2;
      rules.researchLimit = 4;

      const started = scenario({});
      beginPlay(started);
      expect(started.turn.actionsLeft).toBe(2);

      const ready = scenario({});
      ready.players[0].research = 3;
      expect(offered(ready, 'research')).toHaveLength(1);
      const researched = apply(ready, { type: 'research' });
      expect(researched.players[0].research).toBe(4);
      expect(offered(researched, 'research')).toEqual([]);
      expect(() => apply(researched, { type: 'research' })).toThrow(/at 4/);
    } finally {
      rules.actionsPerTurn = oldActions;
      rules.researchLimit = oldResearchLimit;
    }
  });
});

describe('movement cap', () => {
  it('caps the die value at 3', () => {
    for (const value of [3, 4, 5, 6]) expect(farthest(scenario({ p0d0: [7, 2, value] }), 'p0d0'), `a ${value}`).toBe(3);
    expect(farthest(scenario({ p0d0: [7, 2, 2] }), 'p0d0')).toBe(2);
  });

  it('applies before skill bonuses: a 6 with Tune Up moves 4 (ruling 2026-10-08)', () => {
    expect(farthest(scenario({ p0d0: [7, 2, 6] }, ['r-tune-up']), 'p0d0')).toBe(4);
    expect(farthest(scenario({ p0d0: [7, 2, 2] }, ['r-tune-up']), 'p0d0')).toBe(3);
  });
});

describe('zones of control (Picket on every mech)', () => {
  const reachable = (s: GameState) => [...moveOptions(s, 'p0d0').moves.keys()];

  it('stops an enemy mech next to a mech, on any of its 6 sides: it can’t move through', () => {
    // Along row 7 from (7,2), (7,4) is next to the enemy at (8,4); every other way to (7,5) passes its zone too.
    const s = scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, 6] });
    expect(reachable(s)).toContain('7,4');
    expect(reachable(s)).not.toContain('7,5');
    expect(reachable(scenario({ p0d0: [7, 2, 3] }))).toContain('7,5');
  });

  it('still lets it attack from there', () => {
    const s = scenario({ p0d0: [7, 2, 3], p1d0: [7, 5, 6] });
    expect(moveOptions(s, 'p0d0').attacks.has('p1d0')).toBe(true);
  });

  it('lets a mech that starts in a zone leave, and never stops friendly mechs', () => {
    expect(reachable(scenario({ p0d0: [7, 3, 3], p1d0: [7, 4, 6] }))).toContain('8,1');
    expect(reachable(scenario({ p0d0: [7, 2, 3], p0d1: [8, 4, 6] }))).toContain('7,5');
  });

  it('every mech has a zone, and the engine refuses a move through one', () => {
    for (const v of [1, 2, 3, 4, 5, 6])
      expect(reachable(scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, v] })), `enemy ${v}`).not.toContain('7,5');
    const move: Action = { type: 'move', die: 'p0d0', to: { r: 7, c: 5 } };
    expect(tryApply(scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, 6] }), move)).toBeNull();
    expect(tryApply(scenario({ p0d0: [7, 2, 3] }), move)).not.toBeNull();
  });

  it('lets a stopped mech attack another enemy next to it, but not with no steps left', () => {
    // Stopped at (7,4) by p1d0's zone, with p1d1 next to it as well.
    expect([...moveOptions(scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, 6], p1d1: [6, 5, 6] }), 'p0d0').attacks.keys()].sort()).toEqual([
      'p1d0',
      'p1d1',
    ]);
    expect(moveOptions(scenario({ p0d0: [7, 2, 2], p1d0: [7, 5, 6] }), 'p0d0').attacks.size).toBe(0);
  });

  it('doesn’t stop a player with Sneak, who may also pass through the mech', () => {
    // Sneak passes (7,3), next to p1d0, and p1d0 itself for free: (7,6) is 3 steps from (7,2).
    expect(reachable(scenario({ p0d0: [7, 2, 3], p1d0: [7, 4, 6] }, ['r-sneak']))).toContain('7,6');
    expect(reachable(scenario({ p0d0: [7, 2, 3], p1d0: [7, 4, 6] }))).not.toContain('7,6');
    expect(reachable(scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, 6] }, ['r-sneak']))).toContain('7,5');
    expect(reachable(scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, 6] }))).not.toContain('7,5');
  });

  it('stops a mech on an Ice Tunnel exit in a zone', () => {
    const s = scenario({ p0d0: [7, 2, 3], p1d0: [2, 6, 6] });
    s.tunnels = [
      { r: 7, c: 3 },
      { r: 2, c: 5 },
    ];
    expect(reachable(s)).toContain('2,5');
    expect(reachable(s)).not.toContain('2,4'); // 3 steps only through the tunnel and (2,5)
    at(s, 'p1d0').loc = { zone: 'salvageYard' };
    expect(reachable(s)).toContain('2,4');
  });

  it('covers a hex’s 6 sides, but not its diagonals', () => {
    const s = scenario({ p1d0: [4, 5, 6] });
    const g = grid(s.board);
    const zone = [...picket.hooks.stopsEnemies!(s, at(s, 'p1d0'), 4 * g.cols + 5)].map((i) => g.cells[i]);
    expect(zone).toEqual(adjacent(s.board, { r: 4, c: 5 }));
    expect(zone).toHaveLength(6);
    // (5,3) is a hex diagonal of the enemy at (4,5); (5,4), a side, stops it, so
    // (5,5) and the spaces past (4,4) are out of reach.
    const moves = reachable(scenario({ p0d0: [5, 3, 2], p1d0: [4, 5, 6] }));
    expect(moves).toEqual(expect.arrayContaining(['5,4', '4,4']));
    expect(moves).not.toContain('5,5');
    expect(moves).not.toContain('3,4');
    expect(reachable(scenario({ p0d0: [5, 3, 2] }))).toEqual(expect.arrayContaining(['5,5', '3,4']));
  });

  it('agrees with a plain reference search on random positions', () => {
    const g = grid(BASE.regolith.board);
    const spaces = [...Array(g.size).keys()].filter((i) => g.space[i]);
    const random = mulberry32(42);
    for (let n = 0; n < 500; n++) {
      const dice: Record<string, [number, number, number]> = {};
      [...spaces]
        .sort(() => random() - 0.5)
        .slice(0, 2 + Math.floor(random() * 8))
        .forEach((i, k) => (dice[`p${k % 2}d${Math.floor(k / 2)}`] = [Math.floor(i / g.cols), i % g.cols, 1 + Math.floor(random() * 6)]));
      const s = scenario(dice);
      for (const id of Object.keys(dice).filter((x) => x.startsWith('p0'))) {
        const got = moveIndexes(s, id);
        const want = referenceReach(s, id);
        expect(
          [...got.moves.keys()].sort((a, b) => a - b),
          `${n} ${id}`,
        ).toEqual(want.moves);
        expect([...got.attacks.keys()].sort(), `${n} ${id}`).toEqual(want.attacks);
      }
    }
  });
});

/** Moves and attacks by a plain breadth-first search, 1 step per space, stopping in any space next to an enemy (no tunnels or skills). */
function referenceReach(s: GameState, id: string) {
  const g = grid(s.board);
  const at = mechsByIndex(s);
  const me = at.find((d) => d?.id === id)!;
  const from = at.indexOf(me);
  const zone = new Set(at.flatMap((d, i) => (d && d.owner !== me.owner ? g.ortho[i] : [])));
  const range = Math.min(3, me.value);
  const steps = new Map([[from, 0]]);
  const queue = [from];
  const attacks = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (steps.get(cur)! >= range) continue;
    for (const nb of g.ortho[cur]) {
      if (at[nb]) {
        if (at[nb]!.owner !== me.owner) attacks.add(at[nb]!.id);
      } else if (g.space[nb] && !steps.has(nb) && !(cur !== from && zone.has(cur))) {
        steps.set(nb, steps.get(cur)! + 1);
        queue.push(nb);
      }
    }
  }
  steps.delete(from);
  return { moves: [...steps.keys()].sort((a, b) => a - b), attacks: [...attacks].sort() };
}

describe('where an attack goes in from', () => {
  // On Arcadia Planitia's open ground, next to no objective: a 4 at (7,5) can attack p1d0 at (7,3) from (7,4), one step
  // away, or from (6,4) or (8,3), two away; all three are next to nothing else.
  const launches = (s: GameState) => attackLaunches(s, 'p0d0', 'p1d0').map((x) => `${x.from.r},${x.from.c}`);
  const attack = (r: number, c: number): Action => ({ type: 'attack', die: 'p0d0', target: 'p1d0', from: { r, c } });
  const open = (dice: Record<string, [number, number, number]>) => scenario(dice, [], 'open');

  it('offers one space for each different outcome, the nearest', () => {
    // p0d1 at (9,3) is next to (8,3): a repelled mech there would have support.
    const s = open({ p0d0: [7, 5, 4], p1d0: [7, 3, 6], p0d1: [9, 3, 2] });
    expect(moveOptions(s, 'p0d0').attacks.get('p1d0')?.launches).toHaveLength(3);
    expect(launches(s)).toEqual(['7,4', '8,3']);
    expect(offered(s, 'attack').filter((a) => a.type === 'attack' && a.die === 'p0d0')).toHaveLength(2);
  });

  it('refuses a space with the same outcome as an offered one, and attacks from the one chosen', () => {
    const s = open({ p0d0: [7, 5, 4], p1d0: [7, 3, 6], p0d1: [9, 3, 2] });
    expect(tryApply(s, attack(6, 4))).toBeNull();
    const after = tryApply(s, attack(8, 3))!;
    expect(at(after, 'p0d0').loc).toEqual({ zone: 'board', r: 8, c: 3 });
  });

  it('offers no choice with only one space to attack from', () => {
    expect(launches(open({ p0d0: [7, 4, 1], p1d0: [7, 3, 6] }))).toEqual(['7,4']);
  });

  it('tells apart a space next to another enemy mech, which stops a mech in its zone of control', () => {
    // (6,4) is next to p1d1 as well; (7,4) and (8,3) are next to nothing else, so only the nearer is offered.
    const s = open({ p0d0: [7, 5, 4], p1d0: [7, 3, 6], p1d1: [5, 4, 6] });
    expect(launches(s)).toEqual(['7,4', '6,4']);
  });
});

describe('the way a mech flies (movePath)', () => {
  const path = (s: GameState, r: number, c: number) => movePath(s, 'p0d0', { r, c }).map((p) => `${p.r},${p.c}`);

  it('goes straight when it can', () => {
    expect(path(scenario({ p0d0: [7, 2, 4] }), 7, 5)).toEqual(['7,2', '7,3', '7,4', '7,5']);
  });

  it('goes round a mech in the way, one space at a time, by a shortest way', () => {
    const way = path(scenario({ p0d0: [7, 2, 4], p0d1: [7, 3, 6] }), 7, 4);
    expect(way).toHaveLength(4);
    expect(way).not.toContain('7,3');
    for (let i = 1; i < way.length; i++) {
      const [[r0, c0], [r1, c1]] = [way[i - 1], way[i]].map((p) => p.split(',').map(Number));
      const [dr, dc] = [r1 - r0, c1 - c0];
      expect((Math.abs(dr) + Math.abs(dc) + Math.abs(dr + dc)) / 2, way.join(' ')).toBe(1);
    }
  });

  it('passes through enemy mechs for free with Sneak', () => {
    const s = scenario({ p0d0: [7, 2, 1], p1d0: [7, 3, 6], p1d1: [7, 4, 6] }, ['r-sneak']);
    expect(path(s, 7, 5)).toEqual(['7,2', '7,3', '7,4', '7,5']);
  });

  it('is empty where the mech can’t go, as past a zone of control', () => {
    expect(path(scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, 6] }), 7, 5)).toEqual([]);
    expect(path(scenario({ p0d0: [7, 2, 3], p1d0: [8, 4, 6] }), 7, 4)).toEqual(['7,2', '7,3', '7,4']);
  });
});

describe('classic 5 and 6 abilities are gone, the 4 is kept', () => {
  it('a Chameleon (4) can change, as in Community', () => {
    const s = scenario({ p0d0: [7, 2, 4], p0d1: [0, 5, 6] });
    expect(offered(s, 'change').length).toBeGreaterThan(0);
  });

  it('the 1, 2 and 3 keep theirs', () => {
    const s = scenario({ p0d0: [7, 2, 1], p0d1: [0, 5, 3], p1d0: [7, 3, 4] });
    expect(offered(s, 'freeAttack')).toHaveLength(1);
    expect(offered(s, 'swap')).toHaveLength(1);
  });
});

describe('Shoot (5 Sniper)', () => {
  /** Shoots and fixes both combat rolls (lower total wins). */
  function shoot(s: GameState, target: string, attackerRoll: number, defenderRoll: number) {
    s = apply(s, { type: 'ability', die: 'p0d0', target });
    const c = s.pending[0];
    if (c?.kind !== 'combat') throw new Error('no combat');
    c.attacker.dice = [attackerRoll];
    c.defender.dice = [defenderRoll];
    return apply(s, { type: 'resolveCombat' });
  }
  const mine = (s: GameState, type: Action['type']) => legalActions(s).filter((a) => a.type === type && 'die' in a && a.die === 'p0d0');

  it('attacks a mech 2 spaces away, and stays put when it wins', () => {
    const s0 = scenario({ p0d0: [7, 2, 5], p1d0: [7, 4, 3] });
    expect(offered(s0, 'ability')).toEqual([{ type: 'ability', die: 'p0d0', target: 'p1d0' }]);
    const s = shoot(s0, 'p1d0', 1, 6);
    expect(at(s, 'p1d0').loc.zone).toBe('salvageYard');
    expect(at(s, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 2 });
    expect(s.pending.some((p) => p.kind === 'advance')).toBe(false);
    expect(s.players[0].power).toBeGreaterThan(BASE.regolith.players[0].power);
  });

  it('is the mech’s one action: no move, attack or second shot after it', () => {
    const s = shoot(scenario({ p0d0: [7, 2, 5], p1d0: [7, 4, 3], p1d1: [5, 2, 2] }), 'p1d0', 6, 1);
    expect(s.turn.actionsLeft).toBe(2);
    expect(mine(s, 'ability')).toEqual([]);
    expect(mine(s, 'move')).toEqual([]);
    expect(mine(s, 'attack')).toEqual([]);
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 8, c: 2 } })).toThrow(/already moved/);
  });

  it('can’t shoot after moving or after a normal attack', () => {
    const s0 = scenario({ p0d0: [7, 2, 5], p1d0: [7, 6, 3] });
    expect(shots(s0)).toEqual(['p1d0']);
    expect(shots(apply(s0, { type: 'move', die: 'p0d0', to: { r: 8, c: 2 } }))).toEqual([]);
    const s1 = scenario({ p0d0: [7, 2, 5], p1d0: [7, 3, 6], p1d1: [5, 2, 3] });
    const attacked = apply(s1, { type: 'attack', die: 'p0d0', target: 'p1d0' });
    const resolved = apply(attacked, { type: 'resolveCombat' });
    expect(shots(resolved.pending.length ? apply(resolved, { type: 'advance', move: false }) : resolved)).toEqual([]);
  });

  it('reaches the first mech in a clear straight line out of a side, at any distance', () => {
    const ids = (s: GameState) =>
      shootTargets(s, at(s, 'p0d0'))
        .map((d) => d.id)
        .sort();
    expect(ids(scenario({ p0d0: [7, 4, 5], p1d0: [7, 5, 3], p1d1: [7, 2, 2] }))).toEqual(['p1d0', 'p1d1']);
    expect(ids(scenario({ p0d0: [2, 5, 5], p1d0: [7, 5, 3] }))).toEqual(['p1d0']);
  });

  it('is blocked by mechs, objectives and the edge of the board', () => {
    expect(shots(scenario({ p0d0: [7, 2, 5], p0d1: [7, 3, 2], p1d0: [7, 4, 3] }))).toEqual([]);
    expect(shots(scenario({ p0d0: [7, 2, 5], p1d0: [7, 4, 3], p1d1: [7, 6, 2] }))).toEqual(['p1d0']); // only the first
    expect(shots(scenario({ p0d0: [4, 2, 5], p1d0: [4, 4, 3] }))).toEqual([]); // an objective in between
    expect(shots(scenario({ p0d0: [7, 2, 5], p0d1: [7, 4, 3] }))).toEqual([]);
  });

  it('shoots along a hex’s 6 sides, not its diagonals', () => {
    const ids = (s: GameState) =>
      shootTargets(s, at(s, 'p0d0'))
        .map((d) => d.id)
        .sort();
    // From (7,3): along +c to (7,6), along (+1,-1) to (9,1) and down to (10,3); (6,3)'s line meets an objective.
    expect(ids(scenario({ p0d0: [7, 3, 5], p1d0: [7, 6, 3], p1d1: [9, 1, 2], p1d2: [10, 3, 1] }))).toEqual(['p1d0', 'p1d1', 'p1d2']);
    // (8,4) and (5,4) are hex diagonals, two hexes away between two sides.
    expect(ids(scenario({ p0d0: [7, 3, 5], p1d0: [8, 4, 3], p1d1: [5, 4, 2] }))).toEqual([]);
  });

  it('flies over the Alien Artefacts', () => {
    const s = scenario({ p0d0: [7, 2, 5], p1d0: [7, 4, 3] });
    s.board.cells[7][3].artefact = true;
    expect(shootTargets(s, at(s, 'p0d0')).map((d) => d.id)).toEqual(['p1d0']);
  });

  it('only the 5, the Sniper, can shoot', () => {
    expect(shots(scenario({ p0d0: [7, 2, 4], p1d0: [7, 4, 3] }))).toEqual([]);
    expect(() => apply(scenario({ p0d0: [7, 2, 4], p1d0: [7, 4, 3] }), { type: 'ability', die: 'p0d0', target: 'p1d0' })).toThrow(
      /no such ability/,
    );
  });
});

describe('Barrier (6 Wisp)', () => {
  const cells = (list: { r: number; c: number }[]) => list.map((p) => `${p.r},${p.c}`).sort();
  const fire = (s: GameState, r: number, c: number, die = 'p0d0') => apply(s, { type: 'ability', die, to: { r, c } });

  it('lands on any clear space in a straight line out of a side, at any distance', () => {
    // From (7,2): along the row up to the enemy at (7,6), up column 2 to the map's edge, up and right to the 7
    // at (3,6), and one space each down and down-left; the 7 at (7,1) is right beside it.
    const s = scenario({ p0d0: [7, 2, 6], p1d0: [7, 6, 3] });
    expect(cells(barrierTargets(s, at(s, 'p0d0')))).toEqual(
      cells([
        { r: 7, c: 3 },
        { r: 7, c: 4 },
        { r: 7, c: 5 },
        { r: 6, c: 2 },
        { r: 5, c: 2 },
        { r: 4, c: 2 },
        { r: 6, c: 3 },
        { r: 5, c: 4 },
        { r: 4, c: 5 },
        { r: 8, c: 2 },
        { r: 8, c: 1 },
      ]),
    );
  });

  it('costs no action and leaves the move: once a turn', () => {
    const s = fire(scenario({ p0d0: [7, 2, 6] }), 7, 4);
    expect(s.barriers).toEqual([{ r: 7, c: 4, owner: 0 }]);
    expect(s.turn.actionsLeft).toBe(3);
    expect(offered(s, 'move').some((a) => 'die' in a && a.die === 'p0d0')).toBe(true);
    expect(offered(s, 'ability')).toEqual([]);
    // After a move too.
    const moved = apply(scenario({ p0d0: [7, 2, 6] }), { type: 'move', die: 'p0d0', to: { r: 7, c: 3 } });
    expect(offered(moved, 'ability').length).toBeGreaterThan(0);
  });

  it('blocks every move into or through its space', () => {
    const s0 = scenario({ p0d0: [7, 6, 6], p0d1: [7, 2, 3] });
    const reach = (s: GameState, id: string) => cells([...moveOptions(s, id).moves.values()].map((m) => m.cell));
    expect(reach(s0, 'p0d1')).toEqual(expect.arrayContaining(['7,4', '7,5']));
    const s = fire(s0, 7, 4);
    expect(reach(s, 'p0d1')).not.toContain('7,4');
    expect(reach(s, 'p0d1')).not.toContain('7,5');
    // The Wisp's own way along the row is shut too.
    expect(reach(s, 'p0d0')).not.toContain('7,4');
  });

  it('blocks shots, and its own line', () => {
    // A Sniper at (7,6) has the enemy at (7,2) in its sights until the Wisp at (2,5) fires a barrier down to (7,5).
    const s0 = scenario({ p0d0: [2, 5, 6], p0d1: [7, 6, 5], p1d0: [7, 2, 3] });
    expect(shootTargets(s0, at(s0, 'p0d1')).map((d) => d.id)).toEqual(['p1d0']);
    const s = fire(s0, 7, 5);
    expect(shootTargets(s, at(s, 'p0d1')).map((d) => d.id)).toEqual([]);
    // Nor does a barrier fly past one.
    expect(cells(barrierTargets(scenario({ p0d0: [2, 5, 6] }), at(scenario({ p0d0: [2, 5, 6] }), 'p0d0')))).toContain('7,5');
    const blocked = fire(scenario({ p0d0: [2, 5, 6] }), 5, 5);
    expect(cells(barrierTargets(blocked, at(blocked, 'p0d0')))).not.toContain('7,5');
  });

  it('flies over an Ice Tunnel but doesn’t land on one, as Barricade’s don’t', () => {
    const s = scenario({ p0d0: [7, 2, 6] });
    s.tunnels = [
      { r: 7, c: 3 },
      { r: 12, c: 2 },
    ];
    const targets = cells(barrierTargets(s, at(s, 'p0d0')));
    expect(targets).not.toContain('7,3');
    expect(targets).not.toContain('12,2');
    expect(targets).toContain('7,4');
  });

  it('holds a perimeter space: nothing drops there', () => {
    // A perimeter space player 0 may drop into, and a space next to it for the Wisp to fire from.
    let found: [GameState, { r: number; c: number }] | undefined;
    for (const p of dropTargets(scenario({}), 0))
      for (const q of adjacent(BASE.regolith.board, p)) {
        const s0 = scenario({ p0d0: [q.r, q.c, 6] });
        if (!found && s0.board.cells[q.r][q.c].kind === 'space' && cells(dropTargets(s0, 0)).includes(`${p.r},${p.c}`)) found = [s0, p];
      }
    expect(found).toBeDefined();
    const [s0, p] = found!;
    expect(objectivesAround(s0.board, p).length).toBeGreaterThan(0);
    const s = fire(s0, p.r, p.c);
    expect(cells(dropTargets(s, 0))).not.toContain(`${p.r},${p.c}`);
  });

  it('stays for good: nothing can attack or remove it', () => {
    const s = fire(scenario({ p0d0: [7, 2, 6], p1d0: [7, 5, 1] }), 7, 3);
    const next = apply(apply(s, { type: 'endTurn' }), { type: 'endTurn' });
    expect(next.barriers).toEqual(s.barriers);
    expect(legalActions(s).some((a) => 'to' in a && typeof a.to === 'object' && a.to?.r === 7 && a.to.c === 3)).toBe(false);
  });

  it('only the 6, the Wisp, fires barriers', () => {
    expect(offered(scenario({ p0d0: [7, 2, 4] }), 'ability')).toEqual([]);
    expect(() => fire(scenario({ p0d0: [7, 2, 4] }), 7, 4)).toThrow(/no such ability/);
  });
});

describe('breaking barriers (on trial: RuleSet.breakBarriers)', () => {
  /** p0's `dice` with an opponent's barrier on (r, c), and the rule set to `rule` while `check` runs. */
  const trial = (
    rule: BarrierBreakRule | undefined,
    dice: Record<string, [number, number, number]>,
    [r, c]: [number, number],
    check: (s: GameState) => void,
  ) => {
    const s = scenario(dice);
    s.barriers = [{ r, c, owner: 1 }];
    const rules = rulesOf(s);
    const was = rules.breakBarriers;
    rules.breakBarriers = rule;
    try {
      check(s);
    } finally {
      rules.breakBarriers = was;
    }
  };
  const breaks = (s: GameState) =>
    offered(s, 'breakBarrier').map((a) => (a.type === 'breakBarrier' ? `${a.die}>${a.cell.r},${a.cell.c}` : ''));

  it('is off as the rules are', () => {
    trial(undefined, { p0d0: [7, 3, 3] }, [7, 4], (s) => expect(breaks(s)).toEqual([]));
  });

  it('smash: a mech next to a barrier breaks it as its action, and stays put', () => {
    trial('smash', { p0d0: [7, 2, 3] }, [7, 4], (s) => expect(breaks(s)).toEqual([]));
    trial('smash', { p0d0: [7, 3, 3] }, [7, 4], (s) => {
      expect(breaks(s)).toEqual(['p0d0>7,4']);
      const next = apply(s, { type: 'breakBarrier', die: 'p0d0', cell: { r: 7, c: 4 } });
      expect(next.barriers).toEqual([]);
      expect(next.turn.actionsLeft).toBe(s.turn.actionsLeft - 1);
      expect(at(next, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 3 });
      expect(offered(next, 'move').some((a) => 'die' in a && a.die === 'p0d0')).toBe(false);
    });
  });

  it('attack: a mech moves up to the barrier and breaks it; a Sniper shoots it', () => {
    trial('attack', { p0d0: [7, 2, 3] }, [7, 4], (s) => {
      const next = apply(s, { type: 'breakBarrier', die: 'p0d0', cell: { r: 7, c: 4 } });
      expect(next.barriers).toEqual([]);
      expect(at(next, 'p0d0').loc).toEqual({ zone: 'board', r: 7, c: 3 });
    });
    trial('attack', { p0d0: [2, 5, 5] }, [7, 5], (s) => {
      const next = apply(s, { type: 'breakBarrier', die: 'p0d0', cell: { r: 7, c: 5 } });
      expect(next.barriers).toEqual([]);
      expect(at(next, 'p0d0').loc).toEqual({ zone: 'board', r: 2, c: 5 });
    });
    // Out of a Tactician's reach down the same column.
    trial('attack', { p0d0: [2, 5, 3] }, [7, 5], (s) => expect(breaks(s)).toEqual([]));
  });
});

describe('contested perimeter', () => {
  /** p0's mechs making a free objective's number in its perimeter, and `enemy` (p1's mech) in another of its spaces or beside the perimeter. */
  const siege = (enemy: 'perimeter' | 'outside' | 'none' = 'perimeter') => {
    const base = BASE.regolith;
    const objective = base.board.objectives.find((q) => !q.start && !q.cubes.length)!;
    const [a, b, c] = perimeterSpaces(base.board, objective);
    const placed: Record<string, [number, number, number]> = { p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, objective.number - 6] };
    if (enemy === 'perimeter') placed.p1d0 = [c.r, c.c, 3];
    if (enemy === 'outside') {
      // A space next to the perimeter but not in it (another objective's perimeter).
      const g = grid(base.board);
      const onPerimeter = (q: { r: number; c: number }) => perimeterSpaces(base.board, objective).some((o) => o.r === q.r && o.c === q.c);
      const near = g.cells.find((q, i) => g.space[i] && !onPerimeter(q) && g.orthoCells[i].some(onPerimeter))!;
      placed.p1d0 = [near.r, near.c, 3];
    }
    return { s: scenario(placed), objective: objective.id };
  };

  it('stops a claim while an enemy mech is on the perimeter, though the sum is made', () => {
    const { s, objective } = siege();
    const check = claimCheck(s, 0, objective);
    expect(check).toMatchObject({ ok: false, blocked: true, sum: s.board.objectives[objective].number });
    expect(offered(s, 'claim')).toEqual([]);
    expect(tryApply(s, { type: 'claim', objective })).toBeNull();
  });

  it('lets it go ahead once the perimeter is clear, or with the enemy mech beside the perimeter', () => {
    for (const enemy of ['none', 'outside'] as const) {
      const { s, objective } = siege(enemy);
      expect(claimCheck(s, 0, objective).ok, enemy).toBe(true);
      expect(offered(s, 'claim'), enemy).toContainEqual({ type: 'claim', objective });
    }
  });

  it('never blocks a player’s own mechs, nor Take Over', () => {
    const { s, objective } = siege();
    expect(claimCheck(s, 1, objective)).not.toMatchObject({ blocked: true });
    expect(infamyTargets(s, 0).map((p) => p.id)).toContain(objective);
  });

  it('names the blockade when the sum is short too', () => {
    const { s, objective } = siege();
    s.dice.find((d) => d.id === 'p0d1')!.value++;
    const check = claimCheck(s, 0, objective);
    expect(check.blocked).toBeUndefined();
    expect(check.reason).toMatch(/needs .*enemy mechs on the perimeter block it too \(3\)/);
  });

  it('on off-centre maps, an enemy on a space two perimeters share blocks both objectives', () => {
    for (const map of ['twin-drift']) {
      const base = quickStart(2, 1, 'regolith', map);
      const shared = base.board.objectives
        .flatMap((p) => perimeterSpaces(base.board, p))
        .find((c) => objectivesAround(base.board, c).length > 1)!;
      const objectives = objectivesAround(base.board, shared);
      expect(objectives.length, map).toBe(2);
      for (const objective of objectives) {
        const [a, b] = perimeterSpaces(base.board, objective).filter((c) => c.r !== shared.r || c.c !== shared.c);
        const s = arrange(base, { p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, objective.number - 6], p1d0: [shared.r, shared.c, 2] });
        s.board.objectives[objective.id].cubes = [];
        expect(claimCheck(s, 0, objective.id).blocked, `${map}, objective ${objective.number}`).toBe(true);
      }
    }
  });

  it('blocks over-claim too, when that is on', () => {
    const base = BASE.regolith;
    const objective = base.board.objectives.find((q) => !q.start && q.capacity >= 2)!;
    const [a, b, c] = perimeterSpaces(base.board, objective);
    const s = scenario({ p0d0: [a.r, a.c, 6], p0d1: [b.r, b.c, 6], p1d0: [c.r, c.c, 3] });
    s.board.objectives[objective.id].cubes = Array(objective.capacity).fill(1);
    const rules = rulesOf(s) as { overClaim?: boolean };
    const was = rules.overClaim;
    rules.overClaim = true;
    try {
      expect(offered(s, 'claim')).toEqual([]);
      at(s, 'p1d0').loc = { zone: 'salvageYard' };
      expect(offered(s, 'claim')).toEqual([{ type: 'claim', objective: objective.id, replace: 1 }]);
    } finally {
      rules.overClaim = was;
    }
  });
});

describe('dropping to a contested objective', () => {
  const drops = (s: GameState) => offered(s, 'drop').map((a) => (a.type === 'drop' ? `${a.to.r},${a.to.c}` : ''));
  const ring = (s: GameState, objective: { id: number }) =>
    perimeterSpaces(s.board, s.board.objectives[objective.id]).map((c) => `${c.r},${c.c}`);
  const into = (s: GameState, objective: { id: number }) => new Set(drops(s).filter((c) => ring(s, objective).includes(c))).size;
  /** Player 0's starting objective (its home, where there is a home objective). */
  const home = () => BASE.regolith.board.objectives.find((q) => q.start && q.cubes.includes(0))!;
  /** Player 0 with a cube on a second objective away from home (sharing no perimeter space with it), `mechs` placed, and `enemy` in that objective's perimeter. */
  const colony = (enemy = true, mechs: Record<string, [number, number, number]> = {}) => {
    const base = BASE.regolith;
    const homeRing = ring(base, home());
    const objective = base.board.objectives.find((q) => !q.start && !ring(base, q).some((c) => homeRing.includes(c)))!;
    const [a] = perimeterSpaces(base.board, objective);
    const s = scenario(enemy ? { ...mechs, p1d0: [a.r, a.c, 6] } : mechs);
    s.board.objectives[objective.id].cubes = [0];
    return { s, objective };
  };

  it('keeps a player out of the perimeter of their objective while an enemy mech is in it', () => {
    const { s, objective } = colony();
    expect(into(s, objective)).toBe(0);
    expect(tryApply(s, { type: 'drop', die: 'p0d0', to: perimeterSpaces(s.board, objective)[1] })).toBeNull();
    at(s, 'p1d0').loc = { zone: 'salvageYard' };
    expect(into(s, objective)).toBeGreaterThan(0);
  });

  it('is never stopped by a player’s own mechs on the perimeter', () => {
    const base = BASE.regolith;
    const homeRing = ring(base, home());
    const objective = base.board.objectives.find((q) => !q.start && !ring(base, q).some((c) => homeRing.includes(c)))!;
    const [a] = perimeterSpaces(base.board, objective);
    const { s } = colony(false, { p0d1: [a.r, a.c, 6] });
    expect(into(s, objective)).toBeGreaterThan(0);
  });

  it('keeps Infiltration out of a contested perimeter too', () => {
    const base = BASE.regolith;
    const objective = base.board.objectives.find((q) => !q.cubes.includes(0))!;
    const [a] = perimeterSpaces(base.board, objective);
    const s = scenario({ p1d0: [a.r, a.c, 6] }, ['r-infiltration']);
    expect(dropTargets(s, 0).some((c) => ring(s, objective).includes(`${c.r},${c.c}`))).toBe(false);
  });

  it('knows each player’s home: the starting objective they chose', () => {
    const s = structuredClone(BASE.regolith);
    const mine = homeObjective(s, 0)!;
    expect(mine.start).toBe(true);
    expect(mine.cubes).toContain(0);
    expect(homeObjective(s, 1)).not.toBe(mine);
  });

  describe('a home moves with the last cube on it', () => {
    const elsewhere = (s: GameState) => s.board.objectives.find((q) => !q.start && !q.cubes.length)!;

    it('to another of their objectives when over-claim displaces it, or nowhere', () => {
      const s = structuredClone(BASE.regolith);
      const home = homeObjective(s, 0)!.id;
      const other = elsewhere(s).id;
      s.board.objectives[other].cubes.push(0);
      s.board.objectives[home].cubes = [];
      cubeLeft(s, 0, home);
      expect(homeObjective(s, 0)!.id).toBe(other);
      s.board.objectives[other].cubes = [];
      cubeLeft(s, 0, other);
      expect(homeObjective(s, 0)).toBeUndefined();
    });
  });

  it('a home objective stays open while contested, so a player is never shut out', () => {
    const objective = home();
    const [a] = perimeterSpaces(BASE.regolith.board, objective);
    // Player 0 holds only its home, its whole fleet is in the salvage yard, and an enemy sits in that perimeter.
    const s = scenario({ p1d0: [a.r, a.c, 6] });
    for (const q of s.board.objectives) q.cubes = q.cubes.filter((x) => x !== 0 || q.id === objective.id);
    expect(into(s, objective)).toBe(ring(s, objective).length - 1);
  });

  it('a home objective doesn’t open a player’s other objectives, nor a rival’s home', () => {
    const { s, objective } = colony();
    expect(into(s, objective)).toBe(0);
    const theirs = homeObjective(s, 1)!;
    expect(claimCheck(s, 0, theirs.id).ok).toBe(false);
  });
});

describe.runIf(REGOLITH_OVER_CLAIM)('over-claim', () => {
  it('needs a sum of 12 and displaces a chosen opponent cube', () => {
    const base = scenario({});
    const objective = base.board.objectives.find((q) => q.cubes.length === 0)!;
    const target = 12;
    const spots = perimeterSpaces(base.board, objective);
    const values: number[] = [];
    for (let left = target; left > 0; left -= values[values.length - 1]) values.push(Math.min(6, left));
    const placed: Record<string, [number, number, number]> = {};
    values.forEach((v, i) => (placed[`p0d${i}`] = [spots[i].r, spots[i].c, v]));
    const s = scenario(placed);
    const p = s.board.objectives[objective.id];
    while (objectiveFreeSlots(p) > 0) p.cubes.push(1);
    const check = claimCheck(s, 0, p.id);
    expect(check.target).toBe(target);
    expect(check.ok).toBe(true);
    expect(check.replace).toEqual([1]);
    const before = s.players[1].cubesLeft;
    const after = apply(s, { type: 'claim', objective: p.id, replace: 1 });
    expect(after.players[1].cubesLeft).toBe(before + 1);
    expect(after.board.objectives[objective.id].cubes.filter((c) => c === 0)).toHaveLength(1);
    expect(after.board.objectives[objective.id].cubes.filter((c) => c === 1)).toHaveLength(p.cubes.length - 1);
  });
  it('is also offered on an objective with room, next to a plain claim', () => {
    const base = scenario({});
    const objective = base.board.objectives.find((q) => q.capacity >= 2)!;
    const spots = perimeterSpaces(base.board, objective);
    const values: number[] = [];
    for (let left = 12; left > 0; left -= values[values.length - 1]) values.push(Math.min(6, left));
    const placed: Record<string, [number, number, number]> = {};
    values.forEach((v, i) => (placed[`p0d${i}`] = [spots[i].r, spots[i].c, v]));
    const s = scenario(placed);
    const p = s.board.objectives[objective.id];
    p.cubes = [1];
    expect(objectiveFreeSlots(p)).toBeGreaterThan(0);
    expect(claimCheck(s, 0, p.id).ok).toBe(false);
    expect(claimCheck(s, 0, p.id, true).ok).toBe(true);
    expect(legalActions(s)).toContainEqual({ type: 'claim', objective: p.id, replace: 1 });
    const after = apply(s, { type: 'claim', objective: p.id, replace: 1 });
    expect(after.board.objectives[objective.id].cubes).toEqual([0]);
  });
});

describe('Science: Research spent to move the claim total', () => {
  const base = scenario({});
  const objective = base.board.objectives.find((q) => !q.start && !q.cubes.length && q.number > 6)!;
  const [o1, o2] = perimeterSpaces(base.board, objective);
  const short = (research: number) => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6] }, ['r-science']);
    s.players[0].research = research;
    return s;
  };

  it('adds the Research needed, and only that', () => {
    const gap = objective.number - 6;
    const s = short(6);
    expect(claimCheck(s, 0, objective.id)).toMatchObject({ ok: true, research: gap });
    const after = apply(s, { type: 'claim', objective: objective.id });
    expect(after.players[0].research).toBe(6 - gap);
    expect(after.log.at(-1)?.text).toMatch(`spending ${gap} research`);
  });

  it('can’t spend the die’s lowest face', () => {
    expect(claimCheck(short(objective.number - 6), 0, objective.id).ok).toBe(false);
    expect(claimCheck(short(objective.number - 5), 0, objective.id).ok).toBe(true);
  });

  it('subtracts from a perimeter over the target', () => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6], p0d1: [o2.r, o2.c, 6] }, ['r-science']);
    s.players[0].research = 6;
    expect(claimCheck(s, 0, objective.id)).toMatchObject({ ok: true, research: 12 - objective.number });
  });

  it('spends nothing when the mechs make the total', () => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6], p0d1: [o2.r, o2.c, objective.number - 6] }, ['r-science']);
    s.players[0].research = 5;
    expect(claimCheck(s, 0, objective.id).research).toBeUndefined();
    expect(apply(s, { type: 'claim', objective: objective.id }).players[0].research).toBe(5);
  });

  it('never stops an exact total, even with no Research at all', () => {
    const s = scenario({ p0d0: [o1.r, o1.c, 6], p0d1: [o2.r, o2.c, objective.number - 6] }, ['r-science']);
    s.players[0].research = 0;
    expect(claimCheck(s, 0, objective.id).ok).toBe(true);
  });
});

describe('Barricade tactic card (Regolith)', () => {
  it('is a tactic card in the Regolith deck with 2 copies', () => {
    const cardDef = REGOLITH_DECKS.tactics.find((c) => c.id === 'r-barricade');
    expect(cardDef).toBeDefined();
    expect(cardDef!.name).toBe('Barricade');
    expect(cardDef!.text).toBe('Place two barriers.');
    expect(cardDef!.count).toBe(2);
    expect(cardDef!.category).toBe('movement');
    expect(cardDef!.status).toBe('new');
    expect(cardDef!.effect).toBe('barricade');
    expect(cardKind('r-barricade')).toBe('tactic');
  });

  it('playing the card asks to place two barriers on empty spaces', () => {
    let s = scenario({ p0d0: [7, 2, 6], p1d0: [7, 6, 5] });
    const me = s.turn.player;
    toRow(s, 'tactic', 'r-barricade');
    s.pending.unshift({ kind: 'takeCard', player: me, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    expect(s.pending[0]).toMatchObject({ kind: 'placeBarrier', player: me, placed: [] });
    const legal = legalActions(s);
    expect(legal.every((a) => a.type === 'placeBarrier')).toBe(true);
    // Cannot place on objectives
    const objective = s.board.objectives[0];
    expect(legal).not.toContainEqual({ type: 'placeBarrier', cell: { r: objective.r, c: objective.c } });
    expect(() => apply(s, { type: 'placeBarrier', cell: { r: objective.r, c: objective.c } })).toThrow(/Barriers go on spaces/);
    // Cannot place on an occupied space (mech)
    expect(legal).not.toContainEqual({ type: 'placeBarrier', cell: { r: 7, c: 2 } });
    expect(() => apply(s, { type: 'placeBarrier', cell: { r: 7, c: 2 } })).toThrow(/Barriers go on empty spaces/);

    // Place the first barrier on (8, 3)
    s = apply(s, { type: 'placeBarrier', cell: { r: 8, c: 3 } });
    expect(s.barriers).toEqual([{ r: 8, c: 3, owner: me }]);
    expect(s.pending[0]).toMatchObject({ kind: 'placeBarrier', player: me, placed: [{ r: 8, c: 3 }] });

    // Cannot place second barrier on the same space
    expect(legalActions(s)).not.toContainEqual({ type: 'placeBarrier', cell: { r: 8, c: 3 } });
    expect(() => apply(s, { type: 'placeBarrier', cell: { r: 8, c: 3 } })).toThrow(/Barriers go on empty spaces/);

    // Place the second barrier on (8, 4)
    s = apply(s, { type: 'placeBarrier', cell: { r: 8, c: 4 } });
    expect(s.barriers).toEqual([
      { r: 8, c: 3, owner: me },
      { r: 8, c: 4, owner: me },
    ]);
    expect(s.pending).toHaveLength(0);

    // The barriers now block moves through those spaces
    expect(isEmptySpace(s, { r: 8, c: 3 })).toBe(false);
    expect(isEmptySpace(s, { r: 8, c: 4 })).toBe(false);
  });
});

describe('Kinetic Shunt tactic card (Regolith)', () => {
  it('is a tactic card in the Regolith deck with 2 copies', () => {
    const cardDef = REGOLITH_DECKS.tactics.find((c) => c.id === 'r-kinetic-shunt');
    expect(cardDef).toBeDefined();
    expect(cardDef!.name).toBe('Kinetic Shunt');
    expect(cardDef!.subtitle).toBe('Push any mech or barrier 4 spaces');
    expect(cardDef!.text).toBe('Choose any mech or barrier. Push it up to 4 spaces in a straight line.');
    expect(cardDef!.count).toBe(2);
    expect(cardDef!.category).toBe('movement');
    expect(cardDef!.status).toBe('new');
    expect(cardDef!.effect).toBe('kinetic-shunt');
    expect(cardKind('r-kinetic-shunt')).toBe('tactic');
  });

  it('playing the card asks to choose a mech and pushes it up to 4 spaces in a straight line', () => {
    let s = scenario({ p0d0: [7, 2, 6], p1d0: [4, 4, 5] });
    const me = s.turn.player;
    toRow(s, 'tactic', 'r-kinetic-shunt');
    s.pending.unshift({ kind: 'takeCard', player: me, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    expect(s.pending[0]).toMatchObject({ kind: 'kineticShunt', player: me });
    const legal = legalActions(s);
    expect(legal.every((a) => a.type === 'kineticShunt')).toBe(true);

    // Can target own or enemy mechs
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p0d0')).toBe(true);
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p1d0')).toBe(true);

    // Cannot push into an occupied space or objective or non-straight line
    const objective = s.board.objectives[0];
    expect(legal).not.toContainEqual({ type: 'kineticShunt', die: 'p0d0', to: { r: objective.r, c: objective.c } });
    expect(() => apply(s, { type: 'kineticShunt', die: 'p0d0', to: { r: objective.r, c: objective.c } })).toThrow(
      /Not a valid push destination/,
    );

    // Push p1d0 along its row: from (4,4), (4,5) is empty (+1), (4,6) (+2), (4,7) (+3) and (4,8) (+4)
    const canPushTo = shuntTargets(s, at(s, 'p1d0'));
    expect(canPushTo).toContainEqual({ r: 4, c: 5 });
    expect(canPushTo).toContainEqual({ r: 4, c: 6 });
    expect(canPushTo).toContainEqual({ r: 4, c: 8 });

    // Apply the push to (4, 8)
    s = apply(s, { type: 'kineticShunt', die: 'p1d0', to: { r: 4, c: 8 } });
    expect(at(s, 'p1d0').loc).toEqual({ zone: 'board', r: 4, c: 8 });
    expect(s.pending).toHaveLength(0);
  });

  it('can push a barrier up to 4 spaces in a straight line, but not onto a mech, a barrier or the far side of one', () => {
    let s = scenario({ p0d0: [7, 2, 6], p1d0: [4, 4, 5] });
    s.barriers = [{ r: 6, c: 6, owner: null }];
    s.pending.unshift({ kind: 'kineticShunt', player: s.turn.player });
    const to = (r: number, c: number) => ({ type: 'shuntBarrier', from: { r: 6, c: 6 }, to: { r, c } });
    const pushes = legalActions(s).filter((a) => a.type === 'shuntBarrier');
    expect(pushes.length).toBeGreaterThan(0);
    for (const a of pushes) expect(barrierShuntTargets(s, { r: 6, c: 6 })).toContainEqual(a.to);
    expect(() => apply(s, to(4, 4) as never)).toThrow(/Not a valid push destination/);
    const dest = pushes[0].type === 'shuntBarrier' ? pushes[0].to : { r: 0, c: 0 };
    s = apply(s, { type: 'shuntBarrier', from: { r: 6, c: 6 }, to: dest });
    expect(s.barriers).toEqual([{ ...dest, owner: null }]);
    expect(s.pending).toHaveLength(0);
  });

  it('can push an enemy mech off an objective perimeter to break contested perimeter', () => {
    const base = BASE.regolith;
    const objective = base.board.objectives.find((q) => !q.start && !q.cubes.length)!;
    const [o1, , o3] = perimeterSpaces(base.board, objective);
    let s = scenario({ p0d0: [o1.r, o1.c, objective.number], p1d0: [o3.r, o3.c, 6] });
    expect(claimCheck(s, 0, objective.id).blocked).toBe(true);
    expect(claimCheck(s, 0, objective.id).ok).toBe(false);

    // Play Kinetic Shunt to shove enemy off the perimeter
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const target = shuntTargets(s, at(s, 'p1d0')).find(
      (c) => !perimeterSpaces(s.board, objective).some((p) => p.r === c.r && p.c === c.c),
    )!;
    expect(target).toBeDefined();

    s = apply(s, { type: 'kineticShunt', die: 'p1d0', to: target });
    expect(at(s, 'p1d0').loc).toEqual({ zone: 'board', r: target.r, c: target.c });

    // Now contested perimeter is cleared and claim is allowed!
    expect(claimCheck(s, 0, objective.id).blocked).toBeUndefined();
    expect(claimCheck(s, 0, objective.id).ok).toBe(true);
  });

  it('logs "their" when pushing a friendly mech and auto-resolves when no mechs can be shunted', () => {
    let s = scenario({ p0d0: [4, 4, 3] });
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });

    const target = shuntTargets(s, at(s, 'p0d0'))[0];
    s = apply(s, { type: 'kineticShunt', die: 'p0d0', to: target });
    expect(s.log[s.log.length - 1].text).toMatch(/pushes their Tactician/);

    // If kineticShunt is pending but no mechs are on board, settle auto-resolves it
    s.dice.forEach((d) => (d.loc = { zone: 'salvageYard' }));
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    settle(s);
    expect(s.pending.some((p) => p.kind === 'kineticShunt')).toBe(false);
  });

  it('can push mechs through an ice tunnel and out the other side', () => {
    let s = scenario({ p0d0: [7, 2, 3] });
    const tunnelA = { r: 7, c: 3 };
    const tunnelB = { r: 2, c: 5 };
    s.tunnels = [tunnelA, tunnelB];

    // p0d0 is at (7,2). Pushing along the row reaches Tunnel A (7,3) in 1 space.
    // Traversing to Tunnel B (2,5) is step 2.
    // Continuing along the row from Tunnel B: (2,6) is step 3.
    const targets = shuntTargets(s, at(s, 'p0d0'));
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining(tunnelA),
        expect.objectContaining(tunnelB),
        expect.objectContaining({ r: 2, c: 6 }),
        expect.objectContaining({ r: 7, c: 4 }),
      ]),
    );

    // Apply push through the ice tunnel
    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    s = apply(s, { type: 'kineticShunt', die: 'p0d0', to: { r: 2, c: 6 } });
    expect(at(s, 'p0d0').loc).toEqual({ zone: 'board', r: 2, c: 6 });
    // In the engine's words: the UI shows it as an ice tunnel.
    expect(s.log[s.log.length - 1].text).toMatch(/pushes their Tactician.*through an ice tunnel/);

    // A straight push says nothing of the tunnels, even with a pair on the map.
    const straight = scenario({ p0d0: [7, 2, 3] });
    straight.tunnels = [tunnelA, tunnelB];
    straight.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const pushed = apply(straight, { type: 'kineticShunt', die: 'p0d0', to: { r: 8, c: 2 } });
    expect(pushed.log[pushed.log.length - 1].text).not.toMatch(/ice tunnel/);

    // If Tunnel B is blocked by an enemy mech, pushing through the tunnel is blocked
    const blocked = scenario({ p0d0: [7, 2, 3], p1d0: [2, 5, 6] });
    blocked.tunnels = [tunnelA, tunnelB];
    const blockedTargets = shuntTargets(blocked, at(blocked, 'p0d0'));
    expect(blockedTargets).toContainEqual(expect.objectContaining(tunnelA));
    expect(blockedTargets).not.toContainEqual(expect.objectContaining(tunnelB));
    expect(blockedTargets).not.toContainEqual(expect.objectContaining({ r: 2, c: 6 }));
  });

  it('Hex board: mechs can be shunted along all 6 hexagonal directions', () => {
    const s = quickStart(2, 42, 'regolith', 'alpha-hex');
    const hexSpaces = spaces(s.board);
    const candidate = hexSpaces.find((c) => {
      const targets = shuntTargets(s, { id: 'test', owner: 0, value: 3, loc: { zone: 'board', r: c.r, c: c.c }, rolls: 0 });
      return targets.length >= 6;
    })!;

    const placed = arrange(s, { p0d0: [candidate.r, candidate.c, 3] });
    const targets = shuntTargets(placed, at(placed, 'p0d0'));
    expect(targets.length).toBeGreaterThanOrEqual(6);

    placed.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const target = targets[0];
    const next = apply(placed, { type: 'kineticShunt', die: 'p0d0', to: target });
    expect(at(next, 'p0d0').loc).toEqual({ zone: 'board', r: target.r, c: target.c });
  });

  it('Obstacles: mechs and barriers block shunt paths cleanly', () => {
    const s = scenario({ p0d0: [7, 2, 3], p1d0: [7, 4, 6] });
    s.barriers = [{ r: 5, c: 2, owner: 1 }];

    const targets = shuntTargets(s, at(s, 'p0d0'));
    expect(targets).toContainEqual(expect.objectContaining({ r: 7, c: 3 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 7, c: 4 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 7, c: 5 }));

    expect(targets).toContainEqual(expect.objectContaining({ r: 6, c: 2 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 5, c: 2 }));
    expect(targets).not.toContainEqual(expect.objectContaining({ r: 4, c: 2 }));
  });

  it('Boxed-in mech: a mech with 0 valid shunt destinations is not in legal actions', () => {
    // (0,5) at the top of the map: an objective below, the edge above, an enemy and a barrier at its sides.
    const s = scenario({
      p0d0: [0, 5, 3],
      p1d0: [0, 6, 6],
      p0d1: [7, 4, 2],
    });
    s.barriers = [{ r: 1, c: 4, owner: 1 }];

    expect(shuntTargets(s, at(s, 'p0d0'))).toHaveLength(0);
    expect(shuntTargets(s, at(s, 'p0d1')).length).toBeGreaterThan(0);

    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const legal = legalActions(s);
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p0d1')).toBe(true);
    expect(legal.some((a) => a.type === 'kineticShunt' && a.die === 'p0d0')).toBe(false);
  });

  it('All mechs boxed in: Kinetic Shunt pushes a barrier instead of stalling the game', () => {
    let s = scenario({ p0d0: [0, 5, 3] });
    s.barriers = [
      { r: 0, c: 6, owner: 0 },
      { r: 1, c: 4, owner: 0 },
    ];

    expect(shuntTargets(s, at(s, 'p0d0'))).toHaveLength(0);

    toRow(s, 'tactic', 'r-kinetic-shunt');
    s.pending.unshift({ kind: 'takeCard', player: 0, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0 });

    expect(s.pending[0]).toMatchObject({ kind: 'kineticShunt' });
    expect(legalActions(s).every((a) => a.type === 'shuntBarrier')).toBe(true);
  });

  it('Player can shunt friendly mech onto perimeter to claim objective', () => {
    const base = quickStart(2, 10, 'regolith');
    const objective = base.board.objectives.find((q) => !q.start && !q.cubes.length)!;
    const [o1, o2] = perimeterSpaces(base.board, objective);

    const deltaR = o2.r - objective.r;
    const deltaC = o2.c - objective.c;
    const startR = o2.r + deltaR * 2;
    const startC = o2.c + deltaC * 2;

    let s = scenario({ p0d0: [o1.r, o1.c, 5], p0d1: [startR, startC, 3] });
    const p = s.board.objectives.find((x) => x.id === objective.id)!;
    p.number = 8;

    expect(claimCheck(s, 0, p.id).ok).toBe(false);

    s.pending.unshift({ kind: 'kineticShunt', player: 0 });
    const targets = shuntTargets(s, at(s, 'p0d1'));
    expect(targets).toContainEqual(expect.objectContaining(o2));

    s = apply(s, { type: 'kineticShunt', die: 'p0d1', to: o2 });
    expect(at(s, 'p0d1').loc).toEqual({ zone: 'board', r: o2.r, c: o2.c });
    expect(claimCheck(s, 0, p.id).ok).toBe(true);
  });

  it('Strategic Plan: storing Kinetic Shunt and playing it later as stored tactic works', () => {
    let s = scenario({ p0d0: [7, 2, 3], p1d0: [4, 4, 4] }, ['r-strategic-plan']);

    toRow(s, 'tactic', 'r-kinetic-shunt');
    s.pending.unshift({ kind: 'takeCard', player: 0, count: 1 });
    s = apply(s, { type: 'takeCard', deck: 'tactic', index: 0, store: true });

    expect(s.players[0].storedTactics).toContain('r-kinetic-shunt');
    expect(s.pending).toHaveLength(0);

    s = apply(s, { type: 'playStoredTactic', card: 'r-kinetic-shunt' });
    expect(s.pending[0]).toMatchObject({ kind: 'kineticShunt', player: 0 });

    s = apply(s, { type: 'kineticShunt', die: 'p1d0', to: { r: 4, c: 6 } });
    expect(at(s, 'p1d0').loc).toEqual({ zone: 'board', r: 4, c: 6 });
    expect(s.pending).toHaveLength(0);
  });

  it('Ice Tunnel / Ice Tunnel: starting on Tunnel A allows choosing any direction out of Tunnel B', () => {
    const s = scenario({ p0d0: [7, 3, 3] });
    const tunnelA = { r: 7, c: 3 };
    const tunnelB = { r: 2, c: 5 };
    s.tunnels = [tunnelA, tunnelB];

    const targets = shuntTargets(s, at(s, 'p0d0'));
    expect(targets).toContainEqual(expect.objectContaining(tunnelB));
    expect(targets).toContainEqual(expect.objectContaining({ r: 2, c: 6 }));
    expect(targets).toContainEqual(expect.objectContaining({ r: 2, c: 4 }));
    expect(targets).toContainEqual(expect.objectContaining({ r: 3, c: 5 }));
    expect(targets).toContainEqual(expect.objectContaining({ r: 7, c: 2 }));
    expect(targets).toContainEqual(expect.objectContaining({ r: 7, c: 4 }));
  });
});
