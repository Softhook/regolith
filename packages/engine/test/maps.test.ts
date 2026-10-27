import { describe, expect, it } from 'vitest';
import { MAPS, adjacent, buildBoard, distance, isDiagonalStep, mapStats } from '../src';

describe('maps', () => {
  for (const map of MAPS)
    it(`${map.name} (${map.players}p): stats match its layout`, () => {
      expect(mapStats(map)).toEqual(map.stats);
      expect(map.layout.flat().filter((t) => t.endsWith('*')).length).toBeGreaterThanOrEqual(map.players);
    });
});

describe('wrapping maps', () => {
  const board = (id: string) => buildBoard(MAPS.find((m) => m.id === id)!);
  const has = (cells: readonly { r: number; c: number }[], r: number, c: number) => cells.some((q) => q.r === r && q.c === c);

  it('left and right edges join on a horizontal map', () => {
    const b = board('appeal-to-authority'); // 9 rows × 15 cols
    expect(has(adjacent(b, { r: 4, c: 0 }), 4, 14)).toBe(true);
    expect(has(adjacent(b, { r: 4, c: 14 }), 4, 0)).toBe(true);
    expect(distance({ r: 4, c: 0 }, { r: 4, c: 14 }, b)).toBe(1);
    expect(isDiagonalStep({ r: 3, c: 0 }, { r: 4, c: 14 }, b)).toBe(true);
    // Top and bottom do not join.
    expect(adjacent(b, { r: 0, c: 3 }).some((q) => q.r === 8)).toBe(false);
  });

  it('top and bottom edges join on a vertical map', () => {
    const b = board('no-true-scotsman'); // 30 rows × 3 cols
    expect(has(adjacent(b, { r: 0, c: 1 }), 29, 1)).toBe(true);
    expect(adjacent(b, { r: 1, c: 0 }).some((q) => q.c === 2)).toBe(false);
  });

  it('on a torus only rows and columns with tiles at both ends join', () => {
    const b = board('special-pleading'); // 12 rows × 15 cols; only the 10s' column reaches the top
    expect(has(adjacent(b, { r: 0, c: 7 }), 11, 7)).toBe(true);
    expect(has(adjacent(b, { r: 5, c: 0 }), 5, 14)).toBe(true);
    expect(adjacent(b, { r: 3, c: 1 }).some((q) => q.r === 2)).toBe(false); // gap above, no wrap to the bottom
  });

  it('non-wrapping maps are unchanged', () => {
    const b = board('alpha-sector');
    expect(adjacent(b, { r: 4, c: 0 }).some((q) => q.c === 8)).toBe(false);
  });
});
