import { objectiveFlavour, type ObjectiveFlavour } from '../flavour';
import { hash, rng } from '../rng';
import { OBJECTIVE_FAMILY, type ObjectiveType } from '../tokens';

/** One physical tile: which objective it carries and the seed its look comes from. */
export interface TileSpec {
  /** `p7-01` … `p10-05`, `void`, `void-2`, `void-3`, or `blank-01` … */
  id: string;
  /** Objective number, 0 for an Alien Artefact tile, or BLANK. */
  number: number;
  seed: number;
  /** The kind of objective it was in Cubic's space look, which still picks its made-up name (`tileFlavour`). */
  type?: ObjectiveType;
  /** How its base is drawn (`DESIGN_TILES`): for a 7 to 10 its middle (regolith/base.ts), for an 11, 12 or 13 its landmark (regolith/landmarks.ts `LANDMARKS`), unless a draft names another. */
  design?: string;
}

/** A blank tile's number: open ground, with no objective and no Alien Artefact (a map's `-`). */
export const BLANK = -1;

/**
 * How many of each tile a set needs: for objectives and blanks, the most any map in data/maps.yaml uses at once
 * (docs/GRAPHICS.md §2a); three Alien Artefacts. Start objectives use a separate token, so they need no tiles of their own.
 */
export const SET_COUNTS: Record<number, number> = { 7: 8, 8: 8, 9: 6, 10: 5, 11: 2, 12: 2, 13: 1, 0: 3, [BLANK]: 10 };

/**
 * How each tile of a number is drawn, one design each so no two tiles of an objective look alike (a set has as
 * many as `SET_COUNTS`; tiles past it take them again): its middle for a 7 to 10 (regolith/cores.ts `CORES`), its
 * landmark for the hard objectives (mood board Landmarks): the 11s a Ring Accelerator, the first 12 a Deep Space
 * Array and the second an Atmosphere Plant, the 13 the Citadel.
 */
const DESIGN_TILES: Record<number, readonly string[]> = {
  7: ['dome', 'warren', 'torus', 'farm', 'comb', 'crescent', 'sawtooth', 'wings'],
  8: ['deck', 'columns', 'spheres', 'bund', 'furnace', 'manifold', 'flare', 'smelter'],
  9: ['frost', 'quarry', 'bore', 'derrick', 'melt', 'crevasse'],
  10: ['octagon', 'containment', 'tokamak', 'hall', 'pool'],
  11: ['ring'],
  12: ['array', 'air'],
  13: ['citadel'],
};

/** The look of one tile, from its id. Ids past the set's count (a map larger than the set) still work. */
export function tileSpec(id: string): TileSpec {
  if (id === 'void' || /^void-[1-9]\d*$/.test(id)) return { id, number: 0, seed: hash(id) };
  if (/^blank-([1-9]\d*|0[1-9]\d*)$/.test(id)) return { id, number: BLANK, seed: hash(id) };
  const m = /^p(\d+)-([1-9]\d*|0[1-9]\d*)$/.exec(id);
  const number = m ? Number(m[1]) : 0;
  const family = OBJECTIVE_FAMILY[number];
  if (!m || !family) throw new Error(`Unknown tile id: ${id}`);
  const index = Number(m[2]) - 1;
  const designs = DESIGN_TILES[number];
  return {
    id,
    number,
    seed: hash(id),
    type: family.types[index % family.types.length],
    ...(designs && { design: designs[index % designs.length] }),
  };
}

const tileId = (number: number, i: number) => {
  if (number === 0) return i === 0 ? 'void' : `void-${i + 1}`;
  return `${number === BLANK ? 'blank' : `p${number}`}-${String(i + 1).padStart(2, '0')}`;
};

const tilesOf = (num: number) => Array.from({ length: SET_COUNTS[num] }, (_, i) => tileSpec(tileId(num, i)));

/** Every tile in a full set, in order: the objectives, the Alien Artefacts, and the blanks the open-ground maps spread out with. */
export const TILE_SET: TileSpec[] = [7, 8, 9, 10, 11, 12, 13, 0, BLANK].flatMap(tilesOf);

/**
 * Which physical tile goes where on a map: the k-th objective of a number gets that number's k-th tile.
 * The same map always gets the same tiles, so the screen matches a table set up from the same list.
 */
export function assignTiles(tiles: { index: number; number: number }[]): Map<number, string> {
  const used: Record<number, number> = {};
  const out = new Map<number, string>();
  for (const t of tiles) {
    const k = used[t.number] ?? 0;
    used[t.number] = k + 1;
    out.set(t.index, tileId(t.number, k));
  }
  return out;
}

/** A tile's kind of objective: its spec's, or its number's first. */
const objectiveType = (spec: TileSpec): ObjectiveType => spec.type ?? OBJECTIVE_FAMILY[spec.number].types[0];

/** The made-up name and survey data of a tile's objective, which the game names it by. */
export function tileFlavour(spec: TileSpec): ObjectiveFlavour {
  return objectiveFlavour(rng(spec.seed).fork('name'), objectiveType(spec), spec.number);
}
