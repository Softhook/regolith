/** Regolith's own rules for the AI: positions only its rules make (docs/regolith/PROTOTYPING.md). */
import { describe, expect, it } from 'vitest';
import { grid, perimeterSpaces, type GameState } from '@regolith/engine';
import { arrange, quickStart } from '../../engine/test/helpers';
import type { AiLevel } from '../src';
import { playTurn } from './helpers';

describe.each([2, 3, 4, 5] as AiLevel[])('contested perimeter (Regolith), level %i', (level) => {
  /**
   * On Lagado Planitia (hex): player 0's 6 and a mech of the rest make a free objective's number in its
   * perimeter, but player 1's 6 sits in it too. Player 0's 2 waits next to it outside the perimeter; on a
   * hex the perimeter's spaces touch, so the perimeter mechs may attack it too. Clearing it opens the
   * claim in the same turn.
   */
  function siege(): { s: GameState; objective: number } {
    const base = quickStart(2, 1, 'regolith', 'lagado-planitia');
    const objective = base.board.objectives.find((q) => !q.start && !q.cubes.length)!;
    const perimeter = perimeterSpaces(base.board, objective);
    const onPerimeter = (q: { r: number; c: number }) => perimeter.some((o) => o.r === q.r && o.c === q.c);
    const g = grid(base.board);
    const index = (q: { r: number; c: number }) => q.r * g.cols + q.c;
    // A blocker with a space outside the perimeter next to it, for the attacker.
    const blocker = perimeter.find((o) => g.orthoCells[index(o)].some((q) => g.space[index(q)] && !onPerimeter(q)))!;
    const launch = g.orthoCells[index(blocker)].find((q) => g.space[index(q)] && !onPerimeter(q))!;
    const [a, b] = perimeter.filter((o) => o !== blocker);
    let s = arrange(base, {
      p0d0: [a.r, a.c, 6],
      p0d1: [b.r, b.c, objective.number - 6],
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
      claims: 0,
      oncePerTurn: [],
    };
    for (const d of s.dice) s.turn.seen[d.id] = [d.value];
    return { s, objective: objective.id };
  }

  it('attacks the enemy mech blocking a perimeter that makes the sum', () => {
    const { s, objective } = siege();
    const { s: after, actions } = playTurn(s, level);
    // A normal attack, the 1's free one, or a shot.
    expect(actions.some((a) => (a.type === 'attack' || a.type === 'freeAttack' || a.type === 'ability') && a.target === 'p1d0')).toBe(true);
    // Having cleared it, it claims in the same turn.
    if (after.dice.find((d) => d.id === 'p1d0')!.loc.zone !== 'board') expect(after.board.objectives[objective].cubes).toContain(0);
  });
});
