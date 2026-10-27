/**
 * Test maps with planets off the middle of their tiles (data/maps.yaml, tile tokens such as `7ne`). They
 * aren't in the lobby: `registerOffsetMaps` adds them to MAPS for the test file that asks. They're in the
 * drift group, which every mode plays.
 */
import { MAPS, mapStats, type MapDef } from '../src';

const def = (m: Omit<MapDef, 'stats' | 'cubes' | 'group'>): MapDef => {
  const map: MapDef = { ...m, group: 'drift', cubes: 5, stats: { slack: 0, shared: null, planets: 0 } };
  return { ...map, stats: mapStats(map) };
};

/**
 * Alpha Sector with every planet moved but the 8: the 7s beside the 8 lean in so the 8's whole orbit is
 * shared, the starts sit in a corner, and two 7s face the map's edge (3 orbital spaces).
 */
export const OFFSET_SQUARE = def({
  id: 'offset-square',
  name: 'Offset Square (test)',
  players: 2,
  layout: [
    ['7se*', '7s', '7n'],
    ['7e', '8', '7w'],
    ['7s', '7n', '7nw*'],
  ],
});

/** Alpha Sector (hex) with planets moved toward and away from their neighbours. */
export const OFFSET_HEX = def({
  id: 'offset-hex',
  name: 'Offset Hex (test)',
  players: 2,
  grid: 'hex',
  layout: [
    ['.', '7s*'],
    ['7se', '7'],
    ['7', '8n', '7sw'],
    ['7', '7nw'],
    ['.', '7n*'],
  ],
});

export function registerOffsetMaps() {
  for (const m of [OFFSET_SQUARE, OFFSET_HEX]) if (!MAPS.some((x) => x.id === m.id)) MAPS.push(m);
}
