import { adjacent, cellAt, cellOf, delta, drawing, geometry, onBoard, type Board, type Cell, type GameState } from '@regolith/engine';

/** Where each ship on the map is drawn, by id, in cell units from the map's top left (engine drawing). */
export type ShipSpots = Map<string, { r: number; c: number }>;

/** The pixel box (one space square) at a drawn spot, in spaces from the map's top left. */
export const spotBox = (spot: Cell, cell: number) => ({ left: spot.c * cell, top: spot.r * cell, width: cell, height: cell });

/**
 * Where board spaces are drawn on the map, in pixels (engine `drawing`, so square and hex boards alike):
 * `box` a space's box (one space square), `mid` its middle.
 */
export function placement(board: Board, cell: number) {
  const { at } = drawing(board);
  return {
    box: (p: Cell) => spotBox(at(p), cell),
    mid: (p: Cell) => {
      const q = at(p);
      return { x: (q.c + 0.5) * cell, y: (q.r + 0.5) * cell };
    },
  };
}

/** The gap each side of a square tile, in spaces: tiles stand a little apart, as on the table. */
export const SQUARE_TILE_GAP = 0.015;

/** A flat-topped hex one space tall has corners this far from its centre (1 / √3 spaces), and sides as long. */
const HEX_CORNER = 1 / Math.sqrt(3);

/** The corners of a flat-topped hex `size` spaces tall centred on (x, y), from the right going clockwise (SVG's and canvas's y is down). */
export const hexCorners = (x: number, y: number, size: number) =>
  Array.from({ length: 6 }, (_, i) => [
    x + HEX_CORNER * size * Math.cos((Math.PI / 3) * i),
    y + HEX_CORNER * size * Math.sin((Math.PI / 3) * i),
  ]);

/** A hex tile's hexes: its middle (`t`) and the six around it. */
export const hexFlower = (board: Board, t: Cell) => [t, ...adjacent(board, t)];

/**
 * A hex map's tiles, in pixels, as an SVG path (for a CSS `clip-path: path()`): each of their hexes, a touch larger
 * as MapTiles clips them, so no hairline shows between them.
 */
export function hexMapPath(board: Board, cell: number, tiles: readonly Cell[]): string {
  const { mid } = placement(board, cell);
  return tiles
    .flatMap((t) => hexFlower(board, t))
    .map((p) => {
      const { x, y } = mid(p);
      return `M${hexCorners(x, y, cell * 1.01)
        .map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`)
        .join('L')}Z`;
    })
    .join('');
}

/**
 * The seams of a hex map, in pixels: each hex side where the next hex is another tile's, or off the map, as its
 * two ends. A seam between two tiles comes twice, once from each side.
 */
export function hexSeams(board: Board, cell: number, tiles: readonly Cell[]): number[][][] {
  const { mid } = placement(board, cell);
  const tileOf = (p: Cell) => cellAt(board, p)?.tile;
  return tiles
    .flatMap((t) => hexFlower(board, t))
    .flatMap((p) =>
      geometry(board)
        .sides.map((d) => ({ r: p.r + d.r, c: p.c + d.c }))
        .filter((q) => tileOf(q) !== tileOf(p))
        .map((q) => {
          // Across the middle of the line between the two centres (one space long), half a side each way.
          const [a, b] = [mid(p), mid(q)];
          const [x, y] = [(a.x + b.x) / 2, (a.y + b.y) / 2];
          const [dx, dy] = [((b.y - a.y) * HEX_CORNER) / 2, ((a.x - b.x) * HEX_CORNER) / 2];
          return [
            [x - dx, y - dy],
            [x + dx, y + dy],
          ];
        }),
    );
}

/** Where each ship on the map is drawn, in cell units (an attacker sits part-way into its target, unless it shot from where it is). */
export function shipSpots(game: GameState): ShipSpots {
  const head = game.pending[0];
  const combat = head?.kind === 'combat' ? head : null;
  const spots = new Map<string, { r: number; c: number }>();
  const { at: drawn } = drawing(game.board);
  for (const d of game.dice) {
    const at = cellOf(d);
    if (!at) continue;
    let { r, c } = at;
    if (combat && !combat.ranged && combat.attacker.die === d.id) {
      const d = delta(combat.from, combat.at, game.board);
      r += d.r * 0.42;
      c += d.c * 0.42;
    }
    spots.set(d.id, drawn({ r, c }));
  }
  return spots;
}

export interface WrapMark {
  r: number;
  c: number;
  /** The edge the mark sits on. */
  side: 'top' | 'bottom' | 'left' | 'right';
}

/** Board-edge spaces that join the opposite edge on a wrapping map, one mark per joined pair end. */
export function wrapMarks(board: Board): WrapMark[] {
  const marks: WrapMark[] = [];
  const { rows, cols, wrap } = board;
  if (wrap?.cols)
    for (let r = 0; r < rows; r++)
      if (onBoard(board, { r, c: 0 }) && onBoard(board, { r, c: cols - 1 }))
        marks.push({ r, c: 0, side: 'left' }, { r, c: cols - 1, side: 'right' });
  if (wrap?.rows)
    for (let c = 0; c < cols; c++)
      if (onBoard(board, { r: 0, c }) && onBoard(board, { r: rows - 1, c }))
        marks.push({ r: 0, c, side: 'top' }, { r: rows - 1, c, side: 'bottom' });
  return marks;
}
