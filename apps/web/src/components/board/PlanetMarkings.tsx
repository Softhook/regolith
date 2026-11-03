import { CUBE_PAD, PLANET_FAMILY, WELL, cubePadCentres, numberPlacement, well, type Corner } from '@regolith/art';

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
 * A planet's number as placed and sized on the printed tile, centred on (cx, cy) at `mm` SVG units per printed millimetre.
 * `corner` moves it from the printed bottom right to another corner, as on a tile whose planet is off its middle (art `numberCorner`).
 */
export function PlanetMark({
  cx,
  cy,
  mm,
  n,
  className,
  corner = { x: 1, y: 1 },
}: {
  cx: number;
  cy: number;
  mm: number;
  n: number;
  className?: string;
  corner?: Corner;
}) {
  const at = numberPlacement(n);
  return (
    <PlanetNumber
      n={n}
      x={cx + corner.x * at.x * mm}
      y={cy + (corner.y * at.y + at.size * 0.4) * mm}
      size={at.size * mm}
      className={className}
    />
  );
}

/** The wells of a planet's cube spaces, as on the printed tile: all but the first `cubes`, which have a cube on them. Used by the board and the manual alike. */
export function CubeWells({ cx, cy, mm, capacity, cubes }: { cx: number; cy: number; mm: number; capacity: number; cubes: number }) {
  const wells = cubePadCentres(capacity, 0, 0)
    .flatMap((q, i) => (i < cubes ? [] : [well(q.x, q.y, CUBE_PAD.size, CUBE_PAD.corner, WELL.cube)]))
    .join('');
  return wells ? <g transform={`translate(${cx} ${cy}) scale(${mm})`} dangerouslySetInnerHTML={{ __html: wells }} /> : null;
}
