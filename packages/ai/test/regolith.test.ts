/** Regolith's own rules for the AI: positions only its rules make (docs/regolith/PROTOTYPING.md). */
import { describe, expect, it } from 'vitest';
import { grid, orbitals, type GameState } from '@regolith/engine';
import { arrange, quickStart } from '../../engine/test/helpers';
import type { AiLevel } from '../src';
import { playTurn } from './helpers';

describe.each([2, 3, 4, 5] as AiLevel[])('contested orbit (Regolith), level %i', (level) => {
  /**
   * On Alpha Sector (hex): player 0's 6 and a ship of the rest make a free planet's number in its
   * orbit, but player 1's 6 sits in it too. Player 0's 2 waits next to it outside the orbit; on a
   * hex the orbit's spaces touch, so the orbiting ships may attack it too. Clearing it opens the
   * conquest in the same turn.
   */
  function siege(): { s: GameState; planet: number } {
    const base = quickStart(2, 1, 'regolith', 'alpha-hex');
    const planet = base.board.planets.find((q) => !q.start && !q.cubes.length)!;
    const orbit = orbitals(base.board, planet);
    const inOrbit = (q: { r: number; c: number }) => orbit.some((o) => o.r === q.r && o.c === q.c);
    const g = grid(base.board);
    const index = (q: { r: number; c: number }) => q.r * g.cols + q.c;
    // A blocker with a space outside the orbit next to it, for the attacker.
    const blocker = orbit.find((o) => g.orthoCells[index(o)].some((q) => g.space[index(q)] && !inOrbit(q)))!;
    const launch = g.orthoCells[index(blocker)].find((q) => g.space[index(q)] && !inOrbit(q))!;
    const [a, b] = orbit.filter((o) => o !== blocker);
    let s = arrange(base, {
      p0d0: [a.r, a.c, 6],
      p0d1: [b.r, b.c, planet.number - 6],
      p0d2: [launch.r, launch.c, 2],
      p1d0: [blocker.r, blocker.c, 6],
    });
    s = structuredClone(s);
    s.turn = {
      ...s.turn,
      player: 0,
      phase: 'actions',
      actionsLeft: 3,
      moved: {},
      abilityUsed: {},
      seen: {},
      conquests: 0,
      oncePerTurn: [],
    };
    for (const d of s.dice) s.turn.seen[d.id] = [d.value];
    return { s, planet: planet.id };
  }

  it('attacks the enemy ship blocking an orbit that makes the sum', () => {
    const { s, planet } = siege();
    const { s: after, actions } = playTurn(s, level);
    // A normal attack, the 1's free one, or a shot.
    expect(actions.some((a) => (a.type === 'attack' || a.type === 'freeAttack' || a.type === 'power') && a.target === 'p1d0')).toBe(true);
    // Having cleared it, it conquers in the same turn.
    if (after.dice.find((d) => d.id === 'p1d0')!.loc.zone !== 'board') expect(after.board.planets[planet].cubes).toContain(0);
  });
});
