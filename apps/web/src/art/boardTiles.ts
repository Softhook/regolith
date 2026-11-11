import { drawing, tileCentres, type Board, type Cell } from '@regolith/engine';
import { BLANK, assignTiles, tileFlavour, tileSpec, type Spot } from '@regolith/art';

export interface TileArt {
  /** The tile's middle space, where its sky is centred. */
  r: number;
  c: number;
  /** The tile's index on the board (`BoardCell.tile`). */
  tile: number;
  /** The physical tile whose artwork (sky, and objective or Alien Artefact heart, or a blank's bare sky or ground) goes here. */
  id: string;
  /** Where the tile's body is drawn: its objective's space, anywhere on the tile, or the middle for an Alien Artefact. */
  body: Cell;
  /** Where the body is as drawn, in spaces from the tile's middle (x right, y down). */
  at: Spot;
}

/** Each tile of the map (a hex map's 7-hex flowers), with the physical tile it uses (packages/art). */
export function tileArt(board: Board): TileArt[] {
  const { tiles, ids } = tileIds(board);
  const objectives = new Map(board.objectives.map((p) => [board.cells[p.r][p.c].tile, p]));
  const drawn = drawing(board).at;
  return [...tiles].map(([index, { r, c }]) => {
    const p = objectives.get(index);
    const body = p ? { r: p.r, c: p.c } : { r, c };
    const [a, b] = [drawn({ r, c }), drawn(body)];
    return { r, c, tile: index, id: ids.get(index)!, body, at: { x: b.c - a.c, y: b.r - a.r } };
  });
}

/** The map's tiles by index (`BoardCell.tile`), and the physical tile id each one uses. */
function tileIds(board: Board) {
  const tiles = new Map<number, { r: number; c: number; number: number }>();
  // A tile without an objective is an Alien Artefact, or a blank where its spaces give no research.
  for (const [tile, { r, c }] of [...tileCentres(board)].sort(([a], [b]) => a - b))
    tiles.set(tile, { r, c, number: board.cells[r][c].artefact ? 0 : BLANK });
  for (const p of board.objectives) tiles.get(board.cells[p.r][p.c].tile)!.number = p.number;
  const ids = assignTiles([...tiles].map(([index, t]) => ({ index, number: t.number })));
  return { tiles, ids };
}

const names = new Map<string, Map<number, string>>();

/** Each objective's made-up name, from the tile artwork it sits on (the name printed on that tile). */
export function objectiveNames(board: Board): Map<number, string> {
  let out = names.get(board.mapId);
  if (!out) {
    const { ids } = tileIds(board);
    out = new Map();
    for (const p of board.objectives) out.set(p.id, tileFlavour(tileSpec(ids.get(board.cells[p.r][p.c].tile)!)).name);
    names.set(board.mapId, out);
  }
  return out;
}
