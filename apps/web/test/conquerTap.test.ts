/** What a tap on a planet does about conquering it (conquerTap): conquer at once, or ask how. */
import { describe, expect, it } from 'vitest';
import { orbitals, RULESETS, type GameMode, type GameState, type PlayerId } from '@regolith/engine';
import { arrange, quickStart } from '../../../packages/engine/test/helpers';
import { conquerOptions, conquerTap, legalFor } from '../src/game/legal';

const OVER_CONQUEST = !!RULESETS.regolith.overConquest;

/**
 * The player to move has two ships in the orbit of an empty, non-starting planet, their numbers
 * summing to `sum`; the planet then gets `cubes` (opponents' cubes, taking places).
 */
function position(mode: GameMode, sum: (planetNumber: number) => number, cubes: (others: PlayerId[]) => PlayerId[]) {
  let s: GameState = quickStart(3, 1, mode);
  const me = s.turn.player;
  const planet = s.board.planets.find((p) => !p.cubes.length && p.capacity >= 2)!;
  const [a, b] = orbitals(s.board, planet);
  const total = sum(planet.number);
  s = arrange(s, { [`p${me}d0`]: [a.r, a.c, 6], [`p${me}d1`]: [b.r, b.c, total - 6] });
  const others = [0, 1, 2].filter((p) => p !== me);
  for (const o of cubes(others)) {
    s.board.planets[planet.id].cubes.push(o);
    s.players[o].cubesLeft--;
  }
  s.turn.actionsLeft = 3;
  return { s, planet: planet.id, me, others };
}

const fill = (capacity: number, owners: PlayerId[]) => Array.from({ length: capacity }, (_, i) => owners[i % owners.length]);

describe('conquerTap', () => {
  it('conquers at once when there is one way: an empty place', () => {
    const { s, planet } = position(
      'basic',
      (n) => n,
      () => [],
    );
    expect(conquerTap(legalFor(s), planet)).toEqual({ type: 'conquer', planet });
  });

  it.runIf(OVER_CONQUEST)('asks how when a full planet holds two opponents’ cubes (over-conquest)', () => {
    const probe = position(
      'regolith',
      () => 12,
      () => [],
    );
    const capacity = probe.s.board.planets[probe.planet].capacity;
    const { s, planet, others } = position(
      'regolith',
      () => 12,
      (o) => fill(capacity, o),
    );
    const legal = legalFor(s);
    expect(
      conquerOptions(legal, planet)
        .map((a) => a.replace)
        .sort(),
    ).toEqual([...others].sort());
    expect(conquerTap(legal, planet)).toBe('choose');
  });

  it.runIf(OVER_CONQUEST)('conquers at once when a full planet holds one opponent’s cubes', () => {
    const probe = position(
      'regolith',
      () => 12,
      () => [],
    );
    const capacity = probe.s.board.planets[probe.planet].capacity;
    const { s, planet, others } = position(
      'regolith',
      () => 12,
      (o) => fill(capacity, [o[0]]),
    );
    expect(conquerTap(legalFor(s), planet)).toEqual({ type: 'conquer', planet, replace: others[0] });
  });

  it('does nothing on a planet that can’t be conquered', () => {
    const { s, planet } = position(
      'basic',
      (n) => n + 1,
      () => [],
    );
    expect(conquerTap(legalFor(s), planet)).toBeNull();
  });
});
