import type { Board, BoardCell, Cell, GameState, Planet } from './types';
import type { MapDef } from './data';

const ORTHO: Cell[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
];
const DIAG: Cell[] = [
  { r: -1, c: -1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
  { r: 1, c: 1 },
];
/*
 * Hex boards (MapDef.grid 'hex'): flat-topped hexes in axial coordinates, `c` the column (q) and `r`
 * the axial row, so the six neighbours are the steps below. A hex's "diagonals" are the six hexes two
 * away between two neighbours, as a square's are the four corners between two neighbours: a diagonal
 * step covers two spaces of distance in one step, as on squares (docs/HEX.md).
 */
const HEX_SIDES: Cell[] = [
  { r: -1, c: 0 },
  { r: 1, c: 0 },
  { r: 0, c: -1 },
  { r: 0, c: 1 },
  { r: -1, c: 1 },
  { r: 1, c: -1 },
];
const HEX_DIAG: Cell[] = [
  { r: -2, c: 1 },
  { r: 2, c: -1 },
  { r: -1, c: -1 },
  { r: 1, c: 1 },
  { r: -1, c: 2 },
  { r: 1, c: -2 },
];

/**
 * What is next to what on a board, as steps from a space: everything that differs between square and hex
 * boards goes through this, so the rules and the AI read the same on both (docs/HEX.md).
 */
export interface Geometry {
  /** The spaces next to one (adjacent: moving, attacking, orbiting): 4 orthogonal, or a hex's 6 sides. */
  sides: readonly Cell[];
  /** The Interceptor's diagonals, two spaces of distance in one step: a square's 4 corners, or the 6 hexes between two sides. */
  diagonals: readonly Cell[];
  /** The spaces touching one (the Flagship's carry): a square's 8 with the corners, a hex's 6 sides. */
  touching: readonly Cell[];
  /** Steps along a delta: rows + columns, or hexes. */
  steps: (d: Cell) => number;
}

const SQUARE: Geometry = {
  sides: ORTHO,
  diagonals: DIAG,
  touching: [...ORTHO, ...DIAG],
  steps: (d) => Math.abs(d.r) + Math.abs(d.c),
};

const HEX: Geometry = {
  sides: HEX_SIDES,
  diagonals: HEX_DIAG,
  touching: HEX_SIDES,
  steps: (d) => (Math.abs(d.r) + Math.abs(d.c) + Math.abs(d.r + d.c)) / 2,
};

export const geometry = (board: Board): Geometry => (board.hex ? HEX : SQUARE);

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
 * (data/maps.yaml), none for the middle. A square tile's planet may sit on any of the 8 spaces around
 * the middle, corners too; a hex tile's on any of its 6 outer hexes. North is up as the map is drawn.
 */
const named = (names: readonly string[], steps: readonly Cell[]): Record<string, Cell> =>
  Object.fromEntries(names.map((n, i) => [n, steps[i]]));
const SQUARE_OFFSETS = named(['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'], [...ORTHO, ...DIAG]);
const HEX_OFFSETS = named(['n', 's', 'nw', 'se', 'ne', 'sw'], HEX_SIDES);
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

/** Reads a layout token such as `8`, `9*`, `7ne`, `8s*` or `-`; throws on anything else. */
export function parseToken(token: string): TileToken {
  if (token === '-') return { number: 0, start: false, blank: true };
  const m = /^(\d+)([nsew]{1,2})?(\*)?$/.exec(token);
  const number = Number(m?.[1]);
  if (!m || !(number === 0 || number in CAPACITY) || (m[2] && !(m[2] in SQUARE_OFFSETS))) throw new Error(`Bad tile token "${token}"`);
  if (number === 0 && (m[2] || m[3])) throw new Error(`A void tile has no planet to place or start on: "${token}"`);
  return m[2] ? { number, start: !!m[3], dir: m[2] } : { number, start: !!m[3] };
}

/** The step from a tile's middle space to its planet. */
function planetOffset(t: TileToken, hex: boolean, mapId: string): Cell {
  if (!t.dir) return MIDDLE;
  const d = (hex ? HEX_OFFSETS : SQUARE_OFFSETS)[t.dir];
  if (!d) throw new Error(`${mapId}: a hex tile's planet can't sit "${t.dir}" (n, ne, se, s, sw or nw)`);
  return d;
}

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
      throw new Error(`${board.mapId}: starting planet ${p.number} has ${own.length} orbital spaces of its own, needs ${STARTING_SHIPS}`);
  }
}

/** A board's cells, all off it till tiles are laid. */
const offCells = (rows: number, cols: number): BoardCell[][] =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ kind: 'off' as const, tile: -1 })));

/** Lays tile `tile` on the board: its `spaces` (a Void's all void), and its planet, if it has one, `t.dir` from `middle`. */
function layTile(
  cells: BoardCell[][],
  planets: Planet[],
  t: TileToken,
  tile: number,
  spaces: Cell[],
  middle: Cell,
  hex: boolean,
  mapId: string,
) {
  for (const p of spaces) {
    const cell: BoardCell = { kind: 'space', tile };
    if (t.number === 0 && !t.blank) cell.void = true;
    cells[p.r][p.c] = cell;
  }
  if (t.number === 0) return;
  const d = planetOffset(t, hex, mapId);
  const [r, c] = [middle.r + d.r, middle.c + d.c];
  const id = planets.length;
  planets.push({ id, number: t.number, capacity: CAPACITY[t.number], cubes: [], start: t.start, r, c });
  cells[r][c] = { kind: 'planet', tile, planet: id };
}

export function buildBoard(map: MapDef): Board {
  const board = map.grid === 'hex' ? buildHexBoard(map) : buildSquareBoard(map);
  checkStarts(board);
  return board;
}

function buildSquareBoard(map: MapDef): Board {
  const tileRows = map.layout.length;
  const tileCols = Math.max(...map.layout.map((r) => r.length));
  const rows = tileRows * 3;
  const cols = tileCols * 3;
  const cells = offCells(rows, cols);
  const planets: Planet[] = [];

  map.layout.forEach((row, tr) => {
    row.forEach((token, tc) => {
      if (token === '.') return;
      const spaces = [0, 1, 2].flatMap((dr) => [0, 1, 2].map((dc) => ({ r: tr * 3 + dr, c: tc * 3 + dc })));
      layTile(cells, planets, parseToken(token), tr * tileCols + tc, spaces, spaces[4], false, map.id);
    });
  });

  return { mapId: map.id, mapName: map.name, rows, cols, cells, planets };
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
  const flower = [{ r: 0, c: 0 }, ...HEX_SIDES];
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
    layTile(cells, planets, parseToken(t.token), t.tile, spaces, spaces[0], true, map.id);
  }
  return { mapId: map.id, mapName: map.name, rows, cols, cells, planets, hex: true, world: map.world ?? 'mars' };
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
 * How a board is drawn. Square boards are drawn as stored. A hex board's flat-topped hexes are one
 * space tall (flat side to flat side), with columns HEX_COLUMN apart, each half a hex lower than the
 * one before; `at` gives the top left of the square box centred on the hex, and the drawing is wide
 * enough for the hexes' corners past their boxes at either side. Fractional positions (a ship part-way
 * into its target) work too.
 */
export function drawing(board: Board): Drawing {
  let d = DRAWINGS.get(board.cells);
  if (d) return d;
  if (!board.hex) d = { rows: board.rows, cols: board.cols, at: (p) => p };
  else {
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
  }
  DRAWINGS.set(board.cells, d);
  return d;
}

/**
 * The space drawn at a point of the drawing (in spaces from its top left), if any. On a hex board, the
 * nearest on-board hex within 0.75 spaces of the point: that is the hex the point lies in, or, a little
 * way off the map's edge, the hex nearest it, so a tap just outside still counts.
 */
export function cellAtPoint(board: Board, y: number, x: number): Cell | undefined {
  if (!board.hex) return { r: Math.floor(y), c: Math.floor(x) };
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

/** Steps between two cells: orthogonal (Manhattan) distance; hexes apart on a hex board. */
export function distance(a: Cell, b: Cell, board: Board): number {
  return geometry(board).steps(delta(a, b));
}

export function onBoard(board: Board, p: Cell): boolean {
  const cell = cellAt(board, p);
  return !!cell && cell.kind !== 'off';
}

/** The cells one step from p in each direction. */
export function offsets(p: Cell, deltas: readonly Cell[]): Cell[] {
  return deltas.map((d) => ({ r: p.r + d.r, c: p.c + d.c }));
}

/**
 * Straight lines out of a space along each side/direction (4 on squares, 6 on hexes), nearest first, as far
 * as the board's edge.
 */
export function straightLines(board: Board, start: Cell): Cell[][] {
  return geometry(board).sides.map((dir) => {
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
  /**
   * Neighbour indexes on the board (see Geometry): `ortho` the spaces next to it (4 orthogonal, or a hex's
   * 6 sides), `around` those and the diagonals, an Interceptor's steps (8 around a square, 12 for a hex).
   */
  ortho: readonly (readonly number[])[];
  around: readonly (readonly number[])[];
  orthoCells: readonly (readonly Cell[])[];
  aroundCells: readonly (readonly Cell[])[];
  /** The spaces touching each one: `aroundCells` on a square board, `orthoCells` on a hex one. */
  touchingCells: readonly (readonly Cell[])[];
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
  const { sides, diagonals, touching } = geometry(board);
  const orthoCells = near(sides);
  const aroundCells = near([...sides, ...diagonals]);
  const index = (list: readonly Cell[]) => Object.freeze(list.map((q) => q.r * cols + q.c));
  g = {
    cols,
    size: rows * cols,
    cells,
    space: cells.map((p) => cellAt(board, p)?.kind === 'space'),
    ortho: orthoCells.map(index),
    around: aroundCells.map(index),
    orthoCells,
    aroundCells,
    touchingCells: touching === sides ? orthoCells : near(touching),
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

/** The neighbours of p on the board: next to it, also diagonal (an Interceptor's steps), or touching it. */
function neighbours(board: Board, p: Cell, kind: 'sides' | 'diagonal' | 'touching'): readonly Cell[] {
  if (p.r < 0 || p.c < 0 || p.r >= board.rows || p.c >= board.cols) {
    const { sides, diagonals, touching } = geometry(board);
    const deltas = kind === 'sides' ? sides : kind === 'diagonal' ? [...sides, ...diagonals] : touching;
    return offsets(p, deltas).filter((q) => onBoard(board, q));
  }
  const g = grid(board);
  return (kind === 'sides' ? g.orthoCells : kind === 'diagonal' ? g.aroundCells : g.touchingCells)[p.r * board.cols + p.c];
}

/** The spaces next to p that are on the board: the 4 orthogonal ones, or a hex's 6. */
export function adjacent(board: Board, p: Cell): readonly Cell[] {
  return neighbours(board, p, 'sides');
}

/** The orthogonal neighbours of p plus its Warp Gate partner: the two gate spaces count as adjacent (RULE-SUGGESTIONS #30). */
export function linked(state: GameState, p: Cell): Cell[] {
  return [...adjacent(state.board, p), ...gatePartner(state, p)];
}

/** The spaces touching p that are on the board: the 8 around a square, a hex's 6 sides. */
export function surrounding(board: Board, p: Cell): readonly Cell[] {
  return neighbours(board, p, 'touching');
}

/** Movement neighbours, including diagonals for interceptors and Warp Gate links. */
export function stepNeighbours(state: GameState, p: Cell, diagonal: boolean): readonly Cell[] {
  const result = neighbours(state.board, p, diagonal ? 'diagonal' : 'sides');
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

export function isDiagonalStep(a: Cell, b: Cell, board: Board): boolean {
  const d = delta(a, b);
  return geometry(board).diagonals.some((x) => same(x, d));
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

export function diagonals(board: Board, planet: Planet): Cell[] {
  return offsets(planet, geometry(board).diagonals).filter((q) => isSpace(board, q));
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
  const { sides } = geometry(board);
  board.cells.forEach((row, r) =>
    row.forEach((x, c) => {
      if (x.kind !== 'off' && sides.every((d) => cellAt(board, { r: r + d.r, c: c + d.c })?.tile === x.tile)) centres.set(x.tile, { r, c });
    }),
  );
  CENTRES.set(board.cells, (out = centres));
  return out;
}

/**
 * Whether two tiles touch along a side: the 4 orthogonal neighbours of a square tile (not the
 * diagonal ones), or the 6 around a hex flower. Their middle spaces are then 3 apart.
 */
export function tilesTouch(board: Board, a: number, b: number): boolean {
  const centres = tileCentres(board);
  const [p, q] = [centres.get(a), centres.get(b)];
  return !!p && !!q && distance(p, q, board) === 3;
}

export function planetFreeSlots(planet: Planet): number {
  return planet.capacity - planet.cubes.length;
}
