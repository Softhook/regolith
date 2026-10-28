import { useEffect, useMemo, useState } from 'react';
import { buildBoard, type MapDef } from '@regolith/engine';
import {
  GROUND_BASE,
  RASTER_AREA,
  TILE,
  dataUrl,
  hash,
  rasterLayerSvg,
  standingMaskSvg,
  tileSpec,
  type RasterLayer,
  type Spot,
  type World,
} from '@regolith/art';
import { rasteriseWithCutout } from '../files';
import { COARSE } from '../game/useMediaQuery';
import { idle, storeImage, storedImage } from './imageStore';
import { tileArt } from './boardTiles';

/**
 * Tile artwork as ready-drawn images: the raster layers of a tile on its world's ground (art `rasterLayerSvg`),
 * which the map draws (MapTiles): the ground, with the planet's building standing where the planet sits, and
 * what's standing, the ground's image cut down to the buildings (and ships and rovers).
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

const grounds = new Map<string, Promise<Record<RasterLayer, string>>>();
/**
 * Tiles are drawn one at a time, each when the page is idle: drawn together as a game opens, their filters took
 * over 100 ms a frame, and drawn during a pinch or pan they'd drop its frames.
 */
let drawing: Promise<unknown> = Promise.resolve();
const decoded = new Map<string, Promise<string>>();

/** A tile to draw: its physical id, and where its planet sits, in spaces from its middle (the ground's building stands there). */
export interface TileRef {
  id: string;
  at?: Spot;
}

const nameOf = ({ id, at }: TileRef, world: World, layer: RasterLayer) =>
  `${id}:${layer}:${world}` + (at ? `@${at.x.toFixed(3)},${at.y.toFixed(3)}` : '');

/**
 * A ground tile's `ground` and `standing` images: the ground drawn once, and cut down by its cheap mask
 * (art `standingMaskSvg`) for what stands, so the two match to the pixel. Stored as a pair, under one key.
 */
function groundImages(tile: TileRef, world: World): Promise<Record<RasterLayer, string>> {
  const name = nameOf(tile, world, 'ground');
  let pair = grounds.get(name);
  if (!pair) {
    const svg = rasterLayerSvg(tileSpec(tile.id), world, tile.at);
    const mask = standingMaskSvg(tileSpec(tile.id), tile.at);
    const size = pixels('ground');
    const key = `${hash(svg + mask)}:${size}:jpeg`;
    const ids = [name, nameOf(tile, world, 'standing')];
    pair = (async () => {
      const [ground, standing] = await Promise.all(ids.map((id) => storedImage('tiles', id, key).catch(() => undefined)));
      if (ground && standing) return { ground: URL.createObjectURL(ground), standing: URL.createObjectURL(standing) };
      // The ground over its world's colour, as the map draws it (MapTiles).
      const drawn = drawing.then(async () => {
        await idle();
        return rasteriseWithCutout(svg, mask, size, size, GROUND_BASE[world], 0.92);
      });
      drawing = drawn.catch(() => {});
      const blobs = await drawn;
      blobs.forEach((blob, i) => storeImage('tiles', ids[i], key, blob).catch(() => {}));
      return { ground: URL.createObjectURL(blobs[0]), standing: URL.createObjectURL(blobs[1]) };
    })()
      // If drawing fails, the ground as SVG (slower to show, same look), and nothing over the wells.
      .catch(() => ({ ground: dataUrl(svg), standing: '' }));
    grounds.set(name, pair);
  }
  return pair;
}

/**
 * The image URL for a layer of a tile (`p7-01`…) on a world, drawing and storing it the first time, once the
 * image is decoded at full size, for the map. Drawn as large as it gets
 * (zoomed in), the browser would otherwise decode each tile then, on the first zoom, and drop frames.
 */
export function decodedTileImage(tile: TileRef, world: World, layer: RasterLayer): Promise<string> {
  const name = nameOf(tile, world, layer);
  let image = decoded.get(name);
  if (!image) {
    image = groundImages(tile, world).then(async ({ [layer]: url }) => {
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
 * Prepares the chosen map's tiles in the background while the player is in the lobby. Each tile carries its
 * building where that map puts its planet, so they can't be drawn ahead of the map, and drawing them all as the
 * game opens would stall its opening roll. The lobby's ground has first call: its tiles are asked for as it's
 * laid, before this starts, and tiles are drawn in turn. One at a time, so it stops when the map changes.
 */
export function useWarmMapImages(map: MapDef): void {
  const board = useMemo(() => buildBoard(map), [map]);
  useEffect(() => {
    let live = true;
    void (async () => {
      for (const t of tileArt(board))
        for (const layer of ['ground', 'standing'] as const) {
          await idle();
          if (!live) return;
          await decodedTileImage(t, board.world, layer).catch(() => {});
        }
    })();
    return () => {
      live = false;
    };
  }, [board]);
}

const NONE: Record<string, string> = {};

/**
 * A layer of each tile of the map on its world, by physical tile id, filled in as each image is ready
 * (`decodedTileImage`). Only that world's: when it changes, none of the last one's.
 */
export function useTileImages(tiles: readonly TileRef[], world: World, layer: RasterLayer): Record<string, string> {
  const of = `${world}:${layer}`;
  const [shown, setShown] = useState({ of, images: NONE });
  useEffect(() => {
    let live = true;
    for (const t of tiles)
      decodedTileImage(t, world, layer).then(
        (url) =>
          live &&
          setShown((s) => {
            const images = s.of === of ? s.images : NONE;
            return images[t.id] === url ? s : { of, images: { ...images, [t.id]: url } };
          }),
        (e: unknown) => console.error(e),
      );
    return () => {
      live = false;
    };
  }, [tiles, world, layer, of]);
  return shown.of === of ? shown.images : NONE;
}
