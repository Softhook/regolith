import { estimateWidth } from './card';
import { GROUND, HAIR, MUTED, PAD, WHITE, text } from './aid';
import { INKS } from './screenprint/inks';
import { HEX_TILE_CUT, MID, hexTileShape, type Spot } from './tile/geometry';
import { WORLD_NAMES, type World } from './tile/look';
import { BLANK } from './tile/set';
import { document, n } from './svg';
import { TILE } from './tokens';

/**
 * A map's setup sheet: a landscape board for setting a map up at a table, which tile goes where. Each tile is its
 * flower, drawn as the map lays it, with what to look for on it: an objective's number (on the hex it sits on, as
 * the layout puts it), a Sinkhole, or blank ground. The starting objectives are amber. On the aid's night paper.
 */

export const MAP_SHEET = {
  /** Landscape, two to an A4 or Letter page with their bleed and crop marks. */
  w: 180,
  h: 120,
  bleed: 3,
  /** Outer margin. */
  safe: 8,
} as const;

/** One tile on the sheet. */
export interface MapSheetTile {
  /** Its middle, in spaces from the drawing's top left (a space is one unit tall). */
  x: number;
  y: number;
  /** An objective's number (7–10), 0 for a Sinkhole (the engine's Void), or BLANK. */
  number: number;
  /** Where the objective sits, in spaces from the tile's middle (x right, y down). */
  at: Spot;
  /** A starting objective. */
  start: boolean;
}

export interface MapSheetOptions {
  name: string;
  players: number;
  cubes: number;
  world: World;
  /** The drawing's size, in spaces (engine `drawing`). */
  cols: number;
  rows: number;
  tiles: MapSheetTile[];
  bleed?: boolean;
  fontCss?: string;
}

/** A Sinkhole's tile: the night paper tinted towards ice. */
const SINKHOLE = '#2C3538';

const HEADER = 22;

/** An objective: its number in a ring, or on an amber disc for a starting one (number 0 for the legend's). */
function objective(cx: number, cy: number, r: number, t: Pick<MapSheetTile, 'number' | 'start'>): string {
  const disc = t.start
    ? `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${INKS.amber}"/>`
    : `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="none" stroke="${WHITE}" stroke-width=".5"/>`;
  if (!t.number) return disc;
  return disc + text(cx, cy + r * 0.42, String(t.number), r * 1.15, { font: 'title', anchor: 'middle', fill: t.start ? GROUND : WHITE });
}

/** A flat-topped hex `r` across its corners, for the legend. */
function swatch(cx: number, cy: number, r: number, fill: string): string {
  const pts = Array.from({ length: 6 }, (_, i) => `${n(cx + r * Math.cos((Math.PI / 3) * i))},${n(cy + r * Math.sin((Math.PI / 3) * i))}`);
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${MUTED}" stroke-width=".4"/>`;
}
const LEGEND = 9;

/** The map's setup sheet as a standalone SVG document. */
export function mapSheetSvg(o: MapSheetOptions): string {
  const { w: W, h: H, safe: M, bleed: B } = MAP_SHEET;
  const b = o.bleed ? B : 0;
  const out: string[] = [`<rect x="${-B}" y="${-B}" width="${W + 2 * B}" height="${H + 2 * B}" fill="${GROUND}"/>`];

  out.push(text(M, M + 6, o.name, 7, { font: 'title' }));
  out.push(
    text(M, M + 12.5, `${o.players} players · ${o.cubes} cubes each · on ${WORLD_NAMES[o.world]}`, 3.2, { fill: MUTED, track: 0.04 }),
  );

  // The map, as large as fits between the header and the legend, centred.
  const area = { x: M, y: M + HEADER, w: W - 2 * M, h: H - 2 * M - HEADER - LEGEND };
  const cell = Math.min(area.w / o.cols, area.h / o.rows);
  const ox = area.x + (area.w - o.cols * cell) / 2;
  const oy = area.y + (area.h - o.rows * cell) / 2;
  // Tile millimetres (art geometry, a space TILE.cell tall, the middle at MID) to the sheet's.
  const k = cell / TILE.cell;
  const place = (t: MapSheetTile) => (x: number, y: number) => [ox + t.x * cell + (x - MID) * k, oy + t.y * cell + (y - MID) * k];

  for (const t of o.tiles) {
    const at = place(t);
    const fill = t.number === BLANK ? GROUND : t.number === 0 ? SINKHOLE : PAD;
    for (const hex of hexTileShape()) {
      const pts = hex.map((p) => at(p.x, p.y).map(n).join(',')).join(' ');
      out.push(`<polygon points="${pts}" fill="${fill}" stroke="${HAIR}" stroke-width=".25"/>`);
    }
    const edge = HEX_TILE_CUT.map(([x1, y1, x2, y2]) => {
      const [a, c] = [at(x1, y1), at(x2, y2)];
      return `M${n(a[0])},${n(a[1])}L${n(c[0])},${n(c[1])}`;
    }).join('');
    out.push(`<path d="${edge}" fill="none" stroke="${MUTED}" stroke-width=".5" stroke-linecap="round"/>`);
    if (t.number > 0) out.push(objective(ox + (t.x + t.at.x) * cell, oy + (t.y + t.at.y) * cell, cell * 0.4, t));
  }

  // The legend, along the bottom: a swatch and a few words each, spread across.
  const ly = H - M - 1.5;
  const r = 2.4;
  const keys: [swatch: string, label: string][] = [
    [objective(0, 0, r, { number: 0, start: false }), 'Objective, on its space'],
    [objective(0, 0, r, { number: 0, start: true }), 'Starting objective'],
    [swatch(0, 0, r, SINKHOLE), 'Sinkhole'],
    [swatch(0, 0, r, GROUND), 'Blank ground'],
  ];
  let x = M;
  for (const [draw, label] of keys) {
    out.push(`<g transform="translate(${n(x + r)} ${n(ly - 0.9)})">${draw}</g>`, text(x + 2 * r + 2, ly, label, 2.6, { fill: MUTED }));
    x += 2 * r + 2 + estimateWidth(label, 2.6, 'body') + 8;
  }

  return document({ defs: '', body: out.join('') }, { x: -b, y: -b, w: W + 2 * b, h: H + 2 * b }, true, o.fontCss);
}
