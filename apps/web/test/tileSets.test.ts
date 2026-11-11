import { describe, expect, it } from 'vitest';
import { BLANK, TILE_SET, type World } from '@regolith/art';
import { MAPS } from '@regolith/engine';
import { mapTiles, tileKit, tileSetPlayers, tileSide } from '../src/lab/tileSets';

/** A kit's tiles by id: `p7-01`. */
const keysOf = (worlds: World[], players?: number) => new Set(tileKit(worlds, players).map((t) => t.id));

describe('physical tile kits', () => {
  it('lays every map for its player count and world, without needing the full set', () => {
    for (const map of MAPS) {
      const kit = keysOf([map.world ?? 'mars'], map.players);
      for (const k of mapTiles(map)) expect(kit, `${map.id}: ${k.id}`).toContain(k.id);
    }
    expect(tileKit(['mars'], 2).length).toBeLessThan(TILE_SET.length);
  });

  it('gives a world only the tiles its maps lay, without a player count too', () => {
    // No Mars map lays a Mass Driver or a Deep Space Array, which stand on Phobos and Deimos only.
    expect(tileKit(['mars']).some((k) => k.number === 11 || k.number === 12)).toBe(false);
    expect(tileKit(['phobos']).some((k) => k.number === 11)).toBe(true);
    for (const world of ['mars', 'phobos', 'deimos'] as World[]) {
      const all = keysOf([world]);
      for (const players of tileSetPlayers([world]))
        for (const key of keysOf([world], players)) expect(all, `${world} ${players}p`).toContain(key);
    }
  });

  it('offers only the player counts a world has maps for, and is empty for one it hasn’t', () => {
    for (const world of ['mars', 'phobos', 'deimos'] as World[])
      expect(tileSetPlayers([world])).toEqual([...new Set(MAPS.filter((m) => (m.world ?? 'mars') === world).map((m) => m.players))].sort());
    expect(tileKit(['mars'], 99)).toEqual([]);
  });

  it('makes a side open ground where its world can’t hold the tile’s objective', () => {
    const driver = TILE_SET.find((tile) => tile.number === 11)!;
    expect(tileSide(driver, 'phobos')).toBe(driver);
    expect(tileSide(driver, 'mars')).toEqual({ id: `blank-${driver.id}`, number: BLANK, seed: driver.seed });
    // A Citadel stands on any world.
    const citadel = TILE_SET.find((tile) => tile.number === 13)!;
    expect(tileSide(citadel, 'phobos')).toBe(citadel);
  });

  it('makes a two-sided kit that lays every map on either side, with no more tiles than both sides need', () => {
    const worlds: World[] = ['mars', 'phobos'];
    for (const players of [2, 3, 4, 5, undefined]) {
      const kit = keysOf(worlds, players);
      for (const map of MAPS.filter((m) => worlds.includes(m.world ?? 'mars') && (players === undefined || m.players === players)))
        for (const k of mapTiles(map)) expect(kit, `${map.id}: ${k.id}`).toContain(k.id);
      // No bigger than either side's own kit needs.
      expect(kit).toEqual(new Set(worlds.flatMap((w) => [...keysOf([w], players)])));
    }
    // No Mars or Phobos map lays a Deep Space Array.
    expect(tileKit(worlds).some((k) => k.number === 12)).toBe(false);
  });
});
