import { useEffect, useMemo, useState } from 'react';
import { buildBoard, type MapDef } from '@regolith/engine';
import {
  RASTER_AREA,
  TILE,
  TILE_SET,
  dataUrl,
  hash,
  isRaster,
  lookShape,
  lookWorld,
  rasterLayerSvg,
  standingMaskSvg,
  tileLayerNames,
  tileSpec,
  type RasterLayer,
  type Spot,
  type TileLook,
  type World,
} from '@regolith/art';
import { rasterise, rasteriseWithCutout } from '../files';
import { COARSE } from '../game/useMediaQuery';
import { idle, storeImage, storedImage } from './imageStore';
import { tileArt } from './boardTiles';
import { useMapLook } from './mapLook';

/**
 * Tile artwork as ready-drawn images: the raster layers of a tile in its look (art `rasterLayerSvg`), which the map
 * draws (MapTiles). In space its sky and its body, the planet and moons or a Void tile's heart, which the map places
 * wherever the planet sits; on a world's ground (mapLook) the ground, with the planet's building standing where the
 * planet sits, and what's standing, the ground's image cut down to the buildings (and ships and rovers).
 *
 * Drawing a tile's SVG (its noise filters) takes ~45 ms, so each layer of a tile is drawn once to a bitmap and kept
 * in IndexedDB (imageStore); later games and window resizes reuse it. The stored image carries a hash of the SVG,
 * so changing the artwork redraws it.
 */

/**
 * Pixel size of a stored tile: bigger on a computer, so a high-density screen zooms further in sharp, but not on
 * a touch screen (phones, tablets), where it would cost the memory of every tile on the map.
 */
const SIZE = typeof matchMedia === 'function' && !matchMedia(COARSE).matches ? 768 : 576;

/** Device pixels a space of a stored tile has, which sets how far the map zooms in (zoomGeometry `frame`). */
export const SHARP_CELL = (SIZE * TILE.cell) / TILE.size;

/** A layer's image size, px: its area (art `RASTER_AREA`) at the tile's. */
const pixels = (layer: RasterLayer) => Math.round((SIZE * RASTER_AREA[layer].w) / TILE.size);

/** A ground tile's two layers, drawn together (`groundImages`). */
type GroundLayer = Extract<RasterLayer, 'ground' | 'standing'>;

const onGround = (layer: RasterLayer): layer is GroundLayer => layer === 'ground' || layer === 'standing';

const images = new Map<string, Promise<string>>();
const grounds = new Map<string, Promise<Record<GroundLayer, string>>>();
const decoded = new Map<string, Promise<string>>();

// WebP keeps the stored tiles small; browsers that can't encode it give PNG instead.
const draw = (svg: string, size: number) => rasterise(svg, size, size, 'image/webp', 0.92);

async function load(id: string, svg: string, size: number): Promise<string> {
  const key = `${hash(svg)}:${size}`;
  const stored = await storedImage('tiles', id, key).catch(() => undefined);
  if (stored) return URL.createObjectURL(stored);
  const blob = await draw(svg, size);
  storeImage('tiles', id, key, blob).catch(() => {});
  return URL.createObjectURL(blob);
}

/** A tile to draw: its physical id, and where its planet sits, in spaces from its middle (the ground's building stands there). */
interface TileRef {
  id: string;
  at?: Spot;
}

const nameOf = ({ id, at }: TileRef, look: TileLook, layer: RasterLayer) => {
  if (onGround(layer)) return `${id}:${layer}:${look}` + (at ? `@${at.x.toFixed(3)},${at.y.toFixed(3)}` : '');
  return layer === 'body' ? `${id}:body` : `${id}:sky-${lookShape(look)}`;
};

/**
 * A ground tile's `ground` and `standing` images: the ground drawn once, and cut down by its cheap mask
 * (art `standingMaskSvg`) for what stands, so the two match to the pixel. Stored as a pair, under one key.
 */
function groundImages(tile: TileRef, world: World): Promise<Record<GroundLayer, string>> {
  const name = nameOf(tile, world, 'ground');
  let pair = grounds.get(name);
  if (!pair) {
    const svg = rasterLayerSvg(tileSpec(tile.id), world, 'ground', tile.at);
    const mask = standingMaskSvg(tileSpec(tile.id), tile.at);
    const size = pixels('ground');
    const key = `${hash(svg + mask)}:${size}`;
    const ids = [name, nameOf(tile, world, 'standing')];
    pair = (async () => {
      const [ground, standing] = await Promise.all(ids.map((id) => storedImage('tiles', id, key).catch(() => undefined)));
      if (ground && standing) return { ground: URL.createObjectURL(ground), standing: URL.createObjectURL(standing) };
      const blobs = await rasteriseWithCutout(svg, mask, size, size, 'image/webp', 0.92);
      blobs.forEach((blob, i) => storeImage('tiles', ids[i], key, blob).catch(() => {}));
      return { ground: URL.createObjectURL(blobs[0]), standing: URL.createObjectURL(blobs[1]) };
    })()
      // If drawing fails, the ground as SVG (slower to show, same look), and nothing over the wells.
      .catch(() => ({ ground: dataUrl(svg), standing: '' }));
    grounds.set(name, pair);
  }
  return pair;
}

/** The image URL for a layer of a tile (`p7-01`…) in a look, drawing and storing it the first time; rejects for a layer the look hasn't got. */
async function tileImage(tile: TileRef, look: TileLook, layer: RasterLayer): Promise<string> {
  if (onGround(layer)) {
    const world = lookWorld(look);
    if (!world) throw new Error(`A ${look} tile has no ${layer} layer`);
    return (await groundImages(tile, world))[layer];
  }
  const name = nameOf(tile, look, layer);
  let image = images.get(name);
  if (!image) {
    const svg = rasterLayerSvg(tileSpec(tile.id), look, layer);
    // If drawing or storage fails, fall back to the SVG itself (slower to show, same look).
    image = load(name, svg, pixels(layer)).catch(() => dataUrl(svg));
    images.set(name, image);
  }
  return image;
}

/**
 * A tile's image URL once the image is decoded at full size, for the map. Drawn as large as it gets
 * (zoomed in), the browser would otherwise decode each tile then, on the first zoom, and drop frames.
 */
export function decodedTileImage(tile: TileRef, look: TileLook, layer: RasterLayer): Promise<string> {
  const name = nameOf(tile, look, layer);
  let image = decoded.get(name);
  if (!image) {
    image = tileImage(tile, look, layer).then(async (url) => {
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => {});
      return url;
    });
    decoded.set(name, image);
  }
  return image;
}

/**
 * Prepares every tile in the set in the background (one layer per idle moment), so the first game starts
 * at once: the bodies and the square skies (most maps are square).
 */
export async function warmTileImages(): Promise<void> {
  for (const t of TILE_SET)
    for (const layer of ['body', 'sky'] as const) {
      await idle();
      await tileImage(t, 'square', layer);
    }
}

/**
 * Prepares the chosen map's tiles in the look the game will draw them in, in the background while the player is in
 * the lobby. A ground map's tiles each carry their building where that map puts its planet, so `warmTileImages`
 * can't have them ready, and drawing them all as the game opens would stall its opening roll. Stops when the
 * map or look changes.
 */
export function useWarmMapImages(map: MapDef): void {
  const board = useMemo(() => buildBoard(map), [map]);
  const look = useMapLook(board);
  useEffect(() => {
    let live = true;
    void (async () => {
      const layers = tileLayerNames(look).filter(isRaster);
      for (const t of tileArt(board))
        for (const layer of layers) {
          await idle();
          if (!live) return;
          await decodedTileImage(t, look, layer).catch(() => {});
        }
    })();
    return () => {
      live = false;
    };
  }, [board, look]);
}

const NONE: Record<string, string> = {};

/**
 * A layer of each tile of the map in a look, by physical tile id, filled in as each image is ready
 * (`decodedTileImage`). Only that look's: when the look changes (the map switched to its ground, or back),
 * none of the last one's, which is drawn at a different size.
 */
export function useTileImages(tiles: readonly TileRef[], look: TileLook, layer: RasterLayer): Record<string, string> {
  const of = `${look}:${layer}`;
  const [shown, setShown] = useState({ of, images: NONE });
  useEffect(() => {
    let live = true;
    for (const t of tiles)
      decodedTileImage(t, look, layer).then(
        (url) =>
          live &&
          setShown((s) => {
            const images = s.of === of ? s.images : NONE;
            return images[t.id] === url ? s : { of, images: { ...images, [t.id]: url } };
          }),
        // A layer the look hasn't got: a mistake in the caller, not something to show.
        (e: unknown) => console.error(e),
      );
    return () => {
      live = false;
    };
  }, [tiles, look, layer, of]);
  return shown.of === of ? shown.images : NONE;
}
