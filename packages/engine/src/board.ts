import type { Board, BoardCell, Cell, GameState, Planet } from './types';
import type { MapDef } from './data';

/*
 * Boards are flat-topped hexes in axial coordinates, `c` the column (q) and `r` the axial row, so the six
 * neighbours are the steps below (docs/HEX.md).
 */
export const SIDES: readonly Cell[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
];
/** The six hexes two away between two neighbours, which the log counts as near a planet (core.ts `logTo`). */
const BETWEEN: readonly Cell[] = [
  { r: -2, c: 1 },
  { r: 2, c: -1 },
  { r: -1, c: -1 },
  { r: 1, c: 1 },
  { r: -1, c: 2 },
  { r: 1, c: -2 },
];

/** Hexes between two cells, along a delta. */
const steps = (d: Cell) => (Math.abs(d.r) + Math.abs(d.c) + Math.abs(d.r + d.c)) / 2;

/*
 * A hex map's tiles are 7-hex flowers: the planet and the six spaces around it. Flowers tile the plane
 * on a lattice of their own, turned about 11° from the hexes; a layout row runs along TILE_ROW, and odd
 * rows sit half a tile to the right, between the tiles of the rows above and below.
 */
const TILE_ROW: Cell = { r: -1, c: 3 };
const TILE_DOWN_RIGHT: Cell = { r: 2, c: 1 };
const TILE_DOWN_LEFT: Cell = { r: 3, c: -2 };

export const CAPACITY: Record<number, number> = { 7: 1, 8: 2, 9: 3, 10: 4 };

/*
 * Where a tile's planet sits, as a step from the tile's middle space: a layout token's direction
 * (data/maps.yaml), none for the middle, or one of its 6 outer hexes. North is up as the map is drawn.
 */
const OFFSETS: Record<string, Cell> = Object.fromEntries(['n', 's', 'nw', 'se', 'ne', 'sw'].map((n, i) => [n, SIDES[i]]));
const MIDDLE: Cell = { r: 0, c: 0 };

/** A layout token (data/maps.yaml), other than a gap: the planet's number (0 for void or blank), whether it's a start, and where on the tile it sits. */
export interface TileToken {
  number: number;
  start: boolean;
  /** A blank tile (`-`): open ground, no planet and, unlike a void, no research. */
  blank?: true;
  /** The planet's compass direction from the tile's middle space; absent when it sits in the middle. */
  dir?: string;
}

/** Reads a layout token such as `8`, `9*`, `7ne`, `8s*` or `-`; throws on anything else, east and west too (a hex has no side that way). */
export function parseToken(token: string): TileToken {
  if (token === '-') return { number: 0, start: false, blank: true };
  const m = /^(\d+)([nsew]{1,2})?(\*)?$/.exec(token);
  const number = Number(m?.[1]);
  if (!m || !(number === 0 || number in CAPACITY) || (m[2] && !(m[2] in OFFSETS))) throw new Error(`Bad tile token "${token}"`);
  if (number === 0 && (m[2] || m[3])) throw new Error(`A void tile has no objective to place or start on: "${token}"`);
  return m[2] ? { number, start: !!m[3], dir: m[2] } : { number, start: !!m[3] };
}

/** The step from a tile's middle space to its planet. */
const planetOffset = (t: TileToken): Cell => (t.dir ? OFFSETS[t.dir] : MIDDLE);

/** Ships each player places around their starting planet at setup (setup.ts). */
export const STARTING_SHIPS = 3;

/**
 * Checks what an off-centre planet could break: each starting planet needs room for the starting
 * ships, in orbital spaces no other start shares. Orbits that overlap are otherwise fine.
 */
function checkStarts(board: Board) {
  const starts = board.planets.filter((p) => p.start);
  for (const p of starts) {
    const others = starts.filter((q) => q !== p).flatMap((q) => orbitals(board, q));
    const own = orbitals(board, p).filter((x) => !others.some((y) => same(x, y)));
    if (own.length < STARTING_SHIPS)
      throw new Error(
        `${board.mapId}: starting objective ${p.number} has ${own.length} perimeter spaces of its own, needs ${STARTING_SHIPS}`,
      );
  }
}

/** A board's cells, all off it till tiles are laid. */
const offCells = (rows: number, cols: number): BoardCell[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ kind: 'off' as const, tile: -1 })));

/** Lays tile `tile` on the board: its `spaces` (a Void's all void), and its planet, if it has one, `t.dir` from `middle`. */
function layTile(cells: BoardCell[][], planets: Planet[], t: TileToken, tile: number, spaces: Cell[], middle: Cell) {
  for (const p of spaces) {
    const cell: BoardCell = { kind: 'space', tile };
    if (t.number === 0 && !t.blank) cell.void = true;
    cells[p.r][p.c] = cell;
  }
  if (t.number === 0) return;
  const d = planetOffset(t);
  const [r, c] = [middle.r + d.r, middle.c + d.c];
  const id = planets.length;
  planets.push({ id, number: t.number, capacity: CAPACITY[t.number], cubes: [], start: t.start, r, c });
  cells[r][c] = { kind: 'planet', tile, planet: id };
}

export function buildBoard(map: MapDef): Board {
  const board = buildHexBoard(map);
  checkStarts(board);
  return board;
}

/** The planet of each hex tile in a layout (axial, before shifting onto the board), with its token. */
function hexTiles(map: MapDef): { r: number; c: number; token: string; tile: number }[] {
  const tileCols = Math.max(...map.layout.map((r) => r.length));
  const out: { r: number; c: number; token: string; tile: number }[] = [];
  map.layout.forEach((row, tr) => {
    const pairs = Math.floor(tr / 2);
    const odd = tr % 2;
    row.forEach((token, tc) => {
      if (token === '.') return;
      out.push({
        r: tc * TILE_ROW.r + pairs * (TILE_DOWN_RIGHT.r + TILE_DOWN_LEFT.r) + odd * TILE_DOWN_RIGHT.r,
        c: tc * TILE_ROW.c + pairs * (TILE_DOWN_RIGHT.c + TILE_DOWN_LEFT.c) + odd * TILE_DOWN_RIGHT.c,
        token,
        tile: tr * tileCols + tc,
      });
    });
  });
  return out;
}

function buildHexBoard(map: MapDef): Board {
  const tiles = hexTiles(map);
  const flower = [{ r: 0, c: 0 }, ...SIDES];
  const all = tiles.flatMap((t) => flower.map((d) => ({ r: t.r + d.r, c: t.c + d.c })));
  const r0 = Math.min(...all.map((p) => p.r));
  const c0 = Math.min(...all.map((p) => p.c));
  const rows = Math.max(...all.map((p) => p.r)) - r0 + 1;
  const cols = Math.max(...all.map((p) => p.c)) - c0 + 1;
  const cells = offCells(rows, cols);
  const planets: Planet[] = [];
  for (const t of tiles) {
    const spaces = flower.map((d) => ({ r: t.r - r0 + d.r, c: t.c - c0 + d.c }));
    if (spaces.some((p) => cells[p.r][p.c].kind !== 'off')) throw new Error(`${map.id}: hex tiles overlap`);
    layTile(cells, planets, parseToken(t.token), t.tile, spaces, spaces[0]);
  }
  return { mapId: map.id, mapName: map.name, rows, cols, cells, planets, world: map.world ?? 'mars' };
}

/** How far a flat-topped hex's centre is from the next column's, in hex heights (√3 / 2). */
const HEX_COLUMN = Math.sqrt(3) / 2;
/** How far a flat-topped hex's left and right corners reach past its box (one space square): 1 / √3 − 1 / 2. */
const HEX_OVERHANG = 1 / Math.sqrt(3) - 0.5;

/** Where a board is drawn: each space's place and the whole board's size, in spaces (cell units). */
export interface Drawing {
  rows: number;
  cols: number;
  /** A space's top-left corner, in spaces from the board's; its box is one space square. */
  at: (p: Cell) => Cell;
}

const DRAWINGS = new WeakMap<BoardCell[][], Drawing>();

/**
 * How a board is drawn. Its flat-topped hexes are one
 * space tall (flat side to flat side), with columns HEX_COLUMN apart, each half a hex lower than the
 * one before; `at` gives the top left of the square box centred on the hex, and the drawing is wide
 * enough for the hexes' corners past their boxes at either side. Fractional positions (a ship part-way
 * into its target) work too.
 */
export function drawing(board: Board): Drawing {
  let d = DRAWINGS.get(board.cells);
  if (d) return d;
  const raw = (p: Cell) => ({ r: p.r + p.c / 2, c: p.c * HEX_COLUMN });
  const on: Cell[] = [];
  board.cells.forEach((row, r) => row.forEach((x, c) => x.kind !== 'off' && on.push(raw({ r, c }))));
  const top = Math.min(...on.map((p) => p.r));
  const left = Math.min(...on.map((p) => p.c)) - HEX_OVERHANG;
  d = {
    rows: Math.max(...on.map((p) => p.r)) - top + 1,
    cols: Math.max(...on.map((p) => p.c)) - left + 1 + HEX_OVERHANG,
    at: (p) => {
      const q = raw(p);
      return { r: q.r - top, c: q.c - left };
    },
  };
  DRAWINGS.set(board.cells, d);
  return d;
}

/**
 * The space drawn at a point of the drawing (in spaces from its top left), if any: the
 * nearest on-board hex within 0.75 spaces of the point: that is the hex the point lies in, or, a little
 * way off the map's edge, the hex nearest it, so a tap just outside still counts.
 */
export function cellAtPoint(board: Board, y: number, x: number): Cell | undefined {
  const { at } = drawing(board);
  let best: Cell | undefined;
  let near = 0.75;
  for (const p of grid(board).cells) {
    if (!onBoard(board, p)) continue;
    const q = at(p);
    const d = Math.hypot(q.r + 0.5 - y, q.c + 0.5 - x);
    if (d < near) [best, near] = [p, d];
  }
  return best;
}

export const key = (p: Cell) => `${p.r},${p.c}`;
export const same = (a: Cell, b: Cell) => a.r === b.r && a.c === b.c;

export function cellAt(board: Board, p: Cell): BoardCell | undefined {
  return board.cells[p.r]?.[p.c];
}

/** Every space (not a planet, void or off-board cell) on the board, row by row. */
export function spaces(board: Board): Cell[] {
  const out: Cell[] = [];
  board.cells.forEach((row, r) => row.forEach((cell, c) => cell.kind === 'space' && out.push({ r, c })));
  return out;
}

/** The step from a to b along each axis. */
export function delta(a: Cell, b: Cell): Cell {
  return { r: b.r - a.r, c: b.c - a.c };
}

/** Steps between two cells: how many hexes apart they are. */
export function distance(a: Cell, b: Cell): number {
  return steps(delta(a, b));
}

export function onBoard(board: Board, p: Cell): boolean {
  const cell = cellAt(board, p);
  return !!cell && cell.kind !== 'off';
}

/** The cells one step from p in each direction. */
export function offsets(p: Cell, deltas: readonly Cell[]): Cell[] {
  return deltas.map((d) => ({ r: p.r + d.r, c: p.c + d.c }));
}

/** Straight lines out of a space along each of its 6 sides, nearest first, as far as the board's edge. */
export function straightLines(board: Board, start: Cell): Cell[][] {
  return SIDES.map((dir) => {
    const line: Cell[] = [];
    let at = start;
    for (let k = 0; k < board.rows + board.cols; k++) {
      [at] = offsets(at, [dir]);
      if (!onBoard(board, at)) break;
      if (same(at, start) || line.some((p) => same(p, at))) break;
      line.push(at);
    }
    return line;
  });
}

/**
 * A board's cells by index (r * cols + c), with each cell's neighbours: they never change, and the
 * AI asks for them for every ship in every position it scores. Cached by `cells`, which states share
 * (see engine.ts copyState). The lists are frozen, as every caller gets the same one.
 */
export interface Grid {
  cols: number;
  size: number;
  cells: readonly Cell[];
  /** Whether a ship may stand on the cell. */
  space: readonly boolean[];
  /** Neighbour indexes on the board: the cells next to each one, out of its 6 sides. */
  ortho: readonly (readonly number[])[];
  orthoCells: readonly (readonly Cell[])[];
}

const GRIDS = new WeakMap<BoardCell[][], Grid>();

export function grid(board: Board): Grid {
  let g = GRIDS.get(board.cells);
  if (g) return g;
  const { rows, cols } = board;
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push(Object.freeze({ r, c }));
  const near = (deltas: readonly Cell[]) =>
    cells.map((p) =>
      Object.freeze(
        offsets(p, deltas)
          .filter((q) => onBoard(board, q))
          .map((q) => cells[q.r * cols + q.c]),
      ),
    );
  const orthoCells = near(SIDES);
  const index = (list: readonly Cell[]) => Object.freeze(list.map((q) => q.r * cols + q.c));
  g = {
    cols,
    size: rows * cols,
    cells,
    space: cells.map((p) => cellAt(board, p)?.kind === 'space'),
    ortho: orthoCells.map(index),
    orthoCells,
  };
  GRIDS.set(board.cells, g);
  return g;
}

/** A cell's index in grid(board), or -1 if it is not a cell of the board (as in a malformed action). */
export function cellIndex(board: Board, p: Cell | undefined): number {
  const { r, c } = p ?? {};
  const inside = Number.isInteger(r) && Number.isInteger(c) && r! >= 0 && c! >= 0 && r! < board.rows && c! < board.cols;
  return inside ? r! * board.cols + c! : -1;
}

/** The cells next to p that are on the board, out of its 6 sides. */
export function adjacent(board: Board, p: Cell): readonly Cell[] {
  if (p.r < 0 || p.c < 0 || p.r >= board.rows || p.c >= board.cols) return offsets(p, SIDES).filter((q) => onBoard(board, q));
  return grid(board).orthoCells[p.r * board.cols + p.c];
}

/** The neighbours of p plus its Warp Gate partner: the two gate spaces count as adjacent (RULE-SUGGESTIONS #30). */
export function linked(state: GameState, p: Cell): Cell[] {
  return [...adjacent(state.board, p), ...gatePartner(state, p)];
}

/** Movement neighbours, Warp Gate links included. */
export function stepNeighbours(state: GameState, p: Cell): readonly Cell[] {
  const result = adjacent(state.board, p);
  return state.gates.length === 2 ? [...result, ...gatePartner(state, p)] : result;
}

/** The other Warp Gate space, when p is one of two placed gates. */
function gatePartner(state: GameState, p: Cell): Cell[] {
  if (state.gates.length !== 2) return [];
  const [a, b] = state.gates;
  return same(p, a) ? [b] : same(p, b) ? [a] : [];
}

/** The other Warp Gate / Ice Tunnel space, when p is one of two placed gates. */
export function otherGate(state: GameState, p: Cell): Cell | undefined {
  if (state.gates.length !== 2) return undefined;
  const [a, b] = state.gates;
  return same(p, a) ? b : same(p, b) ? a : undefined;
}

const isSpace = (board: Board, p: Cell) => cellAt(board, p)?.kind === 'space';

const ORBITS = new WeakMap<BoardCell[][], (readonly Cell[])[]>();

/**
 * A planet's orbital positions: the spaces next to it. An off-centre planet's orbit reaches onto
 * neighbouring tiles, or loses the spaces off the map's edge; orbits may overlap, so a space can orbit
 * several planets, and a planet next to another doesn't orbit it. Cached by `cells`, like grid().
 */
export function orbitals(board: Board, planet: Planet): readonly Cell[] {
  let orbits = ORBITS.get(board.cells);
  if (!orbits) ORBITS.set(board.cells, (orbits = []));
  return (orbits[planet.id] ??= Object.freeze(adjacent(board, planet).filter((q) => isSpace(board, q))));
}

/** The planets a space orbits: none, one, or several where orbits overlap. */
export function orbitedPlanets(board: Board, p: Cell): Planet[] {
  return board.planets.filter((planet) => orbitals(board, planet).some((q) => same(q, p)));
}

/** The spaces two hexes from a planet between two of its sides: near it, but not in its orbit (core.ts `logTo`). */
export function diagonals(board: Board, planet: Planet): Cell[] {
  return offsets(planet, BETWEEN).filter((q) => isSpace(board, q));
}

const CENTRES = new WeakMap<BoardCell[][], ReadonlyMap<number, Cell>>();

/**
 * Each tile's middle space, by tile index (`BoardCell.tile`): the one space whose neighbours all lie on
 * its own tile. The planet's, unless it sits off-centre. Cached by `cells`, like grid().
 */
export function tileCentres(board: Board): ReadonlyMap<number, Cell> {
  let out = CENTRES.get(board.cells);
  if (out) return out;
  const centres = new Map<number, Cell>();
  board.cells.forEach((row, r) =>
    row.forEach((x, c) => {
      if (x.kind !== 'off' && SIDES.every((d) => cellAt(board, { r: r + d.r, c: c + d.c })?.tile === x.tile)) centres.set(x.tile, { r, c });
    }),
  );
  CENTRES.set(board.cells, (out = centres));
  return out;
}

/** Whether two tiles touch along a side: the 6 tiles around a flower. Their middle spaces are then 3 apart. */
export function tilesTouch(board: Board, a: number, b: number): boolean {
  const centres = tileCentres(board);
  const [p, q] = [centres.get(a), centres.get(b)];
  return !!p && !!q && distance(p, q) === 3;
}

export function planetFreeSlots(planet: Planet): number {
  return planet.capacity - planet.cubes.length;
}
