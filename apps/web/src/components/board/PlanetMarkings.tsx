import { CUBE_PAD, PLANET_FAMILY, REGOLITH_SHADOW, WELL, cubePadCentres, numberPlacement, well, type Corner } from '@regolith/art';
import type { CSSProperties } from 'react';
import { PIECE_SHADOW_LENGTH, PIECE_SHADOW_OPACITY, castShadow } from './shadows';

/** A planet's number as the tile prints it: white, outlined in a dark shade of the planet's hue. `y` is the baseline. */
function PlanetNumber({ n, x, y, size, className }: { n: number; x: number; y: number; size: number; className?: string }) {
  return (
    <text
      className={className}
      x={x}
      y={y}
      fontSize={size}
      fontWeight={800}
      fill="#fff"
      letterSpacing="-.03em"
      paintOrder="stroke"
      strokeLinejoin="round"
      stroke={`hsl(${PLANET_FAMILY[n].hue} 50% 7%)`}
      strokeWidth={size * 0.13}
      textAnchor="middle"
    >
      {n}
    </text>
  );
}

/**
 * A planet's live markings over its tile art, placed and sized as on the printed tile: its number and
 * cube spaces. `cubes[i]` is the colour of the cube in space i. Used by the board and the manual alike.
 * `cast`: on a world's ground, each cube casts a hard shadow with a hint of its colour, as the dice do (shadows.ts),
 * its glow gone. `corner` moves the number from the printed bottom right to another corner, as on a tile whose planet is off its middle (art `numberCorner`).
 */
export function PlanetMarkings({
  cx,
  cy,
  mm,
  n,
  capacity,
  cubes,
  numberClass,
  cubeClass,
  cast,
  corner = { x: 1, y: 1 },
}: {
  cx: number;
  cy: number;
  /** SVG units per printed millimetre. */
  mm: number;
  n: number;
  capacity: number;
  cubes: readonly (string | undefined)[];
  numberClass?: string;
  cubeClass?: string;
  /** Cast the cubes' shadows, each with this class (it drops in with its cube). */
  cast?: string;
  corner?: Corner;
}) {
  const at = numberPlacement(n);
  const slot = CUBE_PAD.size * mm;
  const pads = cubePadCentres(capacity, 0, 0);
  // The empty spaces are wells in the planet, drawn by the same code as print, in printed millimetres.
  const wells = pads.flatMap((q, i) => (cubes[i] ? [] : [well(q.x, q.y, CUBE_PAD.size, CUBE_PAD.corner, WELL.cube)])).join('');
  return (
    <>
      <PlanetNumber
        n={n}
        x={cx + corner.x * at.x * mm}
        y={cy + (corner.y * at.y + at.size * 0.4) * mm}
        size={at.size * mm}
        className={numberClass}
      />
      {wells && <g transform={`translate(${cx} ${cy}) scale(${mm})`} dangerouslySetInnerHTML={{ __html: wells }} />}
      {/* All under the cubes: one falls by the next, whose top stands as high, so lit. */}
      {cast && (
        <g opacity={PIECE_SHADOW_OPACITY}>
          {pads.map((q, i) => {
            const colour = cubes[i];
            return colour && <CubeShadow key={i} x={cx + q.x * mm} y={cy + q.y * mm} mm={mm} colour={colour} className={cast} />;
          })}
        </g>
      )}
      {pads.map((q, i) => {
        const colour = cubes[i];
        return (
          colour && (
            <rect
              key={i}
              x={cx + q.x * mm - slot / 2}
              y={cy + q.y * mm - slot / 2}
              width={slot}
              height={slot}
              rx={CUBE_PAD.corner * mm}
              fill={colour}
              stroke="#fff"
              strokeWidth={0.5 * mm}
              className={cubeClass}
              style={cast ? undefined : { filter: `drop-shadow(0 0 ${1.2 * mm}px rgba(255,255,255,.6))` }}
            />
          )
        );
      })}
    </>
  );
}

/**
 * The shadow a cube of `colour` centred on (x, y) casts on the ground (shadows.ts): its rounded footprint swept down
 * and to the right for its height (a cube, so its width). It falls in with its cube, from as far away as the cube
 * falls from (`--away`, the cube's 320%).
 */
function CubeShadow({ x, y, mm, colour, className }: { x: number; y: number; mm: number; colour: string; className: string }) {
  const size = CUBE_PAD.size * mm;
  const far = size * PIECE_SHADOW_LENGTH;
  const { style, ...shape } = castShadow(x - size / 2, y - size / 2, size, CUBE_PAD.corner * mm, far, colour);
  return (
    <polygon
      {...shape}
      className={className}
      style={{ ...style, filter: `blur(${REGOLITH_SHADOW.blur * mm}px)`, '--away': `${3.2 * far}px` } as CSSProperties}
    />
  );
}
