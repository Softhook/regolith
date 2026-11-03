/** Chance for what's only for show. */
import { describe, expect, it } from 'vitest';
import { shuffled } from '../src/random';

describe('shuffled', () => {
  it('keeps every item and leaves the original as it was', () => {
    const xs = [1, 2, 3, 4, 5];
    expect([...shuffled(xs)].sort()).toEqual(xs);
    expect(xs).toEqual([1, 2, 3, 4, 5]);
  });

  it('puts the first item anywhere about as often', () => {
    const at = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) at[shuffled([0, 1, 2, 3]).indexOf(0)]++;
    for (const n of at) expect(n).toBeGreaterThan(800);
  });
});
