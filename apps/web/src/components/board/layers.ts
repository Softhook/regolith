import { isRaster, type RasterLayer, type TileLayerName } from '@regolith/art';
import { cellAt, objectiveAround, spaces, type Board, type Cell } from '@regolith/engine';

/* What the map's live layers show (MapTiles), worked out from the board. */

/** A tile layer the map draws from the board, or live (not an image). */
export type BoardLayer = Exclude<TileLayerName, RasterLayer>;

/**
 * How the map stacks a look's tile layers (art `tileLayerNames`), bottom first: each run of raster layers
 * together, as one clipped group of images per tile (a group per layer would cost a composited clip each, on
 * every pan and zoom), and between them the layers drawn from the board.
 */
export function mapStack(layers: readonly TileLayerName[]): (RasterLayer[] | BoardLayer)[] {
  const out: (RasterLayer[] | BoardLayer)[] = [];
  for (const layer of layers) {
    const last = out[out.length - 1];
    if (!isRaster(layer)) out.push(layer);
    else if (Array.isArray(last)) last.push(layer);
    else out.push([layer]);
  }
  return out;
}

/** A space as the map marks it: whether it's on a perimeter, and whether it's on an Alien Artefact. */
export interface SpaceRole {
  p: Cell;
  perimeter: boolean;
  artefact: boolean;
}

export function spaceRoles(board: Board): SpaceRole[] {
  return spaces(board).map((p) => ({ p, perimeter: !!objectiveAround(board, p), artefact: !!cellAt(board, p)?.artefact }));
}
