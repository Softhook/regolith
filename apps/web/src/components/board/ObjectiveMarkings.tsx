import { CUBE_PAD, OBJECTIVE_FAMILY, WELL, cubePadCentres, numberGlyph, numberPlacement, well, type Corner } from '@regolith/art';

/**
 * An objective's number as the tile prints it: white, outlined in a dark shade of the objective's hue, centred on (x, cy).
 * A 9 has a bar under it so it can't be read as an upside-down 6 (art `numberGlyph`).
 */
function ObjectiveNumber({ n, x, cy, size, className }: { n: number; x: number; cy: number; size: number; className?: string }) {
  const { baseline, bar } = numberGlyph(n, x, cy, size);
  const paint = {
    fill: '#fff',
    paintOrder: 'stroke',
    strokeLinejoin: 'round',
    stroke: `hsl(${OBJECTIVE_FAMILY[n].hue} 50% 7%)`,
    strokeWidth: size * 0.13,
  } as const;
  return (
    <g className={className}>
      <text x={x} y={baseline} fontSize={size} fontWeight={800} letterSpacing="-.03em" textAnchor="middle" {...paint}>
        {n}
      </text>
      {bar && <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={bar.rx} {...paint} />}
    </g>
  );
}

/**
 * An objective's number as placed and sized on the printed tile, centred on (cx, cy) at `mm` SVG units per printed millimetre.
 * `corner` moves it from the printed bottom right to another corner, as on a tile whose objective is off its middle (art `numberCorner`).
 */
export function ObjectiveMark({
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
  return <ObjectiveNumber n={n} x={cx + corner.x * at.x * mm} cy={cy + corner.y * at.y * mm} size={at.size * mm} className={className} />;
}

/** The wells of an objective's cube spaces, as on the printed tile: all but the first `cubes`, which have a cube on them. Used by the board and the manual alike. */
export function CubeWells({ cx, cy, mm, capacity, cubes }: { cx: number; cy: number; mm: number; capacity: number; cubes: number }) {
  const wells = cubePadCentres(capacity, 0, 0)
    .flatMap((q, i) => (i < cubes ? [] : [well(q.x, q.y, CUBE_PAD.size, CUBE_PAD.corner, WELL.cube)]))
    .join('');
  return wells ? <g transform={`translate(${cx} ${cy}) scale(${mm})`} dangerouslySetInnerHTML={{ __html: wells }} /> : null;
}
