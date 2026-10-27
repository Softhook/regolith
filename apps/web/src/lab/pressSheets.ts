import {
  HEX_TILE_SET,
  OBJECTIVE_NAMES,
  REGOLITH_GROUND_PX,
  TILE_SET,
  WORLD_NAMES,
  lookWorld,
  playerAidSvg,
  tileGroundSvg,
  tileSvg,
  type AidEdition,
  type TileLook,
  type TileOptions,
  type TileSpec,
} from '@regolith/art';
import { blobToDataUrl, rasterise } from '../files';
import type { PressSheets } from '../print/exports';
import { PIECES, slugOf, type Piece, type Printable } from '../print/pieces';
import { cardFontCss, measure, tileFontCss } from './cards';

/** How a tile is shown and printed: its look, and where its planet sits (art `TileOptions`). */
export type TileView = Pick<TileOptions, 'look' | 'planetAt'>;

/**
 * A tile as an SVG document to print (art `tileSvg`): on a world's ground, its light drawn first at the size
 * it's made for and scaled up (art `tileGroundSvg`), since drawn at a print's resolution it falls into contour lines.
 */
export async function printedTileSvg(t: TileSpec, o: Omit<TileOptions, 'ground'>): Promise<string> {
  return lookWorld(o.look) ? tileSvg(t, { ...o, ground: await litGround(t, o) }) : tileSvg(t, o);
}

/** `printedTileSvg` straight away, once the tile's ground is drawn (`litGround`): undefined until then. */
export function printedTileSvgNow(t: TileSpec, o: Omit<TileOptions, 'ground'>): string | undefined {
  if (!lookWorld(o.look)) return tileSvg(t, o);
  const ground = grounds.get(groundKey(t, o))?.drawn;
  return ground && tileSvg(t, { ...o, ground });
}

/**
 * Lit grounds, as PNG data URLs, by the tile and where it's drawn (`groundKey`). Drawing one takes ~75 ms, and
 * a tile's ground is the same whatever's printed over it (markings, bleed, fonts), so its thumbnail, detail and
 * exports share it. Each is some 2.3 MB, so only the latest `KEEP_GROUNDS` are kept: a set of tiles on one world.
 */
const grounds = new Map<string, Ground>();
/** A ground being drawn, and once it is, the drawing. */
type Ground = { url: Promise<string>; drawn?: string };
const KEEP_GROUNDS = 32;

/** Whether a tile's ground is drawn, so `printedTileSvgNow` has it. */
export const groundDrawn = (t: TileSpec, o: TileView) => !!grounds.get(groundKey(t, o))?.drawn;

/** What a tile's ground is drawn from: the tile (its seed, type and rings) and its look and planet's spot. */
const groundKey = (t: TileSpec, o: TileView) => JSON.stringify([t, o.look, o.planetAt ?? '']);

/** A tile's lit ground on its world (art `tileGroundSvg`), drawn at the size its light is made for, once. */
export function litGround(t: TileSpec, o: TileView): Promise<string> {
  const key = groundKey(t, o);
  let ground = grounds.get(key);
  if (ground) grounds.delete(key);
  else {
    const px = REGOLITH_GROUND_PX;
    const drawing: Ground = { url: rasterise(tileGroundSvg(t, o)!, px, px).then(blobToDataUrl) };
    drawing.url.then((u) => (drawing.drawn = u)).catch(() => grounds.delete(key));
    ground = drawing;
  }
  // Last in the map is the latest used, so the first is the one to let go.
  grounds.set(key, ground);
  if (grounds.size > KEEP_GROUNDS) grounds.delete(grounds.keys().next().value!);
  return ground.url;
}

/** Thumbnails of tiles as they print, as image URLs, by the tile and how it's shown (`thumbnail`). */
const thumbnails = new Map<string, Promise<string>>();
/** A tile's latest thumbnail in each look, to show while its next is drawn (a reroll, markings on or off). */
const latestThumbnails = new Map<string, string>();
const latestKey = (t: TileSpec, look: TileOptions['look']) => `${t.id}:${look}`;

/**
 * A tile as it prints, drawn small (`px` across) for a thumbnail: on a world's ground, its own ground drawn
 * once at full size (`litGround`) and the tile drawn down from it. Kept, so each is drawn once.
 */
export function thumbnail(t: TileSpec, o: Omit<TileOptions, 'ground'>, px: number): Promise<string> {
  const key = JSON.stringify([t, o, px]);
  let url = thumbnails.get(key);
  if (!url) {
    url = printedTileSvg(t, o)
      .then((svg) => rasterise(svg, px, px))
      .then((blob) => URL.createObjectURL(blob));
    url.then((u) => latestThumbnails.set(latestKey(t, o.look), u)).catch(() => thumbnails.delete(key));
    thumbnails.set(key, url);
  }
  return url;
}

/** The latest thumbnail drawn of a tile in a look (`thumbnail`), if any. */
export const latestThumbnail = (t: TileSpec, look: TileOptions['look']) => latestThumbnails.get(latestKey(t, look));

/**
 * A tile as a printable face, named for where its planet sits when that's not the middle, and for the
 * world when it's on one, where its planet is an objective: `p7-01`, `p7-01-ne`, `habitat-01-phobos`,
 * `sinkhole-02-mars` (a Void has no spot).
 */
export const printableTile = (t: TileSpec, fontCss: string, markings = true, view: TileView = {}): Printable => {
  const id = lookWorld(view.look) ? objectiveId(t) : t.id;
  return {
    name: (view.planetAt && t.number > 0 ? `${id}-${view.planetAt}` : id) + (lookWorld(view.look) ? `-${view.look}` : ''),
    svg: (bleed) => tileSvg(t, { ...view, markings, bleed, fontCss }),
    print: (bleed) => printedTileSvg(t, { ...view, markings, bleed, fontCss }),
  };
};

/** A tile's id with its objective for its planet: `p7-01` → `habitat-01`, `void-2` → `sinkhole-02` (blanks as they are). */
function objectiveId(t: TileSpec): string {
  const objective = OBJECTIVE_NAMES[t.number];
  if (!objective) return t.id;
  // Its number in the set: the id's last (`void` is the first).
  const n = Number(t.id.match(/\d+$/)?.[0] ?? 1);
  return `${slugOf(objective)}-${String(n).padStart(2, '0')}`;
}

/** A player aid as a printable face. */
export const printableAid = (edition: AidEdition, fontCss: string): Printable => ({
  name: edition,
  svg: (bleed) => playerAidSvg({ edition, bleed, measure, fontCss }),
});

/** The player aids on the sheets: two of each edition. */
const AIDS: AidEdition[] = ['community', 'community', 'classic', 'classic'];

/**
 * The tiles and the player aids print together, on the same stock, from the tile and the aid page alike:
 * the set as it ships (not seeds being explored), with print markings.
 */
export const TILES_AND_AIDS: PressSheets = {
  name: 'tiles-aids',
  label: 'Tiles + aids',
  contents:
    `all ${TILE_SET.length} tiles (${PIECES.tile.cols * PIECES.tile.rows} a page) and ${AIDS.length} player aids, ` +
    `2 Community and 2 Classic (${PIECES.aid.cols * PIECES.aid.rows} a page)`,
  async groups() {
    const [tile, card] = await Promise.all([tileFontCss(), cardFontCss()]);
    if (!tile || !card) throw new Error('the fonts didn’t load');
    return [
      { piece: PIECES.tile, faces: TILE_SET.map((t) => printableTile(t, tile)) },
      { piece: PIECES.aid, faces: AIDS.map((edition) => printableAid(edition, card)) },
    ];
  },
};

/** The set as hex tiles, blanks too, in space or on Phobos, Deimos or Mars, planets in the middle, on press sheets of their own with each tile's die-cut line. */
const hexTiles = (look: Exclude<TileLook, 'square'>): PressSheets => {
  const world = lookWorld(look);
  const on = world ? ` on ${WORLD_NAMES[world]}` : '';
  return {
    name: world ? `hex-tiles-${world}` : 'hex-tiles',
    label: world ? `${WORLD_NAMES[world]} hex tiles` : 'Hex tiles',
    contents: `all ${HEX_TILE_SET.length} tiles as hex tiles${on} (${PIECES.hexTile.cols * PIECES.hexTile.rows} a page), each with its die-cut line in a CutContour spot colour`,
    async groups() {
      const tile = await tileFontCss();
      if (!tile) throw new Error('the fonts didn’t load');
      return [{ piece: PIECES.hexTile, faces: HEX_TILE_SET.map((t) => printableTile(t, tile, true, { look })) }];
    },
  };
};

/** How each look of tile prints: its piece, and the press sheets its set goes on. */
export const TILE_PRINT: Record<TileLook, { piece: Piece; cmyk: PressSheets }> = {
  square: { piece: PIECES.tile, cmyk: TILES_AND_AIDS },
  hex: { piece: PIECES.hexTile, cmyk: hexTiles('hex') },
  phobos: { piece: PIECES.hexTile, cmyk: hexTiles('phobos') },
  deimos: { piece: PIECES.hexTile, cmyk: hexTiles('deimos') },
  mars: { piece: PIECES.hexTile, cmyk: hexTiles('mars') },
};
