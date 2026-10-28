import {
  OBJECTIVE_NAMES,
  REGOLITH_GROUND_PX,
  TILE_SET,
  WORLD_NAMES,
  mapSheetSvg,
  playerAidSvg,
  tileGroundSvg,
  tileSpec,
  tileSvg,
  type AidEdition,
  type MapSheetMark,
  type TileOptions,
  type TileSpec,
  type World,
} from '@regolith/art';
import { MAPS, buildBoard, drawing, startingGround, type Cell, type MapDef } from '@regolith/engine';
import { tileArt } from '../art/boardTiles';
import { blobToDataUrl, rasterise } from '../files';
import type { PressSheets } from '../print/exports';
import { PIECES, slugOf, type Printable } from '../print/pieces';
import { cardFontCss, measure, tileFontCss } from './cards';

/** How a tile is shown and printed: its world, and where its planet sits (art `TileOptions`). */
export type TileView = Pick<TileOptions, 'world' | 'planetAt'>;

/**
 * A tile as an SVG document to print (art `tileSvg`): its ground's light drawn first at the size it's made for
 * and scaled up (art `tileGroundSvg`), since drawn at a print's resolution it falls into contour lines.
 */
export async function printedTileSvg(t: TileSpec, o: Omit<TileOptions, 'ground'>): Promise<string> {
  return tileSvg(t, { ...o, ground: await litGround(t, o) });
}

/** `printedTileSvg` straight away, once the tile's ground is drawn (`litGround`): undefined until then. */
export function printedTileSvgNow(t: TileSpec, o: Omit<TileOptions, 'ground'>): string | undefined {
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

/** What a tile's ground is drawn from: the tile (its seed) and its world and planet's spot. */
const groundKey = (t: TileSpec, o: TileView) => JSON.stringify([t, o.world, o.planetAt ?? '']);

/** A tile's lit ground on its world (art `tileGroundSvg`), drawn at the size its light is made for, once. */
export function litGround(t: TileSpec, o: TileView): Promise<string> {
  const key = groundKey(t, o);
  let ground = grounds.get(key);
  if (ground) grounds.delete(key);
  else {
    const px = REGOLITH_GROUND_PX;
    const drawing: Ground = { url: rasterise(tileGroundSvg(t, o), px, px).then(blobToDataUrl) };
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
/** A tile's latest thumbnail on each world, to show while its next is drawn (a reroll, markings on or off). */
const latestThumbnails = new Map<string, string>();
const latestKey = (t: TileSpec, world: TileOptions['world']) => `${t.id}:${world}`;

/**
 * A tile as it prints, drawn small (`px` across) for a thumbnail: its own ground drawn once at full size
 * (`litGround`) and the tile drawn down from it. Kept, so each is drawn once.
 */
export function thumbnail(t: TileSpec, o: Omit<TileOptions, 'ground'>, px: number): Promise<string> {
  const key = JSON.stringify([t, o, px]);
  let url = thumbnails.get(key);
  if (!url) {
    url = printedTileSvg(t, o)
      .then((svg) => rasterise(svg, px, px))
      .then((blob) => URL.createObjectURL(blob));
    url.then((u) => latestThumbnails.set(latestKey(t, o.world), u)).catch(() => thumbnails.delete(key));
    thumbnails.set(key, url);
  }
  return url;
}

/** The latest thumbnail drawn of a tile on a world (`thumbnail`), if any. */
export const latestThumbnail = (t: TileSpec, world: TileOptions['world']) => latestThumbnails.get(latestKey(t, world));

/**
 * A tile as a printable face, named for its objective, where its planet sits when that's not the middle, and
 * its world: `habitat-01-phobos`, `habitat-01-ne-mars`, `sinkhole-02-mars` (a Void has no spot).
 */
export const printableTile = (t: TileSpec, fontCss: string, markings = true, view: TileView = {}): Printable => {
  const id = objectiveId(t);
  return {
    name: (view.planetAt && t.number > 0 ? `${id}-${view.planetAt}` : id) + `-${view.world ?? 'mars'}`,
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

/** A map's setup sheet as a printable face: each tile where the map lays it, as the game draws it. */
export function printableMap(map: MapDef, fontCss: string): Printable {
  const board = buildBoard(map);
  const { at, cols, rows } = drawing(board);
  const starts = new Set(board.planets.filter((p) => p.start).map((p) => board.cells[p.r][p.c].tile));
  const tiles = tileArt(board).map((t) => {
    const middle = at(t);
    return {
      x: middle.c + 0.5,
      y: middle.r + 0.5,
      number: tileSpec(t.id).number,
      at: t.at,
      start: starts.has(t.tile),
    };
  });
  const ground = startingGround(map);
  const mark = (kind: MapSheetMark['kind']) => (cell: Cell) => ({ kind, x: at(cell).c + 0.5, y: at(cell).r + 0.5 });
  const marks = [...ground.gates.map(mark('tunnel')), ...ground.wormhole.map(mark('wormhole')), ...ground.barriers.map(mark('barrier'))];
  const sheet = { name: map.name, players: map.players, cubes: map.cubes, world: board.world, cols, rows, tiles, marks, fontCss };
  return { name: map.id, svg: (bleed) => mapSheetSvg({ ...sheet, bleed }) };
}

/** Every map's setup sheet on press sheets of their own. */
export const MAP_SHEETS: PressSheets = {
  name: 'maps',
  label: 'Maps',
  contents: `the setup sheets of all ${MAPS.length} maps (${PIECES.map.cols * PIECES.map.rows} a page)`,
  async groups() {
    const card = await cardFontCss();
    if (!card) throw new Error('the fonts didn’t load');
    return [{ piece: PIECES.map, faces: MAPS.map((m) => printableMap(m, card)) }];
  },
};

/** The player aids on the sheets: two of each edition. */
const AIDS: AidEdition[] = ['regolith', 'regolith', 'basic', 'basic'];

/** The player aids on press sheets of their own. */
export const AID_SHEETS: PressSheets = {
  name: 'aids',
  label: 'Aids',
  contents: `${AIDS.length} player aids, 2 Regolith and 2 Basic (${PIECES.aid.cols * PIECES.aid.rows} a page)`,
  async groups() {
    const card = await cardFontCss();
    if (!card) throw new Error('the fonts didn’t load');
    return [{ piece: PIECES.aid, faces: AIDS.map((edition) => printableAid(edition, card)) }];
  },
};

/** The set, blanks too, on a world, planets in the middle, on press sheets of their own with each tile's die-cut line. */
const worldTiles = (world: World): PressSheets => ({
  name: `tiles-${world}`,
  label: `${WORLD_NAMES[world]} tiles`,
  contents: `all ${TILE_SET.length} tiles on ${WORLD_NAMES[world]} (${PIECES.tile.cols * PIECES.tile.rows} a page), each with its die-cut line in a CutContour spot colour`,
  async groups() {
    const tile = await tileFontCss();
    if (!tile) throw new Error('the fonts didn’t load');
    return [{ piece: PIECES.tile, faces: TILE_SET.map((t) => printableTile(t, tile, true, { world })) }];
  },
});

/** The press sheets each world's set of tiles goes on. */
export const TILE_SHEETS: Record<World, PressSheets> = {
  phobos: worldTiles('phobos'),
  deimos: worldTiles('deimos'),
  mars: worldTiles('mars'),
};
