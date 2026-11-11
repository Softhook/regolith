import { BLANK, TILE_SET, type TileSpec, type World } from '@regolith/art';
import { MAPS, WORLD_OBJECTIVES, parseToken } from '@regolith/engine';

/** The player counts maps are made for, for the Tiles page's kit choice. */
export const TILE_SET_PLAYERS = [...new Set(MAPS.map((map) => map.players))].sort((a, b) => a - b);

/**
 * The tiles a kit needs: the most of each kind any one of its maps lays, so the k-th tile of a kind
 * (art `assignTiles`) is always there. Without a player count, every map on its worlds. A two-sided kit has a
 * world on each side, so it takes its maps from both.
 */
export function tileKit(worlds: readonly World[], players?: number): TileSpec[] {
  const maps = MAPS.filter((map) => worlds.includes(map.world ?? 'mars') && (players === undefined || map.players === players));
  if (!maps.length) throw new Error(`No ${players ?? ''}-player maps on ${worlds.join(' or ')}`);

  const needed = new Map<number, number>();
  for (const map of maps) {
    const counts = new Map<number, number>();
    for (const token of map.layout.flat()) {
      if (token === '.') continue;
      const parsed = parseToken(token);
      const number = parsed.blank ? BLANK : parsed.number;
      counts.set(number, (counts.get(number) ?? 0) + 1);
    }
    for (const [number, count] of counts) needed.set(number, Math.max(needed.get(number) ?? 0, count));
  }

  const seen = new Map<number, number>();
  return TILE_SET.filter((tile) => {
    const index = seen.get(tile.number) ?? 0;
    seen.set(tile.number, index + 1);
    return index < (needed.get(tile.number) ?? 0);
  });
}

/**
 * A tile's face on one world. An objective that stands on another world only (a Mass Driver on the Mars side
 * of a Mars / Phobos tile) can't be laid there, so that side is open ground: `blank-p11-01`, the tile's seed.
 */
export function tileSide(tile: TileSpec, world: World): TileSpec {
  const only = WORLD_OBJECTIVES[tile.number];
  return only && only !== world ? { id: `blank-${tile.id}`, number: BLANK, seed: tile.seed } : tile;
}
