import { Fragment, memo, type ReactNode } from 'react';
import type { Board } from '@regolith/engine';
import { GROUND_BASE, HEX_EDGE, RASTER_AREA, TILE, TILE_LAYERS, hexEdge, artefactFlask, type RasterLayer } from '@regolith/art';
import { useTileImages } from '../../art/tileImages';
import type { TileArt } from '../../art/boardTiles';
import { hexCorners, hexFlower, hexSeams, placement } from './geometry';
import { mapStack, spaceRoles, type BoardLayer } from './layers';

const points = (list: number[][]) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
const line = (list: number[][]) => `M${list.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L')}`;

/**
 * The spaces' outlines on the map, in millimetres, with a faint flask on an Alien Artefact's (mechs there gain Research), and
 * a group per space for the board's tests and checks to find. Worked out from the board, so a perimeter reaching onto
 * another tile is marked there too. The outlines (`edges`) are apart, to fade with the map's seams.
 */
function wells(board: Board): { edges: string; wells: string } {
  const { mid } = placement(board, TILE.cell);
  let out = '';
  let edges = '';
  for (const { p, perimeters, artefact: isArtefact } of spaceRoles(board)) {
    const { x, y } = mid(p);
    const role = perimeters > 1 ? 'shared' : perimeters ? 'perimeter' : 'space';
    out += `<g class="well" data-r="${p.r}" data-c="${p.c}" data-role="${role}${isArtefact ? ' artefact' : ''}">`;
    edges += hexEdge(x, y);
    if (isArtefact) out += artefactFlask(x, y);
    out += '</g>';
  }
  return { edges, wells: out };
}

/**
 * The spaces of a map, in millimetres, by map: they follow from where its objectives are, not from the cubes on
 * them, so a move (a new board) doesn't redraw them.
 */
const marksByMap = new Map<string, { edges: string; wells: string }>();
function marksOf(board: Board) {
  let marks = marksByMap.get(board.mapId);
  if (marks === undefined) marksByMap.set(board.mapId, (marks = wells(board)));
  return marks;
}

/**
 * A map's tiles in SVG, in their layers (art `TILE_LAYERS`), as a printed tile has them: each tile's ground on its
 * world with its building on the objective's space, and what stands on it drawn again over the spaces, so the
 * outlines are etched into the ground and not across the buildings. The images are the layers drawn with filters
 * (tileImages); the spaces are drawn live, from the board, the seams between tiles under them. The objectives'
 * numbers and cubes, their layer, go on top, with the tunnels and mechs (BoardArt).
 */
export const MapTiles = memo(function MapTiles({ board, tiles, cell }: { board: Board; tiles: TileArt[]; cell: number }) {
  const images: Record<RasterLayer, Record<string, string>> = {
    ground: useTileImages(tiles, board.world, 'ground'),
    standing: useTileImages(tiles, board.world, 'standing'),
  };
  const { mid } = placement(board, cell);
  const mm = cell / TILE.cell;
  // A tile's artwork is a whole printed tile, 3 spaces wide, centred on what it draws.
  const size = 3 * cell;
  // Tiles meet at a seam.
  const outline = (t: TileArt) =>
    hexFlower(board, t).map((p) => {
      const { x, y } = mid(p);
      // A touch larger, so no hairline shows between a tile's own hexes.
      return <polygon key={`${p.r},${p.c}`} points={points(hexCorners(x, y, cell * 1.01))} />;
    });
  /**
   * A tile's image of a layer over its area (art `RASTER_AREA`), centred on the tile's middle. The ground reaches
   * past its tile by the bleed, so the clip a touch past the hexes is on ground.
   */
  const image = (t: TileArt, layer: RasterLayer) => {
    const url = images[layer][t.id];
    const at = mid(t);
    const area = RASTER_AREA[layer];
    const px = (v: number) => (v * size) / TILE.size;
    return (
      url && (
        <image
          key={layer}
          href={url}
          x={at.x + px(area.x - TILE.size / 2)}
          y={at.y + px(area.y - TILE.size / 2)}
          width={px(area.w)}
          height={px(area.h)}
        />
      )
    );
  };
  const stack = mapStack(TILE_LAYERS);
  // The world's ground colour goes under the bottom run of images, where a tile's images haven't come yet.
  const bottom = stack.find(Array.isArray);
  const marks = marksOf(board);
  const drawn: Record<BoardLayer, () => ReactNode> = {
    spaces: () => (
      <>
        {/* The seams and the spaces' outlines solid, faded as one, so where they meet the line is no darker. */}
        <g opacity={HEX_EDGE.opacity}>
          <path
            d={hexSeams(board, cell, tiles).map(line).join(' ')}
            fill="none"
            stroke="#000"
            strokeWidth={Math.max(1, HEX_EDGE.width * mm)}
            strokeLinecap="round"
          />
          <g transform={`scale(${mm})`} dangerouslySetInnerHTML={{ __html: marks.edges }} />
        </g>
        <g transform={`scale(${mm})`} dangerouslySetInnerHTML={{ __html: marks.wells }} />
      </>
    ),
    // Live: they change in play (BoardArt).
    objective: () => null,
  };
  return (
    <>
      <defs>
        {tiles.map((t) => (
          <clipPath key={t.tile} id={`map-tile-${t.tile}`}>
            {outline(t)}
          </clipPath>
        ))}
      </defs>
      {stack.map((part) =>
        Array.isArray(part) ? (
          <Fragment key={part.join()}>
            {tiles.map((t) => (
              <g key={t.tile} clipPath={`url(#map-tile-${t.tile})`}>
                {part === bottom && (
                  <rect x={mid(t).x - size / 2} y={mid(t).y - size / 2} width={size} height={size} fill={GROUND_BASE[board.world]} />
                )}
                {part.map((layer) => image(t, layer))}
              </g>
            ))}
          </Fragment>
        ) : (
          <Fragment key={part}>{drawn[part]()}</Fragment>
        ),
      )}
    </>
  );
});
