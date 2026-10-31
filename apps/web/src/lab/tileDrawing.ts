import { REGOLITH_GROUND_PX, tileGroundSvg, tileSvg, type TileOptions, type TileSpec } from '@regolith/art';
import { blobToDataUrl, rasterise } from '../files';

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
