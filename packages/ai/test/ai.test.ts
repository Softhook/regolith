/**
 * AI levels: the positions each level must handle, and full games between levels.
 * Strength is measured separately by self-play (see docs/AI.md); these tests pin down behaviour.
 *
 * Scenarios run on Basic on Alpha Sector (hex), the basic map for 2 players, in axial cells (docs/HEX.md).
 * Planets, by id, each orbited by the six spaces of its tile:
 *
 *    id0 (1,5) 7*   id1 (4,3) 7   id2 (3,6) 7   id3 (7,1) 7   id4 (6,4) 8
 *    id5 (5,7) 7    id6 (9,2) 7   id7 (8,5) 7   id8 (11,3) 7*
 */
import { describe, expect, it } from 'vitest';
import { checkInvariants, type GameState } from '@regolith/engine';
import { playAiGame, quickStart, seededRandom } from '../../engine/test/helpers';
import { chooseAction, type AiLevel } from '../src';
import { playTurn } from './helpers';

const BASE = quickStart(2, 1, 'basic');

/** Player 0 to act with 3 fresh actions; only the listed ships on the map and cubes placed. */
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

const LEVELS: AiLevel[] = [1, 2, 3, 4, 5];

describe.each(LEVELS)('level %i', (level) => {
  it('conquers a planet whose orbit already adds up', () => {
    const { s } = playTurn(scenario({ p0d0: [3, 4, 3], p0d1: [5, 3, 4] }), level);
    expect(s.board.planets[1].cubes).toContain(0);
  });

  it('moves a ship into orbit and conquers in the same turn, even next to an enemy', () => {
    // A 1 orbits planet 1 (needs 7); the 6 can reach (5,2). An enemy 2 waits at (2,4), next to the orbit but not in it.
    const { s } = playTurn(scenario({ p0d0: [3, 4, 1], p0d1: [6, 1, 6], p1d0: [2, 4, 2] }), level);
    expect(s.board.planets[1].cubes).toContain(0);
  });

  it('attacks an orbit that would give the opponent their last cube', () => {
    // Player 1 has one cube left, and 3 + 4 around planet 5 (a 7).
    const cubes = { 0: [0], 1: [1], 6: [1], 7: [1], 8: [1] };
    const start = scenario({ p0d0: [4, 5, 2], p0d1: [12, 2, 1], p1d0: [4, 7, 3], p1d1: [6, 7, 4] }, cubes);
    expect(start.players[1].cubesLeft).toBe(1);
    const { actions } = playTurn(start, level);
    expect(actions.some((a) => a.type === 'attack' && (a.target === 'p1d0' || a.target === 'p1d1'))).toBe(true);
  });
});

describe('full games', () => {
  it.each([
    ['basic', [2, 3]],
    ['regolith', [2, 2]],
  ] as const)('%s: levels %j play to the end, keeping every invariant', (mode, levels) => {
    const { state } = playAiGame({
      mode,
      players: 2,
      seed: 3,
      aiSeed: 4,
      levels: [...levels],
      after: (s, action, step) => expect(checkInvariants(s), `after step ${step}: ${JSON.stringify(action)}`).toEqual([]),
    });
    expect(state.phase).toBe('over');
  });

  it('scores positions cleanly when a player is stuck at dominance 6', () => {
    const s = scenario({ p0d0: [7, 2, 3], p1d0: [7, 3, 2] });
    s.players[0].dominance = 6;
    s.players[1].dominance = 6;
    const a = chooseAction(s, { level: 3, random: seededRandom(1) });
    expect(a).not.toBeNull();
  });
});
