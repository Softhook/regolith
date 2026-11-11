/** What the map's live layers mark, worked out from the board (MapTiles): space roles. */
import { describe, expect, it } from 'vitest';
import { MAPS, buildBoard, type MapDef } from '@regolith/engine';
import { TILE_LAYERS } from '@regolith/art';
import { mapStack, spaceRoles } from '../src/components/board/layers';
import { tileArt } from '../src/art/boardTiles';

const board = (id: string) => buildBoard(MAPS.find((m) => m.id === id)!);
const testMap = (layout: string[][]): MapDef => ({
  id: 't',
  name: 't',
  players: 2,
  group: 't',
  cubes: 4,
  stats: { slack: 0, shared: null, objectives: 0 },
  layout,
});

describe('space roles', () => {
  it('puts each space on one perimeter at most, and every space of a map of objective tiles on one', () => {
    for (const m of MAPS)
      expect(
        spaceRoles(buildBoard(m)).every((s) => s.perimeters <= 1),
        m.id,
      ).toBe(true);
    expect(spaceRoles(board('lagado-planitia')).every((s) => s.perimeters === 1)).toBe(true);
  });

  it('marks a blank tile’s spaces as open ground: no perimeter, no Alien Artefact', () => {
    const roles = spaceRoles(buildBoard(testMap([['7*', '-', '7*']])));
    expect(roles.filter((s) => s.perimeters === 0 && !s.artefact)).toHaveLength(7);
  });
});

describe('the map stacks a tile’s layers', () => {
  it('as printed, each run of images in one group per tile, under and over what it draws from the board', () => {
    // What stands goes again over the spaces' outlines.
    expect(mapStack(TILE_LAYERS)).toEqual([['ground'], 'spaces', ['standing'], 'objective']);
  });
});

describe('tile art', () => {
  it('gives a blank tile a blank’s artwork and an Alien Artefact an Alien Artefact’s, in the map’s order', () => {
    const b = buildBoard(testMap([['7*', '-', '0', '-', '7*']]));
    expect(tileArt(b).map((t) => t.id)).toEqual(['p7-01', 'blank-01', 'void', 'blank-02', 'p7-02']);
  });
});
