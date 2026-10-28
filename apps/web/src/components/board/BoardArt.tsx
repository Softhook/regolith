import { memo, type CSSProperties } from 'react';
import { drawing, type Board, type GameState } from '@regolith/engine';
import { PLANET_DIAMETER, TILE } from '@regolith/art';
import { BarrierBubble } from './BarrierBubble';
import { tileArt, type TileArt } from '../../art/boardTiles';
import { GATE_COLOR, WORMHOLE_COLOR } from '../../theme';
import { placement } from './geometry';
import { PlanetMarkings } from './PlanetMarkings';
import { MapTiles } from './MapTiles';
import { numberCorner } from './layers';

// A map's tile art, worked out once: a map id always names the same layout.
const tileArtByMap = new Map<string, TileArt[]>();
export function tileArtOf(board: Board): TileArt[] {
  let tiles = tileArtByMap.get(board.mapId);
  if (!tiles) tileArtByMap.set(board.mapId, (tiles = tileArt(board)));
  return tiles;
}

/**
 * The map drawn in SVG: tile art, spaces, warp gates, and each planet's number and cube slots. Memoised:
 * a pan moves the board, not what's drawn on it.
 */
export const BoardArt = memo(function BoardArt({
  game,
  cell,
  lateCube,
}: {
  game: GameState;
  cell: number;
  /** A planet whose new cube drops in late, and when (a relocated cube, see staging). */
  lateCube?: { planet: number; ms: number };
}) {
  const { planets } = game.board;
  const tiles = tileArtOf(game.board);
  const { rows, cols } = drawing(game.board);
  const W = cols * cell;
  const H = rows * cell;
  const { box, mid } = placement(game.board, cell);
  // Print millimetres to screen pixels: the tile art and everything drawn over it use the printed geometry.
  const mm = cell / TILE.cell;
  const { world } = game.board;
  // The open gates, then any of a Warp Gate pair placed so far: faint until the pair is complete.
  const head = game.pending[0];
  const placing = head?.kind === 'warpGate' ? head.placed : [];
  const gates = [
    ...(game.wormhole ?? []).map((g) => ({ ...g, open: true, wormhole: true, color: WORMHOLE_COLOR })),
    ...game.gates.map((g) => ({ ...g, open: true, wormhole: false, color: GATE_COLOR })),
    ...placing.map((g) => ({ ...g, open: false, wormhole: false, color: GATE_COLOR })),
  ];
  return (
    <>
      <svg className="board-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={cell * 0.08} />
          </filter>
        </defs>

        <MapTiles board={game.board} tiles={tiles} cell={cell} />

        {gates.map((g, i) => (
          <g key={i} transform={`translate(${mid(g).x} ${mid(g).y})`} opacity={g.open ? 1 : 0.5}>
            <circle r={cell * 0.4} fill="none" stroke={g.color} strokeWidth={cell * 0.05} filter="url(#glow)" />
          </g>
        ))}

        {/* Barriers (a power): soft glass bubbles on the planet's surface (BarrierBubble). */}
        {(game.barriers ?? []).map((b) => (
          <BarrierBubble key={`b${b.r},${b.c}`} r={b.r} c={b.c} x={mid(b).x} y={mid(b).y} cell={cell} mm={mm} cast world={world} />
        ))}

        {planets.map((p) => {
          const { x: cx, y: cy } = mid(p);
          // The planet itself is the tile's art (MapTiles); this layer adds the live number and cubes, placed
          // and sized as on the printed tile.
          const R = (PLANET_DIAMETER[p.number] / 2) * mm;
          return (
            <g key={p.id} style={lateCube?.planet === p.id ? ({ '--cube-late': `${lateCube.ms}ms` } as CSSProperties) : undefined}>
              {p.start && game.phase === 'setup' && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={R * 1.12}
                  fill="none"
                  stroke="#fff"
                  strokeOpacity={0.5}
                  strokeDasharray={`${3 * mm} ${4 * mm}`}
                />
              )}
              <PlanetMarkings
                cx={cx}
                cy={cy}
                mm={mm}
                n={p.number}
                capacity={p.capacity}
                cubes={p.cubes.map((o) => game.players[o].color)}
                corner={numberCorner(game.board, p)}
                numberClass="planet-num"
                cubeClass="cube"
                cast="cube-shadow"
              />
            </g>
          );
        })}
      </svg>
      {/* Each gate's turning ring is its own element over the map, so turning it doesn't repaint the map. */}
      {gates.map((g, i) => (
        <svg
          key={i}
          className={g.wormhole ? 'gate-spin wormhole-spin' : 'gate-spin'}
          style={{ left: box(g).left, top: box(g).top, opacity: g.open ? 1 : 0.5 }}
          width={cell}
          height={cell}
          viewBox={`0 0 ${cell} ${cell}`}
        >
          <circle
            cx={cell / 2}
            cy={cell / 2}
            r={cell * 0.36}
            fill="none"
            stroke={g.color}
            strokeWidth={cell * 0.025}
            strokeDasharray={`${cell * 0.065} ${cell * 0.065}`}
          />
          {g.wormhole && (
            <circle
              cx={cell / 2}
              cy={cell / 2}
              r={cell * 0.24}
              fill="none"
              stroke={g.color}
              strokeWidth={cell * 0.04}
              strokeDasharray={`${cell * 0.12} ${cell * 0.05}`}
            />
          )}
        </svg>
      ))}
    </>
  );
});
