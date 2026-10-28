/**
 * Planets off the middle of their tiles (data/maps.yaml): a tile token's direction moves the planet to
 * one of the spaces around the middle. Its orbit is still the spaces next to it,
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
  drawing,
  mapStats,
  orbitals,
  orbitedPlanets,
  parseToken,
  spaces,
  tileCentres,
  type Board,
  type Cell,
  type GameState,
  type MapDef,
} from '../src';
import { playAiGame, quickStart } from './helpers';
import { OFFSET_HEX, registerOffsetMaps } from './offsetMaps';

registerOffsetMaps();
const ALPHA_HEX = MAPS.find((m) => m.id === 'alpha-hex')!;

const map = (layout: string[][]): MapDef => ({
  id: 'test',
  name: 'Test',
  players: 2,
  group: 'test',
  cubes: 5,
  stats: { slack: 0, shared: null, planets: 0 },
  layout,
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
    const angles = { ne: 30, n: 90, nw: 150, sw: -150, s: -90, se: -30 };
    for (const [dir, angle] of Object.entries(angles)) {
      const b = buildBoard(map([[`7${dir}`]]));
      const { at } = drawing(b);
      const [p, m] = [at(b.planets[0]), at(tileCentres(b).get(0)!)];
      const drawn = (Math.atan2(m.r - p.r, p.c - m.c) * 180) / Math.PI;
      expect(drawn, dir).toBeCloseTo(angle, 6);
    }
  });

  it('refuse east and west, which a hex has no side towards', () => {
    expect(() => parseToken('7e')).toThrow(/Bad tile token/);
    expect(() => parseToken('7w')).toThrow(/Bad tile token/);
  });

  it("don't change a map's stats", () => {
    const plain = (m: MapDef) => ({ ...m, layout: m.layout.map((row) => row.map((t) => (t === '.' ? t : t.replace(/[nsew]/g, '')))) });
    expect(mapStats(OFFSET_HEX)).toEqual(mapStats(plain(OFFSET_HEX)));
  });
});

describe('an off-centre planet on hexes', () => {
  it('sits on any of the six outer hexes, orbiting three of its own tile and three of two others', () => {
    for (const dir of ['n', 'ne', 'se', 's', 'sw', 'nw']) {
      const layout = ALPHA_HEX.layout.map((row) => row.map((t) => (t === '8' ? `8${dir}` : t)));
      const b = buildBoard(map(layout));
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
    const b = buildBoard(map([['7n']]));
    const flower = [...tileCentres(b).values()];
    expect(flower).toHaveLength(1);
    const free = b.cells.flat().filter((x) => x.kind === 'space').length - orbitals(b, b.planets[0]).length;
    expect(free).toBe(3);
  });
});

describe('starting planets', () => {
  it('need room for the 3 starting ships in orbital spaces no other start shares', () => {
    // Alone, a start has room wherever it sits on its tile; two leaning together share too much.
    for (const dir of ['', 'n', 'ne', 'se', 's', 'sw', 'nw']) expect(() => buildBoard(map([[`7${dir}*`]]))).not.toThrow();
    expect(() => buildBoard(map([['7n*', '7nw*']]))).toThrow(/starting objective 7 has 2 perimeter spaces of its own/);
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
    expect(entry.text).toMatch(/next to objective 7 and objective 8/);
    expect(entry.planets).toEqual([leaning.id, eight.id]);
  });

  for (const { id: mode } of MODES)
    it(`AI plays a ${mode} game on Offset Hex to the end`, () => {
      const { state } = playAiGame({ mode, players: 2, seed: 5, aiSeed: 7, mapId: 'offset-hex' });
      expect(state.winner).not.toBeNull();
    }, 60_000);
});

describe('the drift maps', () => {
  const drift = MAPS.filter((m) => m.group === 'drift' && m !== OFFSET_HEX);

  it('cover every player count and both modes play them', () => {
    expect(drift.map((m) => m.id)).toEqual(['twin-drift', 'circular-drift', 'trinary-drift', 'nexus-drift']);
    expect([...new Set(drift.map((m) => m.players))].sort()).toEqual([2, 3, 4]);
    expect(
      Object.values(RULESETS)
        .filter((r) => r.mapGroups.includes('drift'))
        .map((r) => r.id),
    ).toEqual(['basic', 'regolith']);
  });

  for (const m of drift) {
    const b = buildBoard(m);

    it(`${m.name} matches itself under a turn: each planet has a corresponding planet`, () => {
      const center = {
        r: b.planets.reduce((sum, p) => sum + p.r, 0) / b.planets.length,
        c: b.planets.reduce((sum, p) => sum + p.c, 0) / b.planets.length,
      };
      for (const p of b.planets) {
        const twinAt =
          m.players === 3
            ? { r: center.r + p.c - center.c, c: center.c - (p.r - center.r) - (p.c - center.c) }
            : { r: 2 * center.r - p.r, c: 2 * center.c - p.c };
        const twin = b.planets.find((x) => Math.abs(x.r - twinAt.r) < 1e-9 && Math.abs(x.c - twinAt.c) < 1e-9);
        expect(twin, `planet ${p.number} at ${p.r},${p.c}`).toBeDefined();
        expect([twin!.number, twin!.start, orbitals(b, twin!).length]).toEqual([p.number, p.start, orbitals(b, p).length]);
      }
    });

    it(`${m.name} has orbits that overlap`, () => {
      expect(spaces(b).filter((q) => orbitedPlanets(b, q).length > 1).length).toBeGreaterThan(0);
    });

    it(`AI plays a Regolith game on ${m.name} to the end`, () => {
      const { state } = playAiGame({
        mode: 'regolith',
        players: m.players,
        seed: 5,
        aiSeed: 7,
        mapId: m.id,
        levels: Array.from({ length: m.players }, () => 2),
      });
      expect(state.winner).not.toBeNull();
    }, 60_000);
  }
});
