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
  const starts = new Set(board.planets.filter((p) => p.start).map((p) => board.cells[p.r][p.c].tile));
  const tiles = tileArt(board).map((t) => {
    const middle = at(t);
    return {
      x: middle.c + 0.5,
      y: middle.r + 0.5,
      number: tileSpec(t.id).number,
      at: t.at,
      start: starts.has(t.tile),
    };
  });
  const ground = startingGround(map);
  const mark = (kind: MapSheetMark['kind']) => (cell: Cell) => ({ kind, x: at(cell).c + 0.5, y: at(cell).r + 0.5 });
  const marks = [...ground.gates.map(mark('tunnel')), ...ground.wormhole.map(mark('wormhole')), ...ground.barriers.map(mark('barrier'))];
  return { name: map.name, players: map.players, cubes: map.cubes, world: board.world, cols, rows, tiles, marks };
}
