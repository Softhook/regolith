import { isRaster, numberCorner as tileNumberCorner, type Corner, type RasterLayer, type Spot, type TileLayerName } from '@regolith/art';
import { cellAt, drawing, objectivesAround, spaces, tileCentres, type Board, type Cell, type Objective } from '@regolith/engine';

/*
 * What the map's live layers show (MapTiles), worked out from the board rather than from the tiles: an objective
 * may sit anywhere on its tile, its perimeter reach onto other tiles and overlap another objective's.
 */

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

/** A space as the map marks it: how many perimeters it is on (0, 1, or more where they overlap) and whether it's on an Alien Artefact. */
export interface SpaceRole {
  p: Cell;
  perimeters: number;
  artefact: boolean;
}

export function spaceRoles(board: Board): SpaceRole[] {
  return spaces(board).map((p) => ({ p, perimeters: objectivesAround(board, p).length, artefact: !!cellAt(board, p)?.artefact }));
}

/** Where an objective sits on its tile, in spaces from the tile's middle as drawn. */
function spotOnTile(board: Board, objective: Objective): Spot {
  const { at } = drawing(board);
  const [p, m] = [at(objective), at(tileCentres(board).get(cellAt(board, objective)!.tile)!)];
  return { x: p.c - m.c, y: p.r - m.r };
}

/**
 * Which corner of an objective its number goes in, as on its printed tile (art `numberCorner`): the one
 * nearest its tile's middle, so on its own tile, clear of the map's edge and of the next tile's objective.
 */
export function numberCorner(board: Board, objective: Objective): Corner {
  return tileNumberCorner(spotOnTile(board, objective));
}
