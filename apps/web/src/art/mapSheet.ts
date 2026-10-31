import { tileSpec, type MapSheetMark, type MapSheetOptions } from '@regolith/art';
import { buildBoard, drawing, startingGround, type Cell, type MapDef } from '@regolith/engine';
import { tileArt } from './boardTiles';

/**
 * What a map's setup sheet shows (art `mapSheetSvg`): each tile where the map lays it, as the game draws it, and
 * what it starts with on the ground. The printed sheets (lab pressSheets) and the manual's Maps section draw it.
 */
export function mapSheet(map: MapDef): Omit<MapSheetOptions, 'bleed' | 'fontCss'> {
  const board = buildBoard(map);
  const { at, cols, rows } = drawing(board);
  /** A space's middle, in spaces from the drawing's corner. */
  const middle = (cell: Cell) => {
    const p = at(cell);
    return { x: p.c + 0.5, y: p.r + 0.5 };
  };
  const starts = new Set(board.planets.filter((p) => p.start).map((p) => board.cells[p.r][p.c].tile));
  const tiles = tileArt(board).map((t) => ({ ...middle(t), number: tileSpec(t.id).number, at: t.at, start: starts.has(t.tile) }));
  const ground = startingGround(map);
  const mark = (kind: MapSheetMark['kind']) => (cell: Cell) => ({ kind, ...middle(cell) });
  const marks = [...ground.gates.map(mark('tunnel')), ...ground.wormhole.map(mark('wormhole')), ...ground.barriers.map(mark('barrier'))];
  return { name: map.name, players: map.players, cubes: map.cubes, world: board.world, cols, rows, tiles, marks };
}
