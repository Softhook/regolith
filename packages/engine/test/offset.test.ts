/**
 * Planets off the middle of their tiles (data/maps.yaml): a tile token's direction moves the planet to
 * one of the spaces around the middle, corners too on squares. Its orbit is still the spaces next to it,
 * so it reaches onto neighbouring tiles, loses spaces off the map's edge, and may overlap another's.
 */
import { describe, expect, it } from 'vitest';
import {
  MAPS,
  MODES,
  RULESETS,
  adjacent,
  apply,
  buildBoard,
  cellAt,
  conquerCheck,
  diagonals,
  drawing,
  mapStats,
  orbitals,
  orbitedPlanets,
  parseToken,
  spaces,
  tileCentres,
  tilesTouch,
  type Board,
  type Cell,
  type GameState,
  type MapDef,
} from '../src';
import { playAiGame, quickStart } from './helpers';
import { OFFSET_HEX, OFFSET_SQUARE, registerOffsetMaps } from './offsetMaps';

registerOffsetMaps();
const ALPHA_HEX = MAPS.find((m) => m.id === 'alpha-hex')!;

const map = (layout: string[][], grid?: 'hex'): MapDef => ({
  id: 'test',
  name: 'Test',
  players: 2,
  group: 'test',
  cubes: 5,
  stats: { slack: 0, shared: null, planets: 0 },
  layout,
  ...(grid ? { grid } : {}),
});
const at = (b: Board, number: number, nth = 0) => b.planets.filter((p) => p.number === number)[nth];
const tilesOf = (b: Board, cells: readonly Cell[]) => cells.map((p) => cellAt(b, p)!.tile);
const sorted = (cells: readonly Cell[]) => cells.map((p) => `${p.r},${p.c}`).sort();

/** Player 0 to act with 3 fresh actions, only the listed ships on the map, at [cell, value]. */
function scenario(base: GameState, dice: Record<string, [Cell, number]>): GameState {
  const s = structuredClone(base);
  for (const d of s.dice) if (d.loc.zone === 'board') d.loc = { zone: 'scrapyard' };
  for (const [id, [cell, value]] of Object.entries(dice)) {
    const d = s.dice.find((x) => x.id === id)!;
    d.loc = { zone: 'board', ...cell };
    d.value = value;
  }
  s.turn = { ...s.turn, player: 0, phase: 'actions', actionsLeft: 3, moved: {}, abilityUsed: {}, seen: {}, conquests: 0, oncePerTurn: [] };
  for (const d of s.dice) s.turn.seen[d.id] = [d.value];
  return s;
}

describe('tile tokens', () => {
  it('read a number, a direction and a start, in that order', () => {
    expect(parseToken('8')).toEqual({ number: 8, start: false });
    expect(parseToken('9*')).toEqual({ number: 9, start: true });
    expect(parseToken('7ne')).toEqual({ number: 7, start: false, dir: 'ne' });
    expect(parseToken('10s*')).toEqual({ number: 10, start: true, dir: 's' });
    expect(parseToken('0')).toEqual({ number: 0, start: false });
    expect(parseToken('-')).toEqual({ number: 0, start: false, blank: true });
  });

  it('refuse anything else', () => {
    for (const t of ['x', '6', '8*n', '8en', '8nn', '0n', '0*', '-*', '-n', '--', '']) expect(() => parseToken(t), t).toThrow();
  });

  it('make a blank tile open ground: spaces, but not void ones', () => {
    const b = buildBoard({ ...ALPHA_HEX, layout: ALPHA_HEX.layout.map((row) => row.map((t) => (t === '8' ? '-' : t))) });
    expect(b.planets.map((p) => p.number)).not.toContain(8);
    expect(spaces(b)).toHaveLength(b.planets.length * 6 + 7);
    expect(spaces(b).some((p) => b.cells[p.r][p.c].void)).toBe(false);
  });

  it('put the planet that way from the middle as the map is drawn, north up', () => {
    // Degrees anticlockwise from east; the drawing's y runs down.
    const square = { e: 0, ne: 45, n: 90, nw: 135, w: 180, sw: -135, s: -90, se: -45 };
    const hex = { ne: 30, n: 90, nw: 150, sw: -150, s: -90, se: -30 };
    for (const [grid, angles] of [
      [undefined, square],
      ['hex', hex],
    ] as const)
      for (const [dir, angle] of Object.entries(angles)) {
        const b = buildBoard(map([[`7${dir}`]], grid));
        const { at } = drawing(b);
        const [p, m] = [at(b.planets[0]), at(tileCentres(b).get(0)!)];
        const drawn = (Math.atan2(m.r - p.r, p.c - m.c) * 180) / Math.PI;
        expect(drawn, `${grid ?? 'square'} ${dir}`).toBeCloseTo(angle, 6);
      }
  });

  it('refuse east and west on hexes, which have no side that way', () => {
    expect(() => buildBoard(map([['7e']], 'hex'))).toThrow(/hex tile/);
    expect(() => buildBoard(map([['7w']], 'hex'))).toThrow(/hex tile/);
  });

  it("don't change a map's stats", () => {
    const plain = (m: MapDef) => ({ ...m, layout: m.layout.map((row) => row.map((t) => (t === '.' ? t : t.replace(/[nsew]/g, '')))) });
    for (const m of [OFFSET_SQUARE, OFFSET_HEX]) expect(mapStats(m)).toEqual(mapStats(plain(m)));
  });
});

describe('an off-centre planet on squares', () => {
  it('sits next to the middle, which becomes a space; the middle is still the tile centre', () => {
    const b = buildBoard(map([['7'], ['8n']]));
    expect(at(b, 8)).toMatchObject({ r: 3, c: 1 });
    expect(cellAt(b, { r: 4, c: 1 })).toMatchObject({ kind: 'space', tile: 1 });
    expect(tileCentres(b).get(1)).toEqual({ r: 4, c: 1 });
  });

  it('orbits three spaces of its own tile and one of the tile it faces', () => {
    const b = buildBoard(map([['7'], ['8n']]));
    const orbit = orbitals(b, at(b, 8));
    expect(sorted(orbit)).toEqual(
      sorted([
        { r: 4, c: 1 },
        { r: 3, c: 0 },
        { r: 3, c: 2 },
        { r: 2, c: 1 },
      ]),
    );
    expect(tilesOf(b, orbit).sort()).toEqual([0, 1, 1, 1]);
  });

  it('shares an orbital space with the planet it faces', () => {
    const b = buildBoard(map([['7'], ['8n']]));
    expect(orbitedPlanets(b, { r: 2, c: 1 }).map((p) => p.number)).toEqual([7, 8]);
    expect(orbitedPlanets(b, { r: 0, c: 1 }).map((p) => p.number)).toEqual([7]);
    expect(orbitedPlanets(b, { r: 5, c: 1 })).toEqual([]);
  });

  it('in a corner, orbits two spaces of its own tile and one each of two others', () => {
    const b = buildBoard(
      map([
        ['7', '7'],
        ['7', '8nw'],
      ]),
    );
    const orbit = orbitals(b, at(b, 8));
    expect(at(b, 8)).toMatchObject({ r: 3, c: 3 });
    expect(tilesOf(b, orbit).sort()).toEqual([1, 2, 3, 3]);
    // Its diagonal on the tile across the corner is that tile's corner space.
    expect(diagonals(b, at(b, 8))).toContainEqual({ r: 2, c: 2 });
  });

  it("facing the map's edge, orbits only three spaces; in a corner of the map, two", () => {
    const edge = buildBoard(map([['7n']]));
    expect(orbitals(edge, edge.planets[0])).toHaveLength(3);
    const corner = buildBoard(map([['7nw']]));
    expect(orbitals(corner, corner.planets[0])).toHaveLength(2);
  });

  it("doesn't orbit a planet next to it", () => {
    const b = buildBoard(map([['7e', '7w']]));
    for (const p of b.planets) {
      expect(orbitals(b, p)).toHaveLength(3);
      expect(orbitals(b, p).every((q) => cellAt(b, q)!.kind === 'space')).toBe(true);
    }
  });
});

describe('an off-centre planet on hexes', () => {
  it('sits on any of the six outer hexes, orbiting three of its own tile and three of two others', () => {
    for (const dir of ['n', 'ne', 'se', 's', 'sw', 'nw']) {
      const layout = ALPHA_HEX.layout.map((row) => row.map((t) => (t === '8' ? `8${dir}` : t)));
      const b = buildBoard(map(layout, 'hex'));
      const eight = at(b, 8);
      const own = cellAt(b, eight)!.tile;
      const centre = tileCentres(b).get(own)!;
      expect(cellAt(b, centre)!.kind, dir).toBe('space');
      const tiles = tilesOf(b, orbitals(b, eight));
      expect(tiles, dir).toHaveLength(6);
      const counts = [...new Set(tiles)].map((t) => tiles.filter((x) => x === t).length);
      expect(counts.sort(), dir).toEqual([1, 2, 3]);
      expect(
        tiles.filter((t) => t === own),
        dir,
      ).toHaveLength(3);
    }
  });

  it('loses an orbital hex to a planet leaning towards it', () => {
    const b = buildBoard(OFFSET_HEX);
    const eight = at(b, 8);
    const next = adjacent(b, eight).flatMap((q) => cellAt(b, q)!.planet ?? []);
    expect(next.map((id) => b.planets[id].number)).toEqual([7]);
    expect(orbitals(b, eight)).toHaveLength(5);
  });

  it('leaves three hexes of its tile in no orbit (all hexes orbit a planet on centred hex maps)', () => {
    const b = buildBoard(map([['7n']], 'hex'));
    const flower = [...tileCentres(b).values()];
    expect(flower).toHaveLength(1);
    const free = b.cells.flat().filter((x) => x.kind === 'space').length - orbitals(b, b.planets[0]).length;
    expect(free).toBe(3);
  });
});

describe('starting planets', () => {
  it('need room for the 3 starting ships in orbital spaces no other start shares', () => {
    expect(() => buildBoard(map([['7nw*']]))).toThrow(/starting planet 7 has 2/);
    expect(() => buildBoard(map([['7n*', '7nw*']]))).toThrow(/has 2 orbital spaces of its own/);
    expect(() => buildBoard(map([['7n*', '7nw']]))).not.toThrow();
  });
});

describe('playing with off-centre planets', () => {
  // Offset Hex: the 7 at (4,4) leans in towards the 8 at (5,4), and both reach the 7 at (3,6).
  const base = quickStart(2, 1, 'basic', 'offset-hex');
  const b = base.board;
  const eight = at(b, 8);
  const leaning = b.planets.find((p) => p.number === 7 && p.r === 4 && p.c === 4)!;

  it("the test map's 8 shares orbital spaces with the 7 leaning in", () => {
    const shared = orbitals(b, eight).filter((q) => orbitals(b, leaning).some((x) => x.r === q.r && x.c === q.c));
    expect(sorted(shared)).toEqual(['4,5', '5,3']);
  });

  it('a ship in a shared orbital space counts towards both planets', () => {
    const shared = { r: 5, c: 3 };
    expect(orbitedPlanets(b, shared)).toEqual([leaning, eight]);
    const s = scenario(base, {
      p0d0: [shared, 3],
      p0d1: [{ r: 3, c: 4 }, 4],
      p0d2: [{ r: 6, c: 4 }, 5],
    });
    expect(conquerCheck(s, 0, leaning.id)).toMatchObject({ ok: true, sum: 7 });
    expect(conquerCheck(s, 0, eight.id)).toMatchObject({ ok: true, sum: 8 });
    expect(apply(s, { type: 'conquer', planet: leaning.id }).board.planets[leaning.id].cubes).toContain(0);
    expect(apply(s, { type: 'conquer', planet: eight.id }).board.planets[eight.id].cubes).toContain(0);
  });

  it('a move into a shared space names both planets', () => {
    const s = scenario(base, { p0d0: [{ r: 6, c: 3 }, 1] });
    const after = apply(s, { type: 'move', die: 'p0d0', to: { r: 5, c: 3 } });
    const entry = after.log.at(-1)!;
    expect(entry.text).toMatch(/next to planet 7 and planet 8/);
    expect(entry.planets).toEqual([leaning.id, eight.id]);
  });

  it('diagonal tiles on squares do not touch', () => {
    const square = buildBoard(OFFSET_SQUARE);
    expect(tilesTouch(square, 0, 4)).toBe(false);
    expect(tilesTouch(square, 0, 1)).toBe(true);
    expect(tilesTouch(square, 1, 4)).toBe(true);
  });

  for (const { id: mode } of MODES)
    it(`AI plays a ${mode} game on Offset Hex to the end`, () => {
      const { state } = playAiGame({ mode, players: 2, seed: 5, aiSeed: 7, mapId: 'offset-hex' });
      expect(state.winner).not.toBeNull();
    }, 60_000);
});

describe('the drift maps', () => {
  const drift = MAPS.filter((m) => (m.group === 'drift' || m.group === 'drift-square') && m !== OFFSET_HEX && m !== OFFSET_SQUARE);

  it('are a square and a hex map; both modes, hex only, play the hex one and no mode the square one', () => {
    expect(drift.map((m) => [m.id, m.grid ?? 'square'])).toEqual([
      ['binary-reach', 'square'],
      ['twin-drift', 'hex'],
    ]);
    const playedBy = (m: (typeof drift)[number]) =>
      Object.values(RULESETS)
        .filter((r) => r.mapGroups.includes(m.group))
        .map((r) => r.id);
    expect(drift.map(playedBy)).toEqual([[], ['basic', 'regolith']]);
  });

  for (const m of drift) {
    const b = buildBoard(m);

    it(`${m.name} is the same turned half a turn: each planet matches one across the middle`, () => {
      const { at, rows, cols } = drawing(b);
      for (const p of b.planets) {
        const q = at(p);
        const twin = b.planets.find((x) => {
          const y = at(x);
          return Math.abs(q.r + y.r - (rows - 1)) < 1e-9 && Math.abs(q.c + y.c - (cols - 1)) < 1e-9;
        });
        expect(twin, `planet ${p.number} at ${p.r},${p.c}`).toBeDefined();
        expect([twin!.number, twin!.start, orbitals(b, twin!).length]).toEqual([p.number, p.start, orbitals(b, p).length]);
      }
    });

    it(`${m.name} has orbits that overlap`, () => {
      expect(spaces(b).filter((q) => orbitedPlanets(b, q).length > 1).length).toBeGreaterThanOrEqual(4);
    });

    // Binary Reach, the square one, isn't played by any mode since Regolith went hex only (docs/regolith/REGOLITH.md).
    if (m.grid === 'hex')
      it(`AI plays a Regolith game on ${m.name} to the end`, () => {
        const { state } = playAiGame({ mode: 'regolith', players: 2, seed: 5, aiSeed: 7, mapId: m.id, levels: [2, 2] });
        expect(state.winner).not.toBeNull();
      }, 60_000);
  }
});
