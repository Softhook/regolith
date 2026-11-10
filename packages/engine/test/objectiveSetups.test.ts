import { describe, expect, it } from 'vitest';
import { chooseAction, chooseCombatResponse } from '@regolith/ai';
import { CAPACITY, MAPS, apply, checkInvariants, createGame, mulberry32, type Action, type GameState } from '../src';
import { OBJECTIVE_SETUPS, hubCapacity, hubLayout, hubMap, hubTiles, isSymmetric, slack } from './objectiveSetups';

const HUBS = [11, 12, 13, 14, 15, 16];
const game = (setup: (typeof OBJECTIVE_SETUPS)[number], hub: number, cap: number, cubes: number, seed = 1) =>
  createGame({
    players: Array.from({ length: setup.players }, (_, i) => ({ name: `P${i}`, color: '#fff', ai: true })),
    seed,
    mode: 'regolith',
    mapId: hubMap(setup, hub, cap, cubes).id,
  });

describe('objective setups (scripts/objective-probe.ts)', () => {
  const capacity = { ...CAPACITY };
  // The setups set CAPACITY for the hubs they lay: put the game's own back for the other tests in this file's worker.
  const restore = () => {
    for (const k of Object.keys(CAPACITY)) delete CAPACITY[Number(k)];
    Object.assign(CAPACITY, capacity);
  };

  it.each(OBJECTIVE_SETUPS.map((s) => [s.id, s]))('%s turns onto itself, as its seats must', (_, setup) => {
    expect(isSymmetric(setup)).toBe(true);
  });

  it('the symmetry check finds a layout that does not turn', () => {
    const lopsided = { ...OBJECTIVE_SETUPS[0], layout: ['.  7*', '7  7', '7  H  8', '7  7', '.  7*'] };
    expect(isSymmetric(lopsided)).toBe(false);
  });

  it.each(OBJECTIVE_SETUPS.filter((s) => s.base).map((s) => [s.id, s]))('%s with its control is the map it is built on', (_, setup) => {
    const base = MAPS.find((m) => m.id === setup.base)!;
    expect(base, setup.base).toBeDefined();
    expect(hubLayout(setup, setup.control)).toEqual(base.layout);
    expect(base.players).toBe(setup.players);
  });

  it.each(OBJECTIVE_SETUPS.map((s) => [s.id, s]))('%s leaves the hub optional at one cube count and forces it at the other', (_, setup) => {
    // Forced for every capacity tried: the other objectives can't take the table's cubes.
    const [open, forced] = setup.cubes;
    const cap = setup.players;
    expect(slack(setup, 13, cap, open).withoutHub).toBeGreaterThanOrEqual(0);
    expect(slack(setup, 13, cap, forced).withoutHub).toBeLessThan(0);
    // With the hub, there is room for every cube when everyone may claim it.
    expect(slack(setup, 13, cap, forced).all).toBeGreaterThanOrEqual(0);
  });

  it.each(OBJECTIVE_SETUPS.map((s) => [s.id, s]))('%s lays out at every hub number and capacity', (_, setup) => {
    for (const hub of HUBS)
      for (const cap of [1, setup.players]) {
        const s = game(setup, hub, cap, setup.cubes[0]);
        const tiles = new Set(hubTiles(setup));
        const hubs = s.board.planets.filter((p) => tiles.has(s.board.cells[p.r][p.c].tile));
        expect(hubs.map((p) => [p.number, p.capacity])).toEqual([...tiles].map(() => [hub, cap]));
        expect(hubs.every((p) => !p.start)).toBe(true);
      }
    restore();
  });

  it('a hub keeps its capacity when the next game sets another', () => {
    const setup = OBJECTIVE_SETUPS[0];
    const race = game(setup, 14, 1, 4);
    game(setup, 14, 2, 4);
    expect(race.board.planets.find((p) => p.number === 14)!.capacity).toBe(1);
    restore();
  });

  it('reads capacities as numbers, one per player, or the game’s own', () => {
    expect(hubCapacity('P', 15, 3)).toBe(3);
    expect(hubCapacity('2', 15, 3)).toBe(2);
    expect(hubCapacity('game', 12, 3)).toBe(3);
    expect(hubCapacity('game', 15, 3)).toBeUndefined();
    expect(() => hubCapacity('0', 15, 3)).toThrow();
  });

  it('a forced 16 is played to the end with no broken state', () => {
    // Thin Alpha at 4 cubes: six one-cube objectives for eight cubes, so the table needs the hub (though a
    // winner who takes three of the 7s needs it no more).
    const setup = OBJECTIVE_SETUPS.find((s) => s.id === 'duel-thin')!;
    const random = mulberry32(5);
    let s: GameState = game(setup, 16, 2, 4, 7);
    for (let step = 0; s.phase !== 'over' && step < 6000; step++) {
      let a: Action | null = null;
      if (s.pending[0]?.kind === 'combat') for (const p of s.players) a ??= chooseCombatResponse(s, p.id, { level: 1, random });
      a ??= chooseAction(s, { level: 1, random });
      s = apply(s, a!);
      expect(checkInvariants(s)).toEqual([]);
    }
    expect(s.phase).toBe('over');
    restore();
  }, 60_000);
});
