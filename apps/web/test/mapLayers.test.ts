/** What the map's live layers mark, worked out from the board (MapTiles): space roles and number corners. */
import { describe, expect, it } from 'vitest';
import { MAPS, buildBoard, tileCentres, type MapDef } from '@regolith/engine';
import { OFF_CENTRE, TILE_LAYERS } from '@regolith/art';
import { mapStack, numberCorner, spaceRoles } from '../src/components/board/layers';
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
  it('on a map with objectives in the middle: every hex is on its objective.s perimeter', () => {
    expect(spaceRoles(board('alpha-hex')).every((s) => s.perimeters === 1)).toBe(true);
  });

  it('marks the spaces where off-centre objectives share a perimeter', () => {
    expect(spaceRoles(board('twin-drift')).filter((s) => s.perimeters > 1)).toHaveLength(6);
  });

  it('marks a blank tile’s spaces as open ground: no perimeter, no Alien Artefact', () => {
    const roles = spaceRoles(buildBoard(testMap([['7*', '-', '7*']])));
    expect(roles.filter((s) => s.perimeters === 0 && !s.artefact)).toHaveLength(7);
  });

  it('marks a perimeter reaching onto an Alien Artefact, which keeps its flask', () => {
    // A 7 leaning onto the Alien Artefact next to it: one of the Alien Artefact's spaces is on its perimeter.
    const b = buildBoard(testMap([['7ne*', '0', '7*']]));
    expect(spaceRoles(b).filter((s) => s.artefact && s.perimeters > 0)).toHaveLength(1);
  });
});

describe('objective numbers', () => {
  it('go in the printed bottom right on an objective in the middle of its tile', () => {
    const b = board('alpha-hex');
    for (const p of b.objectives) expect(numberCorner(b, p)).toEqual({ x: 1, y: 1 });
  });

  it("go in the objective's corner nearest its tile's middle, as the printed tile has it", () => {
    const h = board('twin-drift');
    // 7se: up and left, towards the flower's middle.
    expect(
      numberCorner(
        h,
        h.objectives.find((p) => p.number === 7 && p.r === 2 && p.c === 2)!,
      ),
    ).toEqual({ x: -1, y: -1 });
  });

  it('stay on their own tile where two objectives lean together', () => {
    const b = buildBoard(testMap([['7ne', '7sw']]));
    expect(b.objectives.map((p) => numberCorner(b, p).x)).toEqual([-1, 1]);
  });
});

describe('map design', () => {
  // An off-centre objective sits on its tile's edge space: only the objectives that fit there (art OFF_CENTRE).
  it('puts only 7s off the middle of a tile', () => {
    const spill = MAPS.flatMap((m) => {
      const b = buildBoard(m);
      const middles = new Set([...tileCentres(b).values()].map((t) => `${t.r},${t.c}`));
      return b.objectives
        .filter((p) => !middles.has(`${p.r},${p.c}`) && !OFF_CENTRE.includes(p.number))
        .map((p) => `${m.id}: ${p.number} at ${p.r},${p.c}`);
    });
    expect(spill).toEqual([]);
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
