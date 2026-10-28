/**
 * Basic mode, rule by rule. Regolith's rules start from the 2013 FunForge rulebook, and the page numbers here are its printed ones; Basic is Regolith with the cards
 * left out (docs/regolith/PROTOTYPING.md). The 5 and 6, the movement cap, zones of control and
 * contested orbits are pinned in regolith.test.ts.
 *
 * Scenarios run on Alpha Sector (hex), the basic map for 2 players, in axial cells (docs/HEX.md): a
 * space's sides are a row or column away, or (-1, +1) and (+1, -1). Planets, by id, each orbited by
 * the six spaces of its tile:
 *
 *    id0 (1,5) 7*   id1 (4,3) 7   id2 (3,6) 7   id3 (7,1) 7   id4 (6,4) 8
 *    id5 (5,7) 7    id6 (9,2) 7   id7 (8,5) 7   id8 (11,3) 7*
 *
 * Row 7 runs clear from (7,2) to (7,6); id4's orbit is (5,4), (5,5), (6,3), (6,5), (7,3) and (7,4).
 */
import { describe, expect, it } from 'vitest';
import {
  apply,
  carryOptions,
  conquerCheck,
  createGame,
  infamyTargets,
  legalActions,
  moveOptions,
  type Action,
  type Cell,
  type GameState,
} from '../src';
import { finishSetup, players, quickStart } from './helpers';

const BASE = quickStart(2, 1, 'basic');

/**
 * A focused position: player 0 to act with 3 fresh actions, only the listed ships on the map
 * (everything else in the scrapyard, reserves untouched) and only the listed cubes placed.
 */
function scenario(dice: Record<string, [number, number, number]>, cubes: Record<number, number[]> = { 2: [0], 6: [1] }): GameState {
  const s = structuredClone(BASE);
  for (const d of s.dice) if (d.loc.zone === 'board') d.loc = { zone: 'scrapyard' };
  for (const [id, [r, c, value]] of Object.entries(dice)) {
    const d = s.dice.find((x) => x.id === id)!;
    d.loc = { zone: 'board', r, c };
    d.value = value;
  }
  for (const p of s.board.planets) p.cubes = [...(cubes[p.id] ?? [])];
  for (const p of s.players) {
    p.cubesLeft = 5 - s.board.planets.reduce((a, pl) => a + pl.cubes.filter((x) => x === p.id).length, 0);
    p.dominance = 1;
  }
  s.turn = { ...s.turn, player: 0, phase: 'actions', actionsLeft: 3, moved: {}, abilityUsed: {}, seen: {}, conquests: 0, oncePerTurn: [] };
  for (const d of s.dice) s.turn.seen[d.id] = [d.value];
  return s;
}

const at = (s: GameState, id: string) => s.dice.find((d) => d.id === id)!;
const loc = (s: GameState, id: string) => at(s, id).loc;
const board = (r: number, c: number) => ({ zone: 'board', r, c });

/** Declares an attack and fixes both combat rolls. */
function attack(s: GameState, action: Action, attackerRoll: number, defenderRoll: number): GameState {
  s = apply(s, action);
  const c = s.pending[0];
  if (c?.kind !== 'combat') throw new Error('no combat');
  c.attacker.dice = [attackerRoll];
  c.defender.dice = [defenderRoll];
  return s;
}

const resolve = (s: GameState) => apply(s, { type: 'resolveCombat' });

// ---------------------------------------------------------------------------

describe('setup (p.3)', () => {
  it('uses the basic maps on hex tiles', () => {
    const numbers = (s: GameState) => s.board.planets.map((p) => (p.start ? `${p.number}*` : `${p.number}`)).join(' ');
    const game = (n: number) => createGame({ players: players(n), seed: 1, mode: 'basic' });
    expect(numbers(game(2))).toBe('7* 7 7 7 8 7 7 7 7*');
    expect(numbers(game(3))).toBe('8* 7 8 8* 8 10 7 7 8 8*');
    expect(numbers(game(4))).toBe('9* 9 8 8* 10 8* 8 9 9*');
  });

  it('gives each player 5 cubes, dominance and research at 1, 3 ships, 2 expansion ships and a missile, no cards', () => {
    const s = createGame({ players: players(2), seed: 1, mode: 'basic' });
    for (const p of s.players) {
      expect(p).toMatchObject({ cubesLeft: 5, dominance: 1, research: 1, missiles: 1, skills: [] });
      expect(s.dice.filter((d) => d.owner === p.id && d.loc.zone === 'scrapyard')).toHaveLength(3);
      expect(s.dice.filter((d) => d.owner === p.id && d.loc.zone === 'reserve')).toHaveLength(2);
    }
    expect(s.market.skillRow).toEqual([]);
    expect(s.market.tacticRow).toEqual([]);
    expect(s.market.expansions).toBe(0);
  });

  it('allows one re-roll of all 3 starting ships', () => {
    let s = createGame({ players: players(2), seed: 5, mode: 'basic' });
    s = apply(s, { type: 'setupReroll' });
    expect(() => apply(s, { type: 'setupReroll' })).toThrow(/only re-roll once/);
    expect(legalActions(s)).toEqual([{ type: 'setupKeep' }]);
  });

  it('lets the player with the lowest ship total go first', () => {
    let s = createGame({ players: players(3), seed: 5, mode: 'basic' });
    const values = [
      [6, 6, 6],
      [2, 2, 2],
      [5, 5, 5],
    ];
    for (const d of s.dice) if (d.loc.zone === 'scrapyard') d.value = values[d.owner][0];
    for (let i = 0; i < 3; i++) s = apply(s, { type: 'setupKeep' });
    expect(s.turn.player).toBe(1);
    expect(s.pending.map((p) => p.kind === 'placeStart' && p.player)).toEqual([1, 2, 0]);
  });

  it('places every cube first, then each player arranges their own 3 ships in orbital positions', () => {
    let s = createGame({ players: players(2), seed: 1, mode: 'basic' });
    s = apply(apply(s, { type: 'setupKeep' }), { type: 'setupKeep' });
    const first = s.turn.player;
    const other = 1 - first;
    s = apply(s, { type: 'placeStart', planet: 0 });
    expect(s.pending.map((p) => p.kind)).toEqual(['placeStart', 'placeShips']);
    expect(() => apply(s, { type: 'placeStart', planet: 0 })).toThrow(/taken/);
    expect(() => apply(s, { type: 'placeStart', planet: 4 })).toThrow(/starting objective/);
    s = apply(s, { type: 'placeStart', planet: 8 });
    expect(s.pending.map((p) => p.kind === 'placeShips' && p.player)).toEqual([first, other]);

    const [a, b, c] = s.dice.filter((d) => d.owner === first && d.loc.zone === 'scrapyard').map((d) => d.id);
    const reserveDie = s.dice.find((d) => d.owner === first && d.loc.zone === 'reserve')!.id;
    // Planet id0 is at (1,5): its orbital positions are (0,5), (0,6), (1,4), (1,6), (2,4) and (2,5).
    expect(() => apply(s, { type: 'placeShip', die: a, to: { r: 3, c: 4 } })).toThrow(/perimeter space/); // another tile
    expect(() => apply(s, { type: 'placeShip', die: a, to: { r: 12, c: 2 } })).toThrow(/perimeter space/); // opponent's planet
    expect(() => apply(s, { type: 'placeShip', die: reserveDie, to: { r: 0, c: 5 } })).toThrow(/starting mechs/);
    s = apply(s, { type: 'placeShip', die: c, to: { r: 1, c: 4 } });
    s = apply(s, { type: 'placeShip', die: a, to: { r: 1, c: 6 } });
    expect(s.pending[0]).toMatchObject({ kind: 'placeShips', player: first });
    s = apply(s, { type: 'placeShip', die: b, to: { r: 2, c: 5 } });
    expect(loc(s, a)).toEqual(board(1, 6));
    expect(loc(s, b)).toEqual(board(2, 5));
    expect(loc(s, c)).toEqual(board(1, 4));
    expect(s.pending[0]).toMatchObject({ kind: 'placeShips', player: other });

    s = finishSetup(s);
    expect(s.turn).toMatchObject({ player: first, actionsLeft: 3, phase: 'actions' });
    for (const p of s.players) expect(p.cubesLeft).toBe(4);
  });
});

describe('turns and actions (p.4)', () => {
  it('gives 3 actions; unused actions do not carry over', () => {
    let s = scenario({ p0d0: [7, 2, 3] });
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 3 } });
    expect(s.turn.actionsLeft).toBe(2);
    s = apply(s, { type: 'endTurn' });
    expect(s.turn).toMatchObject({ player: 1, actionsLeft: 3 });
    s = apply(s, { type: 'endTurn' });
    expect(s.turn).toMatchObject({ player: 0, actionsLeft: 3 });
  });

  it('allows the same action more than once, but no more than 3 actions', () => {
    let s = scenario({ p0d0: [0, 5, 1], p0d1: [7, 2, 1], p0d2: [10, 1, 1], p0d3: [4, 4, 1] });
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 0, c: 6 } });
    s = apply(s, { type: 'move', die: 'p0d1', to: { r: 7, c: 3 } });
    s = apply(s, { type: 'move', die: 'p0d2', to: { r: 10, c: 2 } });
    expect(() => apply(s, { type: 'move', die: 'p0d3', to: { r: 4, c: 5 } })).toThrow(/No actions left/);
  });

  it('passes the turn clockwise', () => {
    let s = quickStart(3, 2, 'basic');
    const first = s.turn.player;
    s = apply(s, { type: 'endTurn' });
    expect(s.turn.player).toBe((first + 1) % 3);
  });

  it('has no research action and no card phase in Basic mode', () => {
    let s = scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 2] });
    expect(() => apply(s, { type: 'research' })).toThrow(/no research/);
    s = apply(s, { type: 'conquer', planet: 4 });
    s = apply(s, { type: 'endTurn' });
    expect(s.pending).toEqual([]);
    expect(s.turn.player).toBe(1);
  });
});

describe('reconfigure (p.5, as the Community Edition plays it)', () => {
  it('re-rolls a ship on the map to a number it has not shown this turn, for 1 action', () => {
    let s = scenario({ p0d0: [7, 2, 4] });
    const shown = [4];
    for (let i = 0; i < 3; i++) {
      s = apply(s, { type: 'reconfigure', die: 'p0d0' });
      expect(shown).not.toContain(at(s, 'p0d0').value);
      shown.push(at(s, 'p0d0').value);
    }
    expect(s.turn.actionsLeft).toBe(0);
  });

  it('can re-roll a ship in the scrapyard, but not an expansion ship', () => {
    const s = scenario({});
    const before = at(s, 'p0d1').value;
    const next = apply(s, { type: 'reconfigure', die: 'p0d1' });
    expect(at(next, 'p0d1').value).not.toBe(before);
    expect(loc(next, 'p0d1')).toEqual({ zone: 'scrapyard' });
    expect(legalActions(s)).toContainEqual({ type: 'reconfigure', die: 'p0d1' });
    expect(() => apply(s, { type: 'reconfigure', die: 'p0d3' })).toThrow(/cannot be refitted/);
  });

  it('does not give a ship that already moved a second move', () => {
    let s = scenario({ p0d0: [7, 2, 2] });
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } });
    s = apply(s, { type: 'reconfigure', die: 'p0d0' });
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 5 } })).toThrow(/already moved/);
  });
});

describe('deploy (p.5)', () => {
  // Player 0's cube is on planet id2 (3,6), orbited by (2,6), (2,7), (3,5), (3,7), (4,5) and (4,6).
  it('moves a scrapyard ship to an empty orbital position of a planet with your cube', () => {
    let s = scenario({ p0d0: [2, 6, 3] });
    expect(() => apply(s, { type: 'deploy', die: 'p0d1', to: { r: 2, c: 6 } })).toThrow(/perimeter/); // occupied
    expect(() => apply(s, { type: 'deploy', die: 'p0d1', to: { r: 1, c: 6 } })).toThrow(/perimeter/); // planet without your cube
    const value = at(s, 'p0d1').value;
    s = apply(s, { type: 'deploy', die: 'p0d1', to: { r: 4, c: 6 } });
    expect(at(s, 'p0d1')).toMatchObject({ value, loc: board(4, 6) });
    expect(s.turn.actionsLeft).toBe(2);
  });

  it('is not the ship’s move: it can deploy and move in the same turn', () => {
    let s = scenario({});
    s = apply(s, { type: 'deploy', die: 'p0d1', to: { r: 4, c: 6 } });
    at(s, 'p0d1').value = 2;
    s = apply(s, { type: 'move', die: 'p0d1', to: { r: 5, c: 5 } });
    expect(s.turn.actionsLeft).toBe(1);
  });

  it('never deploys the expansion ships', () => {
    const s = scenario({});
    expect(() => apply(s, { type: 'deploy', die: 'p0d3', to: { r: 4, c: 6 } })).toThrow(/not in the salvage yard/);
  });
});

describe('move (p.6)', () => {
  const dests = (s: GameState, id: string) => [...moveOptions(s, id).moves.keys()].sort();

  it('moves across a hex’s sides up to the die number, turning as often as needed', () => {
    const s = scenario({ p0d0: [8, 3, 2] });
    const near = ['7,3', '7,4', '8,2', '8,4', '9,3'];
    const far = ['6,3', '7,2', '6,5', '7,5', '8,1', '9,1', '9,4', '10,2', '10,3'];
    expect(dests(s, 'p0d0')).toEqual([...near, ...far].sort());
    expect(moveOptions(s, 'p0d0').moves.get('6,3')?.steps).toBe(2);
  });

  it('treats planets as obstacles to move around', () => {
    // (1,4) → (1,6) is blocked by planet (1,5); the way around takes 3 steps.
    expect(dests(scenario({ p0d0: [1, 4, 2] }, {}), 'p0d0')).not.toContain('1,6');
    expect(dests(scenario({ p0d0: [1, 4, 3] }, {}), 'p0d0')).toContain('1,6');
  });

  it('cannot pass through or land on ships, friendly or enemy', () => {
    const s = scenario({ p0d0: [0, 5, 6], p0d1: [0, 6, 3], p1d0: [1, 4, 3] });
    expect(dests(s, 'p0d0')).toEqual([]);
  });

  it('moves each ship only once per turn', () => {
    let s = scenario({ p0d0: [7, 2, 3] });
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 3 } });
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 4 } })).toThrow(/already moved/);
  });
});

describe('attack (p.6)', () => {
  it('costs a movement point to enter the enemy space', () => {
    const range = (value: number, enemyCol: number) =>
      moveOptions(scenario({ p0d0: [7, 2, value], p1d0: [7, enemyCol, 6] }), 'p0d0').attacks.has('p1d0');
    expect(range(1, 3)).toBe(true);
    expect(range(1, 4)).toBe(false);
    expect(range(3, 5)).toBe(true);
    expect(range(3, 6)).toBe(false);
  });

  it('ends the ship’s movement and costs 1 action', () => {
    let s = scenario({ p0d0: [7, 2, 3], p1d0: [7, 4, 1] });
    s = resolve(attack(s, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 6, 1));
    expect(s.turn.actionsLeft).toBe(2);
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 8, c: 2 } })).toThrow(/already moved/);
  });

  it('attacker wins ties: defender is re-rolled into the scrapyard, dominance +1 / −1', () => {
    let s = scenario({ p0d0: [7, 2, 3], p1d0: [7, 4, 4] });
    s.players[1].dominance = 3;
    s = resolve(attack(s, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 3, 2)); // 6 vs 6
    expect(loc(s, 'p1d0')).toEqual({ zone: 'scrapyard' });
    expect(at(s, 'p1d0').rolls).toBeGreaterThan(at(BASE, 'p1d0').rolls);
    expect(s.players[0].dominance).toBe(2);
    expect(s.players[1].dominance).toBe(2);
  });

  it('lets the winner move into the defender’s space or stay where it attacked from', () => {
    const won = resolve(attack(scenario({ p0d0: [7, 2, 3], p1d0: [7, 4, 4] }), { type: 'attack', die: 'p0d0', target: 'p1d0' }, 1, 6));
    expect(won.pending[0]).toMatchObject({ kind: 'advance', player: 0 });
    expect(loc(apply(won, { type: 'advance', move: true }), 'p0d0')).toEqual(board(7, 4));
    expect(loc(apply(won, { type: 'advance', move: false }), 'p0d0')).toEqual(board(7, 3));
  });

  it('a repelled attacker moves back to the space it attacked from; nobody loses anything', () => {
    let s = scenario({ p0d0: [7, 2, 6], p1d0: [7, 4, 1] });
    s.players[0].dominance = 4;
    s = resolve(attack(s, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 1, 1)); // 7 vs 2
    expect(at(s, 'p0d0')).toMatchObject({ value: 6, loc: board(7, 3) });
    expect(loc(s, 'p1d0')).toEqual(board(7, 4));
    expect(s.players[0].dominance).toBe(4);
    expect(s.players[1].dominance).toBe(1);
    expect(s.pending).toEqual([]);
  });

  it('keeps dominance between 1 and 6', () => {
    let s = scenario({ p0d0: [7, 2, 1], p1d0: [7, 3, 6] });
    s = resolve(attack(s, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 1, 6));
    expect(s.players[1].dominance).toBe(1);
  });
});

describe('construct (p.7)', () => {
  it('needs your orbital ships to add up exactly to the planet number', () => {
    expect(conquerCheck(scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 2] }), 0, 4).ok).toBe(true);
    expect(conquerCheck(scenario({ p0d0: [5, 4, 5], p0d1: [7, 4, 2], p0d2: [6, 3, 1] }), 0, 4).ok).toBe(true);
    expect(conquerCheck(scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 3] }), 0, 4).ok).toBe(false);
    expect(conquerCheck(scenario({ p0d0: [5, 4, 4], p0d1: [7, 4, 3] }), 0, 4).ok).toBe(false);
  });

  it('counts all of your orbital ships — you cannot leave one out', () => {
    expect(conquerCheck(scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 2], p0d2: [6, 3, 1] }), 0, 4).ok).toBe(false);
  });

  it('ignores ships outside the orbit, own or enemy', () => {
    const s = scenario({ p0d0: [5, 4, 5], p0d1: [7, 4, 3], p0d2: [8, 3, 1], p1d0: [4, 4, 2] });
    expect(conquerCheck(s, 0, 4)).toMatchObject({ ok: true, sum: 8 });
  });

  it('uses 2 actions and places a cube', () => {
    let s = scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 2] });
    s = apply(s, { type: 'conquer', planet: 4 });
    expect(s.board.planets[4].cubes).toEqual([0]);
    expect(s.players[0].cubesLeft).toBe(3);
    expect(s.turn.actionsLeft).toBe(1);
    s.turn.actionsLeft = 1;
    s.board.planets[4].cubes = [];
    expect(() => apply(s, { type: 'conquer', planet: 4 })).toThrow(/Needs 2 actions/);
  });

  it('allows only one of your cubes per planet, but different players may share one', () => {
    const ships = { p0d0: [5, 4, 6], p0d1: [7, 4, 2] } as Record<string, [number, number, number]>;
    expect(conquerCheck(scenario(ships, { 2: [0], 6: [1], 4: [0] }), 0, 4)).toMatchObject({
      ok: false,
      reason: 'You already have a cube here',
    });
    expect(conquerCheck(scenario(ships, { 2: [0], 6: [1], 4: [1] }), 0, 4).ok).toBe(true);
    expect(conquerCheck(scenario(ships, { 2: [0], 6: [1], 4: [1, 1] }), 0, 4)).toMatchObject({
      ok: false,
      reason: 'No empty cube location',
    });
  });

  it('size-7 planets hold 1 cube, 8 hold 2, 9 hold 3, 10 hold 4', () => {
    const caps = (n: number) => quickStart(n, 1, 'basic').board.planets.map((p) => [p.number, p.capacity]);
    for (const [num, cap] of [...caps(2), ...caps(3), ...caps(4)]) expect(cap).toBe(num - 6);
  });
});

describe('ship abilities (p.8)', () => {
  it('cost no action and can still be used after the third action', () => {
    let s = scenario({ p0d0: [0, 5, 3], p0d1: [12, 2, 4] });
    s.turn.actionsLeft = 0;
    s = apply(s, { type: 'swap', die: 'p0d0', other: 'p0d1' });
    s = apply(s, { type: 'change', die: 'p0d1', value: 5 });
    expect(s.turn.actionsLeft).toBe(0);
  });

  it('only ships on the map, on your own turn', () => {
    const s = scenario({ p1d0: [0, 5, 3], p1d1: [12, 2, 3] });
    expect(() => apply(s, { type: 'swap', die: 'p1d0', other: 'p1d1' })).toThrow(/Not your mech/);
    const scrap = scenario({});
    at(scrap, 'p0d0').value = 4;
    expect(() => apply(scrap, { type: 'change', die: 'p0d0', value: 3 })).toThrow(/not on the map/);
  });

  it('one ability per die per turn, even if its number changes', () => {
    let s = scenario({ p0d0: [0, 5, 4], p0d1: [12, 2, 2] });
    s = apply(s, { type: 'change', die: 'p0d0', value: 3 });
    expect(() => apply(s, { type: 'swap', die: 'p0d0', other: 'p0d1' })).toThrow(/already used its ability/);
  });

  it('1 Breacher — Strike: a free 1-space attack, even after moving and attacking', () => {
    let s = scenario({ p0d0: [7, 2, 1], p1d0: [7, 4, 1] });
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 7, c: 3 } });
    s = resolve(attack(s, { type: 'freeAttack', die: 'p0d0', target: 'p1d0' }, 6, 1));
    expect(s.turn.actionsLeft).toBe(2);
    expect(loc(s, 'p0d0')).toEqual(board(7, 3));

    let t = scenario({ p0d0: [7, 3, 1], p1d0: [7, 4, 1] });
    t = resolve(attack(t, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 6, 1));
    t = attack(t, { type: 'freeAttack', die: 'p0d0', target: 'p1d0' }, 1, 6);
    t = apply(resolve(t), { type: 'advance', move: true });
    expect(loc(t, 'p0d0')).toEqual(board(7, 4));
    expect(t.turn.actionsLeft).toBe(2);
  });

  it('Strike reaches the spaces next to it only', () => {
    const s = scenario({ p0d0: [7, 3, 1], p1d0: [7, 5, 1] });
    expect(() => apply(s, { type: 'freeAttack', die: 'p0d0', target: 'p1d0' })).toThrow(/adjacent/);
  });

  it('2 Behemoth — Transport: carry a ship from a surrounding space, move 1–2, drop it in a surrounding space', () => {
    const base = scenario({ p0d0: [7, 3, 2], p0d1: [7, 2, 5] });
    const carry = (to: Cell, drop: Cell): Action => ({ type: 'carry', die: 'p0d0', passenger: 'p0d1', to, drop });
    expect(() => apply(base, carry({ r: 7, c: 6 }, { r: 7, c: 5 }))).toThrow(/Invalid carry/); // 3 spaces
    expect(() => apply(base, carry({ r: 7, c: 5 }, { r: 9, c: 5 }))).toThrow(/Invalid carry/); // too far to drop
    let s = apply(base, carry({ r: 7, c: 5 }, { r: 7, c: 6 }));
    expect(loc(s, 'p0d0')).toEqual(board(7, 5));
    expect(loc(s, 'p0d1')).toEqual(board(7, 6));
    expect(s.turn.actionsLeft).toBe(2);
    // The transport was the Behemoth's move; the passenger may still move.
    expect(() => apply(s, { type: 'move', die: 'p0d0', to: { r: 6, c: 5 } })).toThrow(/already moved/);
    s = apply(s, { type: 'move', die: 'p0d1', to: { r: 6, c: 7 } });
    expect(loc(s, 'p0d1')).toEqual(board(6, 7));
  });

  it('2 Behemoth — Transport may fly out and back, ending where it started (designer, BGG thread 1074052)', () => {
    const s = scenario({ p0d0: [7, 3, 2], p0d1: [7, 2, 5] });
    const back = apply(s, { type: 'carry', die: 'p0d0', passenger: 'p0d1', to: { r: 7, c: 3 }, drop: { r: 8, c: 3 } });
    expect(loc(back, 'p0d0')).toEqual(board(7, 3));
    expect(loc(back, 'p0d1')).toEqual(board(8, 3));
    expect(back.turn.actionsLeft).toBe(2);
    // Boxed in: (0,5)'s sides are a planet and two enemies, and the passenger's space only leads back, so
    // all it can do is fly out to (0,6) and back.
    const boxed = scenario({ p0d0: [0, 5, 2], p0d1: [0, 6, 5], p1d0: [1, 4, 6], p1d1: [1, 6, 6] });
    expect([...carryOptions(boxed, 'p0d0', 'p0d1').keys()].sort()).toEqual(['0,5', '0,6']);
  });

  it('3 Tactician — Warp: swap with any of your ships; not the Tactician’s move', () => {
    let s = scenario({ p0d0: [0, 5, 3], p0d1: [12, 2, 6] });
    s = apply(s, { type: 'swap', die: 'p0d0', other: 'p0d1' });
    expect(loc(s, 'p0d0')).toEqual(board(12, 2));
    expect(loc(s, 'p0d1')).toEqual(board(0, 5));
    s = apply(s, { type: 'move', die: 'p0d0', to: { r: 11, c: 2 } });
    expect(s.turn.actionsLeft).toBe(2);
  });

  it('4 Chameleon — Modify: becomes a 3 or a 5; a Sniper may still shoot, which is its move, not its ability', () => {
    const s = scenario({ p0d0: [7, 3, 4], p1d0: [7, 5, 6] });
    expect(() => apply(s, { type: 'change', die: 'p0d0', value: 2 as 3 })).toThrow(/Malformed action/);
    const five = apply(s, { type: 'change', die: 'p0d0', value: 5 });
    expect(at(five, 'p0d0').value).toBe(5);
    expect(five.turn.actionsLeft).toBe(3);
    expect(Math.max(...[...moveOptions(five, 'p0d0').moves.values()].map((m) => m.steps))).toBe(3);
    expect(legalActions(five)).toContainEqual({ type: 'power', die: 'p0d0', target: 'p1d0' });
  });
});

describe('dominance and infamy (p.9)', () => {
  function infamous() {
    let s = scenario({ p0d0: [7, 2, 1], p1d0: [7, 3, 6] });
    s.players[0].dominance = 5;
    s = resolve(attack(s, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 1, 6));
    return apply(s, { type: 'advance', move: false });
  }

  it('places a cube immediately at 6 — on any planet without your cube, no ship needed — then resets to 1', () => {
    let s = infamous();
    expect(s.pending[0]).toMatchObject({ kind: 'infamy', player: 0 });
    expect(s.players[0].dominance).toBe(6);
    expect(infamyTargets(s, 0).map((p) => p.id)).toEqual([0, 1, 3, 4, 5, 7, 8]); // planet 6 is a full 7
    expect(() => apply(s, { type: 'infamy', planet: 2 })).toThrow(/without your cube/);
    s = apply(s, { type: 'infamy', planet: 8 });
    expect(s.board.planets[8].cubes).toEqual([0]);
    expect(s.players[0].cubesLeft).toBe(3);
    expect(s.players[0].dominance).toBe(1);
    // The turn goes on.
    expect(s.turn).toMatchObject({ player: 0, phase: 'actions', actionsLeft: 2 });
  });

  it('resets only once the cube is placed: with nowhere to place it, dominance stays at 6', () => {
    let s = scenario({ p0d0: [7, 2, 1], p1d0: [7, 3, 6] });
    for (const p of s.board.planets) p.cubes = Array(p.capacity).fill(1);
    s.players[0].dominance = 5;
    s = apply(resolve(attack(s, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 1, 6)), { type: 'advance', move: false });
    expect(s.pending).toEqual([]);
    expect(s.players[0].dominance).toBe(6);
  });

  it('cannot place on a full planet', () => {
    const s = infamous();
    s.board.planets[8].cubes = [1];
    expect(() => apply(s, { type: 'infamy', planet: 8 })).toThrow(/without your cube/);
  });
});

describe('entanglement (designer errata, BGG thread 1087563)', () => {
  // Every planet with room already holds player 0's cube: planet 4 (size 8) has one free location.
  const full = { 0: [1], 1: [1], 2: [0], 3: [1], 4: [0], 5: [1], 6: [1], 7: [1], 8: [1] };

  it('lets you build on your own planet only when nothing else is open, at +3 per cube you have there', () => {
    expect(conquerCheck(scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 5] }, full), 0, 4)).toMatchObject({ ok: true, target: 11 });
    expect(conquerCheck(scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 2] }, full), 0, 4).ok).toBe(false);
    const open = { ...full, 8: [] };
    expect(conquerCheck(scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 5] }, open), 0, 4).ok).toBe(false);
  });

  it('applies to Infamy too', () => {
    expect(infamyTargets(scenario({}, full), 0).map((p) => p.id)).toEqual([4]);
  });
});

describe('winning (p.2, p.9)', () => {
  const four = { 0: [0], 1: [0], 2: [0], 3: [0], 6: [1] };

  it('ends the game the moment you construct your final cube', () => {
    let s = scenario({ p0d0: [5, 4, 6], p0d1: [7, 4, 2] }, four);
    expect(s.players[0].cubesLeft).toBe(1);
    s = apply(s, { type: 'conquer', planet: 4 });
    expect(s).toMatchObject({ phase: 'over', winner: 0, pending: [] });
    expect(() => apply(s, { type: 'endTurn' })).toThrow(/over/);
  });

  it('or place it through Infamy', () => {
    let s = scenario({ p0d0: [7, 2, 1], p1d0: [7, 3, 6] }, four);
    s.players[0].dominance = 5;
    s = apply(resolve(attack(s, { type: 'attack', die: 'p0d0', target: 'p1d0' }, 1, 6)), { type: 'advance', move: true });
    s = apply(s, { type: 'infamy', planet: 8 });
    expect(s).toMatchObject({ phase: 'over', winner: 0 });
  });
});
