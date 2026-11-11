import { describe, expect, it } from 'vitest';
import { BLANK, TILE_SET, assignTiles, type World } from '@regolith/art';
import { MAPS, parseToken, type MapDef } from '@regolith/engine';
import { tileKit, tileSide } from '../src/lab/tileSets';

/** The physical tiles a map lays, as the board assigns them. */
const tilesOf = (map: MapDef) =>
  assignTiles(
    map.layout
      .flat()
      .filter((token) => token !== '.')
      .map((token, index) => {
        const parsed = parseToken(token);
        return { index, number: parsed.blank ? BLANK : parsed.number };
      }),
  ).values();

describe('physical tile kits', () => {
  it('covers every map for its player count and world without needing the full set', () => {
    for (const map of MAPS) {
      const available = new Set(tileKit([map.world ?? 'mars'], map.players).map((tile) => tile.id));
      for (const id of tilesOf(map)) expect(available, `${map.id}: ${id}`).toContain(id);
    }
    expect(tileKit(['mars'], 2).length).toBeLessThan(TILE_SET.length);
  });

  it('gives a world only the tiles its maps lay, without a player count too', () => {
    // No Mars map lays a Mass Driver or a Deep Space Array, which stand on Phobos and Deimos only.
    expect(tileKit(['mars']).some((tile) => tile.number === 11 || tile.number === 12)).toBe(false);
    expect(tileKit(['phobos']).some((tile) => tile.number === 11)).toBe(true);
    for (const world of ['mars', 'phobos', 'deimos'] as World[]) {
      const all = new Set(tileKit([world]).map((tile) => tile.id));
      for (const players of new Set(MAPS.filter((m) => (m.world ?? 'mars') === world).map((m) => m.players)))
        for (const tile of tileKit([world], players)) expect(all, `${world} ${players}p`).toContain(tile.id);
    }
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
      const kit = tileKit(worlds, players);
      const ids = new Set(kit.map((tile) => tile.id));
      for (const map of MAPS.filter((m) => worlds.includes(m.world ?? 'mars') && (players === undefined || m.players === players)))
        for (const id of tilesOf(map)) expect(ids, `${map.id}: ${id}`).toContain(id);
      // No bigger than either side's own kit needs.
      const sides = new Set(worlds.flatMap((w) => tileKit([w], players).map((t) => t.id)));
      expect(ids).toEqual(sides);
    }
    // No Mars or Phobos map lays a Deep Space Array.
    expect(tileKit(worlds).some((tile) => tile.number === 12)).toBe(false);
  });
});
