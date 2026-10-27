import { describe, expect, it } from 'vitest';
import { MAPS, mapStats } from '../src';

describe('maps', () => {
  for (const map of MAPS)
    it(`${map.name} (${map.players}p): stats match its layout`, () => {
      expect(mapStats(map)).toEqual(map.stats);
      expect(map.layout.flat().filter((t) => t.endsWith('*')).length).toBeGreaterThanOrEqual(map.players);
    });
});
