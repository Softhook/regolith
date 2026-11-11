/**
 * The Mass Driver (11) stands on Phobos only and the Deep Space Array (12) on Deimos only; both are hard to claim but hold
 * few cubes, and nobody starts at one.
 */
import { describe, expect, it } from 'vitest';
import { MAPS, buildBoard, type MapDef } from '../src';

const alpha = MAPS.find((m) => m.id === 'lagado-planitia')!;

/** Lagado Planitia with its middle objective (an 8) replaced by `token`, on `world`. */
const withMiddle = (token: string, world: MapDef['world']): MapDef => ({
  ...alpha,
  world,
  layout: alpha.layout.map((row) => row.map((t) => (t === '8' ? token : t))),
});

describe('objectives that stand on one world', () => {
  it('lets the Mass Driver stand on Phobos with 2 cubes, and the Deep Space Array on Deimos with 3', () => {
    expect(buildBoard(withMiddle('11', 'phobos')).objectives.find((p) => p.number === 11)?.capacity).toBe(2);
    expect(buildBoard(withMiddle('12', 'deimos')).objectives.find((p) => p.number === 12)?.capacity).toBe(3);
  });

  it('keeps each off the other worlds', () => {
    expect(() => buildBoard(withMiddle('11', 'deimos'))).toThrow(/stands on phobos only/);
    expect(() => buildBoard(withMiddle('11', 'mars'))).toThrow(/stands on phobos only/);
    expect(() => buildBoard(withMiddle('12', 'phobos'))).toThrow(/stands on deimos only/);
  });

  it('does not let anyone start at one', () => {
    expect(() => buildBoard(withMiddle('11*', 'phobos'))).toThrow(/nobody starts/);
  });
});
