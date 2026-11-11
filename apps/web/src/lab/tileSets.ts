import { BLANK, TILE_SET, assignTiles, type TileSpec, type World } from '@regolith/art';
import { MAPS, WORLD_OBJECTIVES, parseToken, type MapDef } from '@regolith/engine';

/** The maps on any of these worlds, for one player count or every one. */
const mapsOn = (worlds: readonly World[], players?: number) =>
  MAPS.filter((map) => worlds.includes(map.world ?? 'mars') && (players === undefined || map.players === players));

/** The player counts the maps on these worlds are made for, for the Tiles page's kit choice. */
export const tileSetPlayers = (worlds: readonly World[]) => [...new Set(mapsOn(worlds).map((map) => map.players))].sort((a, b) => a - b);

/**
 * One physical tile of a kit: the tile (art `TILE_SET`) and where its planet sits, as a map's layout token says
 * (`se`), `''` for the middle. A map that moves a 7 off the middle lays a tile printed that way, so a kit
 * can hold the same tile twice: `p7-01` in the middle for one map, `p7-01` at `se` for another.
 */
export interface KitTile {
  tile: TileSpec;
  at: string;
}

/** A kit tile's key, unique in its kit: `p7-01`, `p7-01-se`. */
export const kitKey = (k: KitTile) => k.tile.id + (k.at ? `-${k.at}` : '');

/** The tiles a map lays, as the board assigns them (art `assignTiles`), each with where its planet sits. */
export function mapTiles(map: MapDef): KitTile[] {
  const tokens = map.layout
    .flat()
    .filter((token) => token !== '.')
    .map((token) => parseToken(token));
  const ids = assignTiles(tokens.map((t, index) => ({ index, number: t.blank ? BLANK : t.number })));
  return tokens.map((t, index) => ({ tile: TILE_SET.find((s) => s.id === ids.get(index))!, at: t.dir ?? '' }));
}

/**
 * The tiles a kit needs: every tile any of its maps lays, where that map puts its planet, so each map is laid
 * with the tiles the screen shows (art `assignTiles`). Without a player count, every map on its worlds. A
 * two-sided kit has a world on each side, so it takes its maps from both. Empty when no map fits. In set
 * order, a tile in the middle before the same tile off it.
 */
export function tileKit(worlds: readonly World[], players?: number): KitTile[] {
  const kit = new Map<string, KitTile>();
  for (const map of mapsOn(worlds, players)) for (const k of mapTiles(map)) kit.set(kitKey(k), k);
  const order = (k: KitTile) => TILE_SET.indexOf(k.tile);
  return [...kit.values()].sort((a, b) => order(a) - order(b) || a.at.localeCompare(b.at));
}

/**
 * A tile's face on one world. An objective that stands on another world only (a Mass Driver on the Mars side
 * of a Mars / Phobos tile) can't be laid there, so that side is open ground: `blank-p11-01`, the tile's seed.
 */
export function tileSide(tile: TileSpec, world: World): TileSpec {
  const only = WORLD_OBJECTIVES[tile.number];
  return only && only !== world ? { id: `blank-${tile.id}`, number: BLANK, seed: tile.seed } : tile;
}
