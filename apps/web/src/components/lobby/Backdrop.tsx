import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildBoard, type Board, type MapDef } from '@regolith/engine';
import { GROUND_BASE, RASTER_AREA, TILE, hash, type World } from '@regolith/art';
import { decodedTileImage, type TileRef } from '../../art/tileImages';
import { tileArt } from '../../art/boardTiles';
import { hexCorners } from '../board/geometry';
import { PHONE, REDUCED_MOTION, useMediaQuery } from '../../game/useMediaQuery';

/**
 * Behind the lobby: a close look at the chosen map's world, its ground drifting slowly past as if from a low
 * orbit. The ground is the game's own tiles laid edge to edge, as hex tiles fit together: mostly its blank tiles,
 * with the chosen map's tiles among them now and then. They're the images the game draws them from (tileImages),
 * so what the lobby draws is ready, and stored, for the game; and each is drawn once, however often it shows.
 * Purely decoration: hidden from screen readers, and still under reduced motion.
 *
 * Kept light for phones: the ground is one layer, moved by its transform alone; only the tiles near the screen
 * are on it, and they change only as a tile comes into view or goes.
 */

/** How large a space is drawn, px: close up (smaller on a phone). */
const CELL = 140;
const PHONE_CELL = 100;
/** How fast the ground drifts, px a second: which way is chosen afresh each time the ground is laid. */
const SPEED = 16;
const PHONE_SPEED = 11;
/** The blank tiles (art `TILE_SET`), and how many of the tiles laid are the chosen map's instead. */
const BLANKS: TileRef[] = Array.from({ length: 10 }, (_, i) => ({ id: `blank-${String(i + 1).padStart(2, '0')}`, at: { x: 0, y: 0 } }));
const MAP_SHARE = 1 / 12;
/**
 * A flower's six neighbours are a step of the lattice away, ±(1, 0), ±(0, 1) or ±(1, −1) (below), so (i − j) mod 3
 * sorts the flowers into three sets, none touching another of its own. Each tile is laid only in one set, by its
 * place in its list, so no tile is laid next to a copy of itself.
 */
const SETS = [0, 1, 2];
const setOf = (i: number, j: number) => (((i - j) % 3) + 3) % 3;
const inSets = (tiles: TileRef[]) => SETS.map((s) => tiles.filter((_, k) => k % 3 === s));
const BLANK_SETS = inSets(BLANKS);

/**
 * Where the tiles go, in spaces: the middles of 7-hex flowers fitted together, two steps of the lattice they make
 * (engine `drawing`: a column √3/2 of a space across, each a half space lower than the last).
 */
const STEP_A = { x: Math.sqrt(3), y: 2 };
const STEP_B = { x: -Math.sqrt(3) / 2, y: 2.5 };
const DET = STEP_A.x * STEP_B.y - STEP_B.x * STEP_A.y;
/** How far a tile's art reaches from its middle, in spaces: its bleed past the flower, and some. */
const REACH = 2;
/** A flower's hexes round its middle, in spaces. */
const FLOWER = [
  [0, 0],
  [0, -1],
  [0, 1],
  [Math.sqrt(3) / 2, -0.5],
  [Math.sqrt(3) / 2, 0.5],
  [-Math.sqrt(3) / 2, -0.5],
  [-Math.sqrt(3) / 2, 0.5],
];

/** The tiles in view of the screen moved by (ox, oy) px, by the lattice's steps: a range of each. */
function inView(ox: number, oy: number, w: number, h: number, cell: number) {
  const corners = [
    [ox, oy],
    [ox + w, oy],
    [ox, oy + h],
    [ox + w, oy + h],
  ].map(([x, y]) => [x / cell, y / cell]);
  // A point's place in steps: the lattice's inverse.
  const steps = corners.map(([x, y]) => [(x * STEP_B.y - y * STEP_B.x) / DET, (STEP_A.x * y - STEP_A.y * x) / DET]);
  const pad = REACH / 2;
  const range = (k: 0 | 1) => [Math.floor(Math.min(...steps.map((s) => s[k])) - pad), Math.ceil(Math.max(...steps.map((s) => s[k])) + pad)];
  const [[i0, i1], [j0, j1]] = [range(0), range(1)];
  return { i0, i1, j0, j1 };
}

function Ground({ board, cell, speed, still, paused }: { board: Board; cell: number; speed: number; still: boolean; paused: boolean }) {
  const world = board.world;
  const mapSets = useMemo(() => inSets(tileArt(board).filter((t) => !t.id.startsWith('blank'))), [board]);
  /** The tile laid at (i, j): the same each time it comes round. A map with fewer than three tiles leaves a set blanks only. */
  const tileAt = (i: number, j: number): TileRef => {
    const h = hash(`${i},${j}`) >>> 0;
    const [mapTiles, blanks] = [mapSets[setOf(i, j)], BLANK_SETS[setOf(i, j)]];
    return mapTiles.length && (h % 1000) / 1000 < MAP_SHARE ? mapTiles[(h >>> 10) % mapTiles.length] : blanks[(h >>> 10) % blanks.length];
  };

  const drift = useRef<HTMLDivElement>(null);
  const [view, setView] = useState(() => inView(0, 0, innerWidth, innerHeight, cell));
  const shown = useRef(view);
  const [heading] = useState(() => Math.random() * 2 * Math.PI);
  /** How far the ground has drifted, px: kept through a pause, so it goes on from there. */
  const drifted = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const [vx, vy] = [speed * Math.cos(heading), speed * Math.sin(heading)];
    const at = drifted.current;
    let last = performance.now();
    let frame = 0;
    const place = () => {
      if (drift.current) drift.current.style.transform = `translate3d(${-at.x}px, ${-at.y}px, 0)`;
      const next = inView(at.x, at.y, innerWidth, innerHeight, cell);
      const v = shown.current;
      if (v.i0 !== next.i0 || v.i1 !== next.i1 || v.j0 !== next.j0 || v.j1 !== next.j1) setView((shown.current = next));
    };
    const tick = (now: number) => {
      // Not catching up after the tab was away.
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      at.x += vx * dt;
      at.y += vy * dt;
      place();
      frame = requestAnimationFrame(tick);
    };
    place();
    // Under reduced motion, the ground stays put; and while paused.
    if (!still && !paused) frame = requestAnimationFrame(tick);
    addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('resize', place);
    };
  }, [cell, speed, still, paused, heading]);

  const laid: { key: string; x: number; y: number; tile: TileRef }[] = [];
  for (let i = view.i0; i <= view.i1; i++)
    for (let j = view.j0; j <= view.j1; j++)
      laid.push({ key: `${i},${j}`, x: (i * STEP_A.x + j * STEP_B.x) * cell, y: (i * STEP_A.y + j * STEP_B.y) * cell, tile: tileAt(i, j) });
  // The middle of the screen's tiles asked for first, as they're drawn in turn: before each tile asks for its own
  // (layout effects run before effects). Asked for here, not laid in this order: React would move the tiles
  // already on the ground to reorder them, and moved, each would fade in again.
  useLayoutEffect(() => {
    const [mx, my] = [
      ((view.i0 + view.i1) / 2) * STEP_A.x + ((view.j0 + view.j1) / 2) * STEP_B.x,
      ((view.i0 + view.i1) / 2) * STEP_A.y + ((view.j0 + view.j1) / 2) * STEP_B.y,
    ];
    const away = (t: { x: number; y: number }) => Math.hypot(t.x / cell - mx, t.y / cell - my);
    for (const t of [...laid].sort((a, b) => away(a) - away(b))) decodedTileImage(t.tile, world, 'ground').catch(() => {});
  });

  return (
    <div ref={drift} className="lobby-ground">
      <svg>
        <defs>
          {/* The flower's hexes a touch larger, so no hairline shows between them (as MapTiles clips them). */}
          <clipPath id="lobby-flower">
            {FLOWER.map(([x, y]) => (
              <polygon key={`${x},${y}`} points={hexCorners(x * cell, y * cell, cell * 1.01).join(' ')} />
            ))}
          </clipPath>
        </defs>
        {laid.map((t) => (
          <Laid key={t.key} x={t.x} y={t.y} tile={t.tile} world={world} cell={cell} />
        ))}
      </svg>
    </div>
  );
}

/** A flower's hexes as one path of outlines, sides shared between them drawn twice. */
const flowerOutline = (cell: number) =>
  FLOWER.map(
    ([x, y]) =>
      `M${hexCorners(x * cell, y * cell, cell)
        .map(([cx, cy]) => `${cx.toFixed(1)},${cy.toFixed(1)}`)
        .join('L')}Z`,
  ).join('');

/**
 * A tile on the ground, middle at (x, y): its ground image (art `RASTER_AREA`) once drawn, clipped to its hexes.
 * Until then its hexes show as thin black outlines over the world's colour, so there's something to look at while
 * tiles are drawn; the image fades in over them, and they're dropped once it has.
 */
const Laid = memo(function Laid({ x, y, tile, world, cell }: { x: number; y: number; tile: TileRef; world: World; cell: number }) {
  const [url, setUrl] = useState<string>();
  const [covered, setCovered] = useState(false);
  const outline = useMemo(() => flowerOutline(cell), [cell]);
  useEffect(() => {
    if (!url) return;
    const t = setTimeout(() => setCovered(true), 1400);
    return () => clearTimeout(t);
  }, [url]);
  useEffect(() => {
    let live = true;
    decodedTileImage(tile, world, 'ground').then(
      (u) => live && setUrl(u),
      (e: unknown) => console.error(e),
    );
    return () => {
      live = false;
    };
  }, [tile, world]);
  // A tile's artwork is a whole printed tile, 3 spaces wide, centred on its middle.
  const px = (v: number) => (v * 3 * cell) / TILE.size;
  const area = RASTER_AREA.ground;
  return (
    <g transform={`translate(${x} ${y})`}>
      {!covered && <path className="lobby-grid" d={outline} />}
      {url && (
        <g clipPath="url(#lobby-flower)">
          <image href={url} x={px(area.x - TILE.size / 2)} y={px(area.y - TILE.size / 2)} width={px(area.w)} height={px(area.h)} />
        </g>
      )}
    </g>
  );
});

/**
 * `paused`: the ground holds still where it is, with something over it (the tutorial). Mostly hidden there, its
 * drifting cost frames the tutorial needs: on a large high-density screen, about a third of those it dropped.
 */
export function LobbyBackdrop({ map, paused = false }: { map: MapDef; paused?: boolean }) {
  const still = useMediaQuery(REDUCED_MOTION);
  const phone = useMediaQuery(PHONE);
  const board = useMemo(() => buildBoard(map), [map]);
  return (
    <div className="lobby-backdrop" style={{ background: GROUND_BASE[board.world] }} aria-hidden="true">
      {/* Keyed by world: a new world's ground fades in. */}
      <Ground
        key={`${board.world}:${phone}:${still}`}
        board={board}
        cell={phone ? PHONE_CELL : CELL}
        speed={phone ? PHONE_SPEED : SPEED}
        still={still}
        paused={paused}
      />
      <div className="backdrop-shade" />
    </div>
  );
}
