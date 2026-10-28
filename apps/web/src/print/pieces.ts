import { AID, CARD, HEX_TILE_CUT, MAP_SHEET, TILE, hexTileShape } from '@regolith/art';
import type { Line, Polygon } from './pdf';
import { pressTag } from './press';
import { gameFile } from '../appId';

/**
 * The printed pieces, and the one convention every print file follows: size, bleed, sheet layout and
 * file names are the same whichever piece it is. See docs/GRAPHICS.md §4.
 */

/** What a single-face export needs: a name for files, the size and the resolution. */
export interface Format {
  /** For file names: `regolith-card-…`. */
  id: string;
  /** Trim size, mm. */
  w: number;
  h: number;
  /** Extra art past the trim on every side, for print services, mm. */
  bleed: number;
  /** Resolution of the PNGs, PDFs and print sheets: 600 for pieces with small text, so it prints crisp. */
  dpi: number;
  /** Where it is die-cut, when not at the trim (`Die`). */
  die?: Die;
}

/**
 * How a face die-cut other than at its trim is cut (a hex tile's flower): the trim is then the box round
 * it, which the crop marks still frame. Its art is knocked out past the cut but for the bleed, so the press
 * sheets print only its `shape` with the bleed, and the files for the press carry its cut `line`.
 */
export interface Die {
  /** The cut line, in trim millimetres. */
  line: readonly Line[];
  /** The cut's shape grown by `grow` mm, as polygons that join into it, in trim millimetres. */
  shape: (grow: number) => Polygon[];
}

/** A die moved by (x, y) mm: onto a sheet, or in past a face's bleed. */
export const dieAt = (die: Die, x: number, y: number): Die => ({
  line: die.line.map(([x1, y1, x2, y2]): Line => [x + x1, y + y1, x + x2, y + y2]),
  shape: (grow) => die.shape(grow).map((poly) => poly.map(([px, py]) => [x + px, y + py] as const)),
});

/** A piece printed as a set: in ZIPs and on sheets. */
export interface Piece extends Format {
  id: 'card' | 'tile' | 'aid' | 'map';
  /** For file names: `regolith-cards-…`. */
  plural: string;
  /** How many fit across and down a print sheet (A4). */
  cols: number;
  rows: number;
}

export const PIECES = {
  card: { id: 'card', plural: 'cards', w: CARD.w, h: CARD.h, bleed: CARD.bleed, cols: 3, rows: 3, dpi: 600 },
  tile: {
    id: 'tile',
    plural: 'tiles',
    w: TILE.size,
    h: TILE.size,
    bleed: TILE.bleed,
    cols: 2,
    rows: 2,
    dpi: 300,
    die: {
      line: HEX_TILE_CUT,
      shape: (grow: number) => hexTileShape(grow).map((hex) => hex.map((p) => [p.x, p.y] as const)),
    },
  },
  aid: { id: 'aid', plural: 'aids', w: AID.w, h: AID.h, bleed: AID.bleed, cols: 1, rows: 2, dpi: 600 },
  map: { id: 'map', plural: 'maps', w: MAP_SHEET.w, h: MAP_SHEET.h, bleed: MAP_SHEET.bleed, cols: 1, rows: 2, dpi: 300 },
} as const satisfies Record<string, Piece>;

/** One printable face: a card front, a deck's back, a tile. */
export interface Printable {
  /** Unique within its piece, and the file's name: `skill/07-tune-up`, `p7-01`. A folder part groups it in the ZIP. */
  name: string;
  /** The face as an SVG document, at trim size or with the bleed. */
  svg: (bleed: boolean) => string;
  /** The face as printed, when that takes drawing something first (a tile on a world's ground, its light); `svg` otherwise. */
  print?: (bleed: boolean) => Promise<string>;
}

/** A face's SVG document for print (`Printable.print`). */
export const printSvg = (item: Printable, bleed: boolean): Promise<string> => item.print?.(bleed) ?? Promise.resolve(item.svg(bleed));

/** A piece's size with or without its bleed, mm. */
export const pieceSize = (p: Format, bleed: boolean) => ({ w: p.w + (bleed ? 2 * p.bleed : 0), h: p.h + (bleed ? 2 * p.bleed : 0) });

/** How a piece's size reads in notes and READMEs: "63.5 × 88.9 mm, with 3 mm bleed 69.5 × 94.9 mm". */
export function sizeNote(p: Format, bleed: boolean): string {
  const b = pieceSize(p, true);
  return `${p.w} × ${p.h} mm` + (bleed ? `, with ${p.bleed} mm bleed ${b.w} × ${b.h} mm` : ' (trim, no bleed)');
}

/** A face's name in a file name: `skill/07-tune-up` → `skill-07-tune-up`. */
/** A name as a file name: `Ice Tunnel` → `ice-tunnel`. */
export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const slug = (item: Printable) => item.name.replaceAll('/', '-');

/** A single export's file name: `regolith-card-skill-07-tune-up-bleed-300dpi.png`, `regolith-tile-p7-01.svg`. */
export function fileName(p: Format, item: Printable, o: { bleed: boolean; dpi?: number; ext: string }): string {
  return gameFile(`${p.id}-${slug(item)}${o.bleed ? '-bleed' : ''}${o.dpi ? `-${o.dpi}dpi` : ''}.${o.ext}`);
}

/** One face's CMYK PDF: `regolith-proof-a4-fogra39.pdf`, `…-fogra39-deep.pdf` with the deep black (always with the bleed). */
export const cmykName = (p: Format, item: Printable, deep: boolean) => gameFile(`${p.id}-${slug(item)}-${pressTag(deep)}.pdf`);

/** A whole set's ZIP: `regolith-cards-bleed.zip`, `regolith-cards-fogra39.zip`. */
export const setName = (p: Piece, o: { part?: string; tag?: string }) =>
  gameFile(`${p.plural}${o.part ? `-${o.part}` : ''}${o.tag ? `-${o.tag}` : ''}.zip`);

/** Press sheets of pieces printed together: `regolith-tiles-aids-a4-fogra39.pdf`, `…-fogra39-deep.pdf` with the deep black. */
export const sheetName = (name: string, deep: boolean) => gameFile(`${name}-a4-${pressTag(deep)}.pdf`);
