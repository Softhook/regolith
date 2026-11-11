import { BLANK, TILE_SET, assignTiles, type TileSpec, type World } from '@regolith/art';
import { MAPS, WORLD_OBJECTIVES, parseToken, type MapDef } from '@regolith/engine';

/** The maps on any of these worlds, for one player count or every one. */
const mapsOn = (worlds: readonly World[], players?: number) =>
  MAPS.filter((map) => worlds.includes(map.world ?? 'mars') && (players === undefined || map.players === players));

/** The player counts the maps on these worlds are made for, for the Tiles page's kit choice. */
export const tileSetPlayers = (worlds: readonly World[]) => [...new Set(mapsOn(worlds).map((map) => map.players))].sort((a, b) => a - b);

/** The tiles a map lays, as the board assigns them (art `assignTiles`). */
export function mapTiles(map: MapDef): TileSpec[] {
  const tokens = map.layout
    .flat()
    .filter((token) => token !== '.')
    .map((token) => parseToken(token));
  const ids = assignTiles(tokens.map((t, index) => ({ index, number: t.blank ? BLANK : t.number })));
  return tokens.map((_, index) => TILE_SET.find((s) => s.id === ids.get(index))!);
}

/**
 * The tiles a kit needs: every tile any of its maps lays, so each map is laid with the tiles the screen shows
 * (art `assignTiles`). Without a player count, every map on its worlds. A two-sided kit has a world on each
 * side, so it takes its maps from both. Empty when no map fits. In set order.
 */
export function tileKit(worlds: readonly World[], players?: number): TileSpec[] {
  const kit = new Set<TileSpec>();
  for (const map of mapsOn(worlds, players)) for (const t of mapTiles(map)) kit.add(t);
  return TILE_SET.filter((t) => kit.has(t));
}

/**
 * A tile's face on one world. An objective that stands on another world only (a Mass Driver on the Mars side
 * of a Mars / Phobos tile) can't be laid there, so that side is open ground: `blank-p11-01`, the tile's seed.
 */
export function tileSide(tile: TileSpec, world: World): TileSpec {
  const only = WORLD_OBJECTIVES[tile.number];
  return only && only !== world ? { id: `blank-${tile.id}`, number: BLANK, seed: tile.seed } : tile;
}
