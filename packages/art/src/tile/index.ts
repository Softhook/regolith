import { TILE } from '../tokens';
import { document, join, n, type Box, type Fragment } from '../svg';
import { groundArt, regolithGroundSvg, regolithMaskSvg, regolithSvg } from '../regolith';
import { BLED, HEX_TILE_CUT, dieLine, flowerPath, planetSpot, type Spot } from './geometry';
import type { World } from './look';
import { markings } from './markings';
import type { TileSpec } from './set';

/**
 * One map tile, a 7-hex flower 96 mm tall, on its world's ground (regolith/), as layers (`tileLayers`): the
 * ground with the planet's building, and the print markings (markings.ts), all laid out by where its planet
 * sits (geometry.ts). Print draws them in one piece (`tileSvg`), an editor as a bitmap and vectors
 * (`editableTileSvg`), and the map in the same order, some as images (the game's MapTiles). The tile set is set.ts.
 */

export interface TileOptions {
  /** Include the 3 mm print bleed around the trim. */
  bleed?: boolean;
  /**
   * Print markings: the spaces' outlines and the planet's cube pads and number. `'spaces'` draws only the
   * spaces, for the game's rulebook, which draws the number and cube pads itself.
   */
  markings?: boolean | 'spaces';
  /** Cut the art at the flower's outline (for on-screen use); otherwise it reaches past it by the bleed, if any. */
  rounded?: boolean;
  /** Prefix for ids; defaults to the tile id. */
  idPrefix?: string;
  /**
   * Draw only the layers an editor can't keep as vectors (`isRaster`): those up to the last of them, which
   * `editableTileSvg` takes as its bitmap and draws the rest over as vectors.
   */
  raster?: boolean;
  /** `@font-face` rules to embed, so print files set the number in its own font, not the system's. */
  fontCss?: string;
  /** The world whose ground the tile is on: Mars when absent. */
  world?: World;
  /** Where the planet sits, as a map's layout token says it (`TILE_SPOTS`): the middle when absent. */
  planetAt?: string;
  /**
   * A bitmap of its lit ground (a data URL of `tileGroundSvg`, drawn at `REGOLITH_GROUND_PX`) in place of its
   * lighting filter: print draws it so, as its light falls into contour lines at a print's resolution
   * (regolith/core.ts `LIT`).
   */
  ground?: string;
}

/** A tile's layers: what it draws, one on another (`TILE_LAYERS`). */
export type TileLayerName = 'ground' | 'spaces' | 'standing' | 'planet';

/**
 * A tile's layers, bottom first, as print, the Art Lab and the map all draw them: the ground, with the planet's
 * building standing on its space, the spaces' outlines, what stands on the ground again over them (so the
 * outlines are etched into the ground, not across the buildings), and the planet's cube pads and number.
 */
export const TILE_LAYERS: readonly TileLayerName[] = ['ground', 'spaces', 'standing', 'planet'];

/**
 * The layers drawn with filters, and the area each covers in trim mm when drawn alone for the map
 * (`rasterLayerSvg`): the tile and its bleed. An editor that can't render filters takes them as a bitmap
 * (`editableTileSvg`); the others are plain vectors.
 */
export const RASTER_AREA = { ground: BLED, standing: BLED } as const;

export type RasterLayer = keyof typeof RASTER_AREA;

export const isRaster = (layer: TileLayerName): layer is RasterLayer => layer in RASTER_AREA;

/** One of a tile's layers, in trim mm. */
export interface TileLayer {
  name: TileLayerName;
  art: Fragment;
}

/** A tile's layers, bottom first (`TILE_LAYERS`): those it has, so markings only when asked for. */
export function tileLayers(spec: TileSpec, o: TileOptions = {}): TileLayer[] {
  const at = planetSpot(o.planetAt);
  const ground = groundArt(spec, at, o.world ?? 'mars', o.ground);
  const art: Record<TileLayerName, () => Fragment | undefined> = {
    ground: () => ground,
    spaces: () => (o.markings ? markings(spec, 'spaces', at) : undefined),
    standing: () => (o.markings ? ground.standing : undefined),
    planet: () => (o.markings === true ? markings(spec, 'planet', at) : undefined),
  };
  return TILE_LAYERS.flatMap((name) => {
    const f = art[name]();
    return f ? [{ name, art: f }] : [];
  });
}

/** Where a tile's raster layers end (`isRaster`): the index of the last of them, or -1. */
const rasterEnd = (layers: TileLayer[]) => layers.reduce((end, l, i) => (isRaster(l.name) ? i : end), -1);

/**
 * One map tile as a standalone SVG document 96 mm square: its layers (`tileLayers`) in one piece, or only its
 * raster layers (`raster`). The art is knocked out past its flower, so the paper shows its shape: at the cut on
 * screen (`rounded`), and with its bleed past the cut in print files.
 */
export function tileSvg(spec: TileSpec, o: TileOptions = {}): string {
  const id = o.idPrefix ?? spec.id;
  const b = o.bleed ? TILE.bleed : 0;
  const area: Box = { x: -b, y: -b, w: TILE.size + 2 * b, h: TILE.size + 2 * b };
  const layers = tileLayers(spec, o);
  const all = join(...(o.raster ? layers.slice(0, rasterEnd(layers) + 1) : layers).map((l) => l.art));
  return document(
    {
      defs: all.defs + `<clipPath id="${id}-flower"><path d="${flowerPath(o.rounded ? 0 : b)}"/></clipPath>`,
      body: `<g clip-path="url(#${id}-flower)">${all.body}</g>`,
    },
    area,
    true,
    o.fontCss,
  );
}

/**
 * A tile's ground alone over its `RASTER_AREA`, as the map draws it to an image and keeps it, with its building
 * `at` the planet's space (spaces from the middle). What's standing on it isn't drawn again but cut out of the
 * ground's image (`standingMaskSvg`).
 */
export function rasterLayerSvg(spec: TileSpec, world: World, at: Spot = { x: 0, y: 0 }): string {
  return regolithSvg(spec, world, at);
}

/**
 * What stands on a tile's ground (`rasterLayerSvg`, its building `at` the planet's space), as a mask over the
 * same area: white where it stands, clear elsewhere. Cheap to draw, with no lighting, so the map cuts what
 * stands out of the ground's image with it, to lay over the spaces' outlines, and the two match to the pixel.
 */
export const standingMaskSvg = (spec: TileSpec, at: Spot = { x: 0, y: 0 }): string => regolithMaskSvg(spec, at);

/** The tile's lit ground alone, to draw as a bitmap at `REGOLITH_GROUND_PX` and pass back to `tileSvg` as its `ground`. */
export function tileGroundSvg(spec: TileSpec, o: Pick<TileOptions, 'world' | 'planetAt'>): string {
  return regolithGroundSvg(spec, o.world ?? 'mars', planetSpot(o.planetAt));
}

/**
 * A tile for Illustrator and other editors that can't render SVG filters: its raster layers as an embedded
 * bitmap (pass a PNG data URL of `tileSvg(spec, { raster: true, … })`), with the planet's cube pads and number
 * over them as vectors (its buildings stand over the spaces' outlines, so those are in the bitmap), and the
 * die-cut line on a layer of its own. Each sits in its own named group, which Illustrator opens as layers.
 */
export function editableTileSvg(
  spec: TileSpec,
  artPng: string,
  o: Pick<TileOptions, 'bleed' | 'markings' | 'world' | 'planetAt'> = {},
): string {
  const b = o.bleed ? TILE.bleed : 0;
  const w = TILE.size + 2 * b;
  const area: Box = { x: -b, y: -b, w, h: w };
  const layers = tileLayers(spec, o);
  const marks = join(...layers.slice(rasterEnd(layers) + 1).map((l) => l.art));
  return document(
    {
      defs: marks.defs,
      body:
        `<g id="art"><image x="${n(-b)}" y="${n(-b)}" width="${n(w)}" height="${n(w)}" preserveAspectRatio="none" href="${artPng}" xlink:href="${artPng}"/></g>` +
        `<g id="markings">${marks.body}</g>` +
        `<g id="cut">${dieLine(HEX_TILE_CUT)}</g>`,
    },
    area,
  ).replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ');
}
