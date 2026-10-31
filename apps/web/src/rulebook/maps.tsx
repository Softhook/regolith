import type { ReactNode } from 'react';
import { BLANK, HEX_TILE_CUT, OBJECTIVE_NAMES, TILE, WORLD_NAMES, hexTileShape, type MapSheetMark, type MapSheetTile } from '@regolith/art';
import { MAPS, defaultMap, type MapDef } from '@regolith/engine';
import { mapSheet } from '../art/mapSheet';

/**
 * The manual's Maps section: every map as its setup sheet draws it (art `mapSheetSvg`, from the same `mapSheet`),
 * redrawn in the manual's colours so it reads on paper and in the dark dialog, with what to lay out for it.
 */

/** One space, in SVG units. */
const U = 10;
/** Tile millimetres (art geometry) to SVG units, about a tile's middle. */
const K = U / TILE.cell;
const MID = TILE.size / 2;

const LENGTHS: Record<NonNullable<MapDef['length']>, string> = { short: 'Short', medium: 'Medium', long: 'Long' };
/** Tiles in the order the list names them: objectives by size, then Alien Artefacts and blank ground. */
const TILE_ORDER = [7, 8, 9, 10, 0, BLANK];
const tileName = (n: number) => (n === BLANK ? 'Blank' : OBJECTIVE_NAMES[n]);

const fillOf = (n: number) => (n === BLANK ? 'mn-mt-blank' : n === 0 ? 'mn-mt-sink' : 'mn-mt-obj');

function Objective({ x, y, number, start }: { x: number; y: number; number: number; start: boolean }) {
  return (
    <g className={start ? 'mn-mo start' : 'mn-mo'}>
      <circle cx={x} cy={y} r={U * 0.46} />
      {number > 0 && (
        <text x={x} y={y} dy=".36em">
          {number}
        </text>
      )}
    </g>
  );
}

function Mark({ x, y, kind, r = U * 0.3 }: { x: number; y: number; kind: MapSheetMark['kind']; r?: number }) {
  if (kind === 'barrier')
    return (
      <g className="mn-mk barrier">
        <circle cx={x} cy={y} r={r} />
        <path
          d={`M${x - r * 0.6},${y - r * 0.6}L${x + r * 0.6},${y + r * 0.6}M${x - r * 0.6},${y + r * 0.6}L${x + r * 0.6},${y - r * 0.6}`}
        />
      </g>
    );
  return (
    <g className={`mn-mk ${kind}`}>
      <circle cx={x} cy={y} r={r} />
      <circle cx={x} cy={y} r={r * 0.45} className={kind === 'tunnel' ? 'core' : undefined} />
    </g>
  );
}

/** A tile's seven spaces and its outline, its middle at (x, y) in spaces. */
function TileShape({ t }: { t: MapSheetTile }) {
  const at = (x: number, y: number) => `${(t.x * U + (x - MID) * K).toFixed(2)},${(t.y * U + (y - MID) * K).toFixed(2)}`;
  return (
    <g className={fillOf(t.number)}>
      {hexTileShape().map((hex, i) => (
        <polygon key={i} points={hex.map((p) => at(p.x, p.y)).join(' ')} />
      ))}
      <path className="mn-mt-edge" d={HEX_TILE_CUT.map(([x1, y1, x2, y2]) => `M${at(x1, y1)}L${at(x2, y2)}`).join('')} />
    </g>
  );
}

function MapDrawing({ sheet }: { sheet: ReturnType<typeof mapSheet> }) {
  const marks = sheet.marks ?? [];
  const pad = U * 0.2;
  return (
    <svg
      className="mn-mapsvg"
      viewBox={`${-pad} ${-pad} ${sheet.cols * U + 2 * pad} ${sheet.rows * U + 2 * pad}`}
      role="img"
      aria-label={`${sheet.name}: ${sheet.tiles.length} tiles`}
    >
      {sheet.tiles.map((t, i) => (
        <TileShape key={i} t={t} />
      ))}
      {sheet.tiles.map(
        (t, i) => t.number > 0 && <Objective key={i} x={(t.x + t.at.x) * U} y={(t.y + t.at.y) * U} number={t.number} start={t.start} />,
      )}
      {(['tunnel', 'wormhole'] as const).map((kind) => {
        const pair = marks.filter((m) => m.kind === kind);
        return (
          pair.length === 2 && (
            <path key={kind} className={`mn-mk-link ${kind}`} d={`M${pair[0].x * U},${pair[0].y * U}L${pair[1].x * U},${pair[1].y * U}`} />
          )
        );
      })}
      {marks.map((m, i) => (
        <Mark key={i} x={m.x * U} y={m.y * U} kind={m.kind} />
      ))}
    </svg>
  );
}

/** What a map starts with on the ground, in words, or nothing. */
function groundNote(marks: readonly MapSheetMark[]): string | undefined {
  const count = (kind: MapSheetMark['kind']) => marks.filter((m) => m.kind === kind).length;
  const barriers = count('barrier');
  const parts = [
    count('tunnel') && 'an Ice Tunnel',
    count('wormhole') && 'a wormhole',
    barriers && `${barriers} barrier${barriers > 1 ? 's' : ''}`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

function MapCard({ map }: { map: MapDef }) {
  const sheet = mapSheet(map);
  const counts = TILE_ORDER.map((n) => [n, sheet.tiles.filter((t) => t.number === n).length] as const).filter(([, k]) => k);
  const ground = groundNote(sheet.marks ?? []);
  return (
    // A wide map takes two columns, to be drawn as large as the others.
    <div className={sheet.cols > sheet.rows * 1.6 ? 'mn-mapcard mn-wide' : 'mn-mapcard'}>
      <header>
        <h4>{map.name}</h4>
        {defaultMap(map.players) === map && <span className="mn-tag">Basic</span>}
        {map.length && <span className="mn-tag">{LENGTHS[map.length]}</span>}
      </header>
      <MapDrawing sheet={sheet} />
      <dl>
        <dt>Cubes</dt>
        <dd>
          <b>{map.cubes}</b> each
        </dd>
        <dt>Tiles</dt>
        <dd>
          {sheet.tiles.length}, on {WORLD_NAMES[sheet.world]}:{' '}
          {counts.map(([n, k], i) => (
            <span key={n}>
              {i > 0 && ' · '}
              {tileName(n)} ×{k}
            </span>
          ))}
        </dd>
        {ground && (
          <>
            <dt>Starts with</dt>
            <dd>{ground}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** A legend's swatch: a tile's hex or a mark, in a small square. */
function Swatch({ children }: { children: ReactNode }) {
  return (
    <svg className="mn-swatch" viewBox={`${-U / 2} ${-U / 2} ${U} ${U}`} aria-hidden>
      {children}
    </svg>
  );
}

const HEX = Array.from({ length: 6 }, (_, i) => `${0.46 * U * Math.cos((Math.PI / 3) * i)},${0.46 * U * Math.sin((Math.PI / 3) * i)}`).join(
  ' ',
);
/** A tile's hex, filled as `fill` (a `fillOf` class). */
const hexSwatch = (fill: string) => (
  <g className={fill}>
    <polygon points={HEX} />
  </g>
);

function MapLegend() {
  const keys: [ReactNode, string][] = [
    [<Objective x={0} y={0} number={0} start={false} />, 'Objective, on its space'],
    [<Objective x={0} y={0} number={0} start />, 'Starting objective'],
    [hexSwatch(fillOf(0)), 'Alien Artefact'],
    [hexSwatch(fillOf(BLANK)), 'Blank ground'],
    [<Mark x={0} y={0} kind="tunnel" r={U * 0.36} />, 'Ice Tunnel'],
    [<Mark x={0} y={0} kind="wormhole" r={U * 0.36} />, 'Wormhole'],
    [<Mark x={0} y={0} kind="barrier" r={U * 0.36} />, 'Barrier'],
  ];
  return (
    <ul className="mn-maplegend">
      {keys.map(([draw, label]) => (
        <li key={label}>
          <Swatch>{draw}</Swatch>
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Every map, by player count, in data/maps.yaml's order (the basic map first). */
export function MapList() {
  const counts = [...new Set(MAPS.map((m) => m.players))].sort((a, b) => a - b);
  return (
    <>
      <MapLegend />
      {counts.map((n) => (
        <div key={n} className="mn-mapgroup">
          <h3>{n} players</h3>
          <div className="mn-maps">
            {MAPS.filter((m) => m.players === n).map((m) => (
              <MapCard key={m.id} map={m} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
