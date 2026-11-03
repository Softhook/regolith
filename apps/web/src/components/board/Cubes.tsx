import type { CSSProperties } from 'react';
import { type GameState } from '@regolith/engine';
import { CUBE_PAD, REGOLITH_SHADOW, TILE, cubePadCentres, type World } from '@regolith/art';
import { DIE_CORNER } from '../../theme';
import { placement } from './geometry';
import { numberCorner } from './layers';
import { PlanetMark } from './PlanetMarkings';
import { castShadow, pieceShadowLength, pieceShadowOpacity, shadowOnCube } from './shadows';
import type { Staging } from './staging';

/** A cube on the map: its top left and size in px, its corners' radius, and its colour. */
export interface CubeSpot {
  key: string;
  planet: number;
  x: number;
  y: number;
  size: number;
  corner: number;
  color: string;
}

/** Each planet's cubes, on the spaces its tile prints for them. */
export function cubeSpots(game: GameState, cell: number): CubeSpot[] {
  const { mid } = placement(game.board, cell);
  const mm = cell / TILE.cell;
  const size = CUBE_PAD.size * mm;
  return game.board.planets.flatMap((p) => {
    const pads = cubePadCentres(p.capacity, 0, 0);
    const { x, y } = mid(p);
    return p.cubes.map((owner, i) => ({
      key: `${p.id}:${i}`,
      planet: p.id,
      x: x + pads[i].x * mm - size / 2,
      y: y + pads[i].y * mm - size / 2,
      size,
      corner: CUBE_PAD.corner * mm,
      color: game.players[owner].color,
    }));
  });
}

/** A planet's new cube may drop in late (a relocated one, see staging): its shadow and it wait as long. */
const lateStyle = (planet: number, late: Staging['cube']) =>
  late?.planet === planet ? ({ '--cube-late': `${late.ms}ms` } as CSSProperties) : undefined;

/**
 * The shadows the cubes cast on `world`'s ground, for the layer the dice's are in (ShipShadows): where the two meet it's no
 * darker. Each is the cube's rounded footprint swept down and to the right for its height (a cube, so its width), and
 * falls in with its cube, from as far away as the cube falls from (`--away`, the cube's 320%).
 */
export function CubeShadows({ cubes, world, mm, late }: { cubes: CubeSpot[]; world: World; mm: number; late?: Staging['cube'] }) {
  return (
    <svg className="board-svg">
      {cubes.map((q) => {
        const far = q.size * pieceShadowLength(world);
        const { style, ...shape } = castShadow(q.x, q.y, q.size, q.corner, far, q.color);
        return (
          <polygon
            key={q.key}
            {...shape}
            className="cube-shadow"
            style={
              {
                ...style,
                ...lateStyle(q.planet, late),
                filter: `blur(${REGOLITH_SHADOW.blur * mm}px)`,
                '--away': `${3.2 * far}px`,
              } as CSSProperties
            }
          />
        );
      })}
    </svg>
  );
}

/** A die on the map, as its shadow goes: its top left and size in px, and its colour. */
export interface DieSpot {
  x: number;
  y: number;
  size: number;
  color: string;
}

/**
 * The shadows of `dice` on the top of cube `q`, if any reach it, each cut to the top (.cube-shade). The top stands above the
 * ground, so a shadow is shorter there (`shadowOnCube`) and its edge jumps back as it crosses onto the cube, which is what
 * makes a cube stand up. Hard-edged and drawn with the cube, so a cube a shadow doesn't reach costs nothing, and it falls with it.
 */
function CubeShade({ q, dice, world }: { q: CubeSpot; dice: DieSpot[]; world: World }) {
  const shades = dice.flatMap((d) => {
    const far = shadowOnCube(world, d.size, q.size);
    const reaches = d.x + d.size + far > q.x && d.x < q.x + q.size && d.y + d.size + far > q.y && d.y < q.y + q.size;
    return reaches ? [castShadow(d.x - q.x, d.y - q.y, d.size, d.size * DIE_CORNER, far, d.color)] : [];
  });
  if (!shades.length) return null;
  return (
    <svg className="cube-shade" style={{ borderRadius: q.corner, opacity: pieceShadowOpacity(world) }}>
      {shades.map((shape, i) => (
        <polygon key={i} {...shape} />
      ))}
    </svg>
  );
}

/**
 * The cubes, each drawn as a die's face without its pips (.die3d-face), so the two can't drift apart, with the shadows that land on
 * it, and the planets' numbers, over the shadows that fall their way: a number has to stay readable, whatever stands next to it.
 */
export function Cubes({
  game,
  cubes,
  dice,
  cell,
  late,
}: {
  game: GameState;
  cubes: CubeSpot[];
  dice: DieSpot[];
  cell: number;
  late?: Staging['cube'];
}) {
  const { mid } = placement(game.board, cell);
  return (
    <div className="map-cubes" aria-hidden>
      <svg className="board-svg">
        {game.board.planets.map((p) => (
          <PlanetMark
            key={p.id}
            cx={mid(p).x}
            cy={mid(p).y}
            mm={cell / TILE.cell}
            n={p.number}
            corner={numberCorner(game.board, p)}
            className="planet-num"
          />
        ))}
      </svg>
      {cubes.map((q) => (
        <div
          key={q.key}
          className="cube"
          style={
            {
              ...lateStyle(q.planet, late),
              left: q.x,
              top: q.y,
              width: q.size,
              height: q.size,
              '--die-size': `${q.size}px`,
              '--die-color': q.color,
            } as CSSProperties
          }
        >
          <div className="die3d-face" style={{ borderRadius: q.corner }} />
          <CubeShade q={q} dice={dice} world={game.board.world} />
        </div>
      ))}
    </div>
  );
}
