/**
 * Hex maps (docs/HEX.md) on 7-hex tiles: which spaces are next to each other and how far apart they are.
 * The geometry is pinned down here with Basic's rules, Regolith without its cards.
 */
import { describe, expect, it } from 'vitest';
import {
  MAPS,
  RULESETS,
  adjacent,
  apply,
  buildBoard,
  carryPassengers,
  checkInvariants,
  cellAtPoint,
  conquerCheck,
  createGame,
  effectOf,
  distance,
  drawing,
  grid,
  mapStats,
  moveOptions,
  orbitals,
  same,
  startingGround,
  spaces,
  tileCentres,
  type Cell,
  type GameState,
} from '../src';
import { playAiGame, players, quickStart } from './helpers';

// The basic maps on hex tiles; the drift maps (offset.test.ts) put their planets off the middle.
const HEX_MAPS = MAPS.filter((m) => m.group === 'hex');
/** The basic maps on hex tiles (the hex group's others adapt advanced maps). */
const BASIC_HEX = HEX_MAPS.filter((m) => ['alpha-hex', 'beta-hex', 'gamma-hex'].includes(m.id));
const BASE = quickStart(2, 1, 'basic', 'alpha-hex');
/** Alpha Sector (hex)'s middle planet, the 8: every other tile is next to it but the two starts. */
const CENTRE = BASE.board.planets.find((p) => p.number === 8)!;

/** Player 0 to act with 3 fresh actions, only the listed ships on the map, at [cell, value]. */
function scenario(dice: Record<string, [Cell, number]>): GameState {
  const s = structuredClone(BASE);
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

describe('hex maps', () => {
  it('are the basic maps for 2, 3 and 4 players, in Regolith', () => {
    expect(BASIC_HEX.map((m) => m.players)).toEqual([2, 3, 4]);
    expect(RULESETS.regolith.mapGroups).toContain('hex');
    for (const m of BASIC_HEX) expect(mapStats(m)).toEqual(m.stats);
  });

  it('are built of 7-hex tiles: each planet with its 6 orbital spaces, the planets of touching tiles 3 apart', () => {
    for (const m of MAPS.filter((x) => x.group !== 'drift')) {
      const b = buildBoard(m);
      for (const p of b.planets) {
        expect(orbitals(b, p)).toHaveLength(6);
        // Each orbital space is next to its own planet only.
        for (const q of orbitals(b, p)) expect(b.planets.filter((x) => distance(x, q) === 1)).toEqual([p]);
      }
      // A void or blank tile is 7 spaces and no planet.
      const empty = m.layout.flat().filter((t) => t === '0' || t === '-').length;
      expect(spaces(b)).toHaveLength(b.planets.length * 6 + empty * 7);
    }
    const b = BASE.board;
    expect(b.planets.filter((p) => distance(p, CENTRE) === 3)).toHaveLength(6);
  });

  it('finds each tile’s middle: its planet', () => {
    for (const m of HEX_MAPS) {
      const b = buildBoard(m);
      const centres = tileCentres(b);
      expect(centres.size).toBe(new Set(b.cells.flat().flatMap((x) => (x.kind === 'off' ? [] : [x.tile]))).size);
      for (const p of b.planets) expect(centres.get(b.cells[p.r][p.c].tile)).toEqual({ r: p.r, c: p.c });
    }
  });

  it('measures distance in hexes', () => {
    const b = BASE.board;
    const p = orbitals(b, CENTRE)[0];
    for (const q of adjacent(b, p)) expect(distance(p, q)).toBe(1);
    expect(adjacent(b, CENTRE)).toHaveLength(6);
    // Two steps straight on, or a diagonal: both 2 away.
    expect(distance({ r: 0, c: 0 }, { r: 2, c: 0 })).toBe(2);
    expect(distance({ r: 0, c: 0 }, { r: 1, c: 1 })).toBe(2);
    expect(distance({ r: 0, c: 0 }, { r: 3, c: -3 })).toBe(3);
  });

  it('draws flat-topped hexes: neighbours one space apart, two hexes away 2 or √3', () => {
    const b = BASE.board;
    const { at } = drawing(b);
    const g = grid(b);
    for (const p of spaces(b)) {
      const i = p.r * b.cols + p.c;
      for (const q of g.orthoCells[i]) expect(Math.hypot(at(p).r - at(q).r, at(p).c - at(q).c)).toBeCloseTo(1);
      for (const q of spaces(b).filter((x) => distance(p, x) === 2)) {
        const d = Math.hypot(at(p).r - at(q).r, at(p).c - at(q).c);
        expect(Math.abs(d - 2) < 1e-9 || Math.abs(d - Math.sqrt(3)) < 1e-9).toBe(true);
      }
      // A tap on a space's middle finds it.
      expect(cellAtPoint(b, at(p).r + 0.5, at(p).c + 0.5)).toEqual(p);
    }
  });

  it('draws every hex whole, its side corners too, inside the drawing', () => {
    for (const m of HEX_MAPS) {
      const b = buildBoard(m);
      const { at, cols } = drawing(b);
      const xs = spaces(b).flatMap((p) => [at(p).c + 0.5 - 1 / Math.sqrt(3), at(p).c + 0.5 + 1 / Math.sqrt(3)]);
      expect(Math.min(...xs)).toBeCloseTo(0);
      expect(Math.max(...xs)).toBeCloseTo(cols);
    }
  });

  it('joins every space of a map to every other, with no tile cut off', () => {
    for (const m of MAPS) {
      const b = buildBoard(m);
      const all = spaces(b).filter((p) => b.cells[p.r][p.c].kind === 'space');
      const seen = new Set([`${all[0].r},${all[0].c}`]);
      // A map's own Ice Tunnel and wormhole join the islands it has.
      const ground = startingGround(m);
      const via = (p: Cell) =>
        [ground.gates, ground.wormhole].flatMap(([g1, g2]) => (g1 && same(p, g1) ? [g2] : g2 && same(p, g2) ? [g1] : []));
      for (const queue = [all[0]]; queue.length;)
        for (const q of [...adjacent(b, queue[queue.length - 1]), ...via(queue.pop()!)]) {
          if (b.cells[q.r][q.c].kind !== 'space' || seen.has(`${q.r},${q.c}`)) continue;
          seen.add(`${q.r},${q.c}`);
          queue.push(q);
        }
      expect(seen.size, m.id).toBe(all.length);
    }
  });

  it('moves a ship across hexes, up to its number', () => {
    const from = orbitals(BASE.board, CENTRE)[0];
    const s = scenario({ p0d0: [from, 1] });
    const moves = [...moveOptions(s, 'p0d0').moves.values()].map((m) => m.cell);
    // Next to the planet, a Battlestation (moves 1) has the 5 spaces around it that aren't the planet.
    expect(moves).toHaveLength(5);
    for (const q of moves) expect(distance(from, q)).toBe(1);
    const s3 = scenario({ p0d0: [from, 3] });
    for (const m of moveOptions(s3, 'p0d0').moves.values()) expect(distance(from, m.cell)).toBeLessThanOrEqual(3);
  });

  it('counts ships on any of a planet’s six orbital hexes towards a conquest', () => {
    const [, , a, b, c, d] = orbitals(BASE.board, CENTRE);
    const s = scenario({ p0d0: [a, 1], p0d1: [b, 1], p0d2: [c, 2], p0d3: [d, 4] });
    expect(conquerCheck(s, 0, CENTRE.id)).toMatchObject({ ok: true, sum: 8 });
    const after = apply(s, { type: 'conquer', planet: CENTRE.id });
    expect(after.board.planets[CENTRE.id].cubes).toContain(0);
  });

  it('carries only ships on the six touching hexes, not ones further off', () => {
    const b = BASE.board;
    const from = orbitals(b, CENTRE)[0];
    const side = adjacent(b, from).find((q) => b.cells[q.r][q.c].kind === 'space')!;
    const diagonal = spaces(b).find((q) => distance(from, q) === 2)!;
    expect(carryPassengers(scenario({ p0d0: [from, 2], p0d1: [side, 3] }), 'p0d0').map((d) => d.id)).toEqual(['p0d1']);
    expect(carryPassengers(scenario({ p0d0: [from, 2], p0d1: [diagonal, 3] }), 'p0d0')).toEqual([]);
  });

  it('leaves Ingenious (conquer from the corners) out of the deck, as hex tiles have no corners', () => {
    const cards = (mapId: string) => {
      const s = createGame({ players: players(2), seed: 1, mode: 'regolith', mapId });
      expect(checkInvariants(s)).toEqual([]);
      const { skillDeck, skillRow } = s.market;
      const drafts = s.pending.flatMap((x) => (x.kind === 'skillDraft' ? x.options : []));
      return [...skillDeck, ...skillRow, ...drafts].map(effectOf);
    };
    expect(cards('alpha-hex')).not.toContain('ingenious');
  });

  for (const m of HEX_MAPS)
    it(`plays out with AI players on ${m.name}`, () => {
      const { state } = playAiGame({
        mode: 'regolith',
        players: m.players,
        seed: 3,
        aiSeed: 7,
        mapId: m.id,
        levels: Array(m.players).fill(2),
      });
      expect(state.winner).not.toBeNull();
    }, 60_000);
});
