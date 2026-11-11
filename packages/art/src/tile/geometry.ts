import { CUBE_PAD, NUMBER_TEXT, OBJECTIVE_CAPACITY, TILE } from '../tokens';
import { n, type Box } from '../svg';

/**
 * Where things are on a tile, in trim millimetres: its spaces (a 7-hex flower), its objective in the middle and
 * where its number and cube pads go round it, and the tile's shape and die-cut line. Shared by every world's
 * ground (index.ts puts a tile together).
 */

/** A point on a tile in spaces from its middle, x right and y down. */
export interface Spot {
  x: number;
  y: number;
}

/**
 * A tile's spaces by compass direction, `''` for the middle, in spaces as drawn: north is up, and the outer
 * hexes are flat-topped hexes one space tall around the middle one.
 */
export const TILE_SPOTS: Readonly<Record<string, Spot>> = {
  '': { x: 0, y: 0 },
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  ...Object.fromEntries(
    [-1, 1].flatMap((sx) => [-0.5, 0.5].map((y) => [`${y < 0 ? 'n' : 's'}${sx < 0 ? 'w' : 'e'}`, { x: (sx * Math.sqrt(3)) / 2, y }])),
  ),
};

/**
 * Where the spaces meet at an objective's bottom right, in spaces from its middle: the vertex three hexes share
 * (its own, the one below and the one below right). Clear of dice, so the number goes there.
 */
const MEET: Spot = { x: 0.5 / Math.sqrt(3), y: 0.5 };

/** The corners of a flat-topped hex `size` tall centred on (cx, cy) (mm), from the right going clockwise. */
export const hexCorners = (cx: number, cy: number, size: number) =>
  Array.from({ length: 6 }, (_, i) => ({
    x: cx + (size / Math.sqrt(3)) * Math.cos((Math.PI / 3) * i),
    y: cy + (size / Math.sqrt(3)) * Math.sin((Math.PI / 3) * i),
  }));

export const MID = TILE.size / 2;

/**
 * The middles of a tile's seven spaces (mm): flat-topped hexes one space tall, the middle one at the
 * tile's middle, as the game draws them (engine `drawing`).
 */
const HEX_CENTRES = Object.values(TILE_SPOTS).map((p) => ({ x: MID + p.x * TILE.cell, y: MID + p.y * TILE.cell }));

/** Where the cube pads go on an objective: a cluster centred on it. Coordinates are pad centres. */
export function cubePadCentres(capacity: number, cx: number, cy: number): { x: number; y: number }[] {
  const h = (CUBE_PAD.size + CUBE_PAD.gap) / 2;
  switch (capacity) {
    case 1:
      return [{ x: cx, y: cy }];
    case 2:
      return [
        { x: cx - h, y: cy },
        { x: cx + h, y: cy },
      ];
    case 3:
      return [
        { x: cx - h, y: cy - h },
        { x: cx + h, y: cy - h },
        { x: cx, y: cy + h },
      ];
    default:
      return [
        { x: cx - h, y: cy - h },
        { x: cx + h, y: cy - h },
        { x: cx - h, y: cy + h },
        { x: cx + h, y: cy + h },
      ];
  }
}

/** Gap between a box (centre, half-width, half-height) and a square (centre, half-size); 0 if they overlap. */
export function boxGap(cx: number, cy: number, hw: number, hh: number, x: number, y: number, h: number): number {
  return Math.hypot(Math.max(0, Math.abs(cx - x) - hw - h), Math.max(0, Math.abs(cy - y) - hh - h));
}

/** Where the objective number goes and how big it is. Offsets are from the objective's centre (mm). */
export interface NumberPlacement {
  x: number;
  y: number;
  size: number;
  /** Half the numeral's width and height: the box checked against the cube pads and dice. */
  halfW: number;
  halfH: number;
}

/**
 * The number is centred where the spaces meet at the objective's bottom right (`MEET`, three hexes'
 * vertex), clear of the dice and away from the objective. If it would touch a cube pad (the
 * 10's four fill the middle), it moves further out the same way until it is clear.
 */
export function numberPlacement(number: number): NumberPlacement {
  const digits = String(number).length;
  const size = digits > 1 ? NUMBER_TEXT.sizeTwoDigits : NUMBER_TEXT.size;
  const halfW = 0.32 * size * digits;
  const halfH = 0.37 * size;
  const pads = cubePadCentres(OBJECTIVE_CAPACITY[number], 0, 0);
  const m = MEET;
  let [x, y] = [m.x * TILE.cell, m.y * TILE.cell];
  while (pads.some((p) => boxGap(x, y, halfW, halfH, p.x, p.y, CUBE_PAD.size / 2) < 0.8)) {
    x += (0.05 * m.x) / m.y;
    y += 0.05;
  }
  return { x, y, size, halfW, halfH };
}

/** A printed number's text and bar, from the point it is centred on: its baseline, and a 9's bar. */
export interface NumberGlyph {
  baseline: number;
  bar?: { x: number; y: number; w: number; h: number; rx: number };
}

/**
 * How a number `size` high, centred on (cx, cy), is drawn: the baseline sits 0.4 em below the centre so the
 * digits are centred. A 9 gets a short bar under it, so it can't be read as an upside-down 6; the digit rises
 * by half the bar's drop so the pair stays centred. The bar is as thick as the digit's strokes and centred on
 * the glyph, which the negative letter-spacing (-0.03 em) nudges right of the anchor by half its amount.
 */
export function numberGlyph(number: number, cx: number, cy: number, size: number): NumberGlyph {
  if (number !== 9) return { baseline: cy + size * 0.4 };
  const baseline = cy + size * 0.3;
  const [w, h] = [size * 0.44, size * 0.12];
  return { baseline, bar: { x: cx + size * 0.015 - w / 2, y: baseline + size * 0.08, w, h, rx: h * 0.3 } };
}

/**
 * A hex tile's shape in trim millimetres: its 7 hexes, each grown by `grow` mm (its bleed past the cut),
 * which together make the flower, as polygons going the same way round (so filled or clipped they join).
 */
export const hexTileShape = (grow = 0): Spot[][] => HEX_CENTRES.map((c) => hexCorners(c.x, c.y, TILE.cell + 2 * grow));

/** A straight piece of a line, [x1, y1, x2, y2] in millimetres. */
export type Segment = readonly [number, number, number, number];

/** The outline of polygons that join into one shape: the sides no two of them share. */
function outlineOf(polygons: Spot[][]): Segment[] {
  const sides = polygons.flatMap((poly) =>
    poly.map((a, i): Segment => [a.x, a.y, poly[(i + 1) % poly.length].x, poly[(i + 1) % poly.length].y]),
  );
  const middle = ([x1, y1, x2, y2]: Segment) => `${((x1 + x2) / 2).toFixed(3)},${((y1 + y2) / 2).toFixed(3)}`;
  const count = new Map<string, number>();
  for (const side of sides) count.set(middle(side), (count.get(middle(side)) ?? 0) + 1);
  return sides.filter((side) => count.get(middle(side)) === 1);
}

/** A hex tile's die-cut line, in trim millimetres: the flower's outline, 18 sides. */
export const HEX_TILE_CUT: readonly Segment[] = outlineOf(hexTileShape());

/** Where a straight cut, carried on, leaves a piece's square: a point on its edge, mm, and the way out (a unit vector). */
export interface CutExit {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/**
 * Where each side of a die-cut line in a `w` × `h` square, carried on both ways, leaves the square: all but the
 * sides on its edges, which the grid's own crop marks serve.
 */
function cutExits(line: readonly Segment[], w: number, h: number): CutExit[] {
  const exits: CutExit[] = [];
  const onEdge = (a: number, b: number, edge: number) => Math.abs(a - edge) < 1e-6 && Math.abs(b - edge) < 1e-6;
  /** How far along the line, from `from`, it reaches the edge it is heading for on one axis (`d` its way along it). */
  const reach = (from: number, d: number, size: number) => (Math.abs(d) < 1e-9 ? Infinity : (d > 0 ? size - from : -from) / d);
  for (const [x1, y1, x2, y2] of line) {
    if (onEdge(x1, x2, 0) || onEdge(x1, x2, w) || onEdge(y1, y2, 0) || onEdge(y1, y2, h)) continue;
    const len = Math.hypot(x2 - x1, y2 - y1);
    // Level and upright sides exactly so, so their marks draw as the grid's do.
    const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len].map((u) => (Math.abs(u) < 1e-9 ? 0 : u));
    for (const [dx, dy] of [
      [ux, uy],
      [-ux, -uy],
    ]) {
      // The nearer of the two edges it is heading for.
      const t = Math.min(reach(x1, dx, w), reach(y1, dy, h));
      const at = { x: x1 + t * dx, y: y1 + t * dy };
      // Sides on one line share their exits.
      if (!exits.some((e) => Math.hypot(e.x - at.x, e.y - at.y) < 0.01)) exits.push({ ...at, dx, dy });
    }
  }
  return exits;
}

/**
 * Where the hex tile's cuts inside its square, carried on, leave it, for crop marks: the 8 slanted lines (4 exits on
 * each edge) and the 2 level ones (2 more on each side). A rule laid between a line's two marks lines up every side
 * on it, but each cut stops at the tile's inward corners: carried past one, it runs into the next hex.
 */
export const HEX_TILE_CUT_EXITS: readonly CutExit[] = cutExits(HEX_TILE_CUT, TILE.size, TILE.size);

/**
 * A die-cut line as an SVG path, moved by (dx, dy) mm: for a print service's cut layer, named for the
 * `CutContour` spot colour it cuts along and drawn in the magenta that colour previews as.
 */
export const dieLine = (line: readonly Segment[], dx = 0, dy = 0) =>
  `<path id="CutContour" d="${line.map(([x1, y1, x2, y2]) => `M${n(x1 + dx)} ${n(y1 + dy)}L${n(x2 + dx)} ${n(y2 + dy)}`).join('')}" fill="none" stroke="#ec008c" stroke-width=".25"/>`;

/** A hex tile's shape (`hexTileShape`) as one SVG path. */
export const flowerPath = (grow: number) =>
  hexTileShape(grow)
    .map((hex) => `M${hex.map((p) => `${n(p.x)} ${n(p.y)}`).join(' L')}Z`)
    .join('');

/** The trim of a tile with its bleed (mm): how far a tile's art is drawn, whether the bleed is shown or not. */
export const BLED: Box = { x: -TILE.bleed, y: -TILE.bleed, w: TILE.size + 2 * TILE.bleed, h: TILE.size + 2 * TILE.bleed };
