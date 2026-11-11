/** What a tap on an objective does about claiming it (claimTap): claim at once, or ask how. */
import { describe, expect, it } from 'vitest';
import { perimeterSpaces, RULESETS, type GameMode, type GameState, type PlayerId } from '@regolith/engine';
import { arrange, quickStart } from '../../../packages/engine/test/helpers';
import { claimOptions, claimTap, legalFor } from '../src/game/legal';

const OVER_CLAIM = !!RULESETS.regolith.overClaim;

/**
 * The player to move has two mechs on the perimeter of an empty, non-starting objective, their numbers
 * summing to `sum`; the objective then gets `cubes` (opponents' cubes, taking places).
 */
function position(mode: GameMode, sum: (objectiveNumber: number) => number, cubes: (others: PlayerId[]) => PlayerId[]) {
  let s: GameState = quickStart(3, 1, mode);
  const me = s.turn.player;
  const objective = s.board.objectives.find((p) => !p.cubes.length && p.capacity >= 2)!;
  const [a, b] = perimeterSpaces(s.board, objective);
  const total = sum(objective.number);
  s = arrange(s, { [`p${me}d0`]: [a.r, a.c, 6], [`p${me}d1`]: [b.r, b.c, total - 6] });
  const others = [0, 1, 2].filter((p) => p !== me);
  for (const o of cubes(others)) {
    s.board.objectives[objective.id].cubes.push(o);
    s.players[o].cubesLeft--;
  }
  s.turn.actionsLeft = 3;
  return { s, objective: objective.id, me, others };
}

const fill = (capacity: number, owners: PlayerId[]) => Array.from({ length: capacity }, (_, i) => owners[i % owners.length]);

describe('claimTap', () => {
  it('claims at once when there is one way: an empty place', () => {
    const { s, objective } = position(
      'basic',
      (n) => n,
      () => [],
    );
    expect(claimTap(legalFor(s), objective)).toEqual({ type: 'claim', objective });
  });

  it.runIf(OVER_CLAIM)('asks how when a full objective holds two opponents’ cubes (over-claim)', () => {
    const probe = position(
      'regolith',
      () => 12,
      () => [],
    );
    const capacity = probe.s.board.objectives[probe.objective].capacity;
    const { s, objective, others } = position(
      'regolith',
      () => 12,
      (o) => fill(capacity, o),
    );
    const legal = legalFor(s);
    expect(
      claimOptions(legal, objective)
        .map((a) => a.replace)
        .sort(),
    ).toEqual([...others].sort());
    expect(claimTap(legal, objective)).toBe('choose');
  });

  it.runIf(OVER_CLAIM)('claims at once when a full objective holds one opponent’s cubes', () => {
    const probe = position(
      'regolith',
      () => 12,
      () => [],
    );
    const capacity = probe.s.board.objectives[probe.objective].capacity;
    const { s, objective, others } = position(
      'regolith',
      () => 12,
      (o) => fill(capacity, [o[0]]),
    );
    expect(claimTap(legalFor(s), objective)).toEqual({ type: 'claim', objective, replace: others[0] });
  });

  it('does nothing on an objective that can’t be claimed', () => {
    const { s, objective } = position(
      'basic',
      (n) => n + 1,
      () => [],
    );
    expect(claimTap(legalFor(s), objective)).toBeNull();
  });
});
