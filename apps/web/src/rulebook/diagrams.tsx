import { createContext, useContext, useId, type ReactNode } from 'react';
import {
  PLANET_DIAMETER,
  PLANET_FAMILY,
  TILE,
  cardBackSvg,
  dataUrl,
  document,
  icon,
  numberPlacement,
  planet,
  PLAYER_HUES,
  rng,
  shipDie,
  tileSpec,
  tileSvg,
  type CardDeck,
} from '@regolith/art';
import { PlanetMarkings, PlanetNumber } from '../components/board/PlanetMarkings';
import { PIPS } from '../components/Die3D';
import { COMBAT_DICE, PIP, PLAYER_COLORS } from '../theme';

/**
 * Building blocks for the manual's diagrams, drawn with the game's own artwork: real map tiles and
 * planets (packages/art), dice, cubes and planet numbers styled as on the board (BoardArt, Die3D), so
 * a picture in the manual looks like the screen. Everything is inline SVG or data URLs, so it prints
 * and survives the downloaded HTML.
 */

/** One space, in SVG units. */
const S = 40;
/** SVG units per printed millimetre: the tile art and board overlays use the printed geometry. */
const MM = S / TILE.cell;

export type At = readonly [r: number, c: number];
export type Who = 'you' | 'foe';
/** Ship colours, plus the attack (black) and defence (white) combat dice. */
export type DieKind = Who | 'atk' | 'def';

/** The game's own colours (theme.ts): the first two player colours and the combat dice. */
const COLOURS: Record<DieKind, { face: string; pip: string }> = {
  you: { face: PLAYER_COLORS[0], pip: PIP },
  foe: { face: PLAYER_COLORS[1], pip: PIP },
  atk: { face: COMBAT_DICE.attacker.color, pip: COMBAT_DICE.attacker.pip },
  def: { face: COMBAT_DICE.defender.color, pip: COMBAT_DICE.defender.pip },
};

const mid = (n: number) => n * S + S / 2;

const urls = new Map<string, string>();
const cached = (key: string, make: () => string) => {
  let url = urls.get(key);
  if (!url) urls.set(key, (url = make()));
  return url;
};

/** A map tile's artwork (starfield, planet, space pads), as on the board. */
const tileUrl = (id: string) => cached(`tile:${id}`, () => dataUrl(tileSvg(tileSpec(id), { rounded: true, markings: 'spaces' })));

/** A lone planet of a number, with its halo, centred in a square `box` mm wide. */
const planetUrl = (n: number, box: number) =>
  cached(`planet:${n}:${box}`, () =>
    dataUrl(
      document(
        planet({
          rng: rng(`manual-planet-${n}`),
          id: `mp${n}`,
          cx: 0,
          cy: 0,
          r: PLANET_DIAMETER[n] / 2,
          number: n,
          type: PLANET_FAMILY[n].types[0],
        }),
        { x: -box / 2, y: -box / 2, w: box, h: box },
        false,
      ),
    ),
  );

export const cardBackUrl = (deck: CardDeck) => cached(`back:${deck}`, () => dataUrl(cardBackSvg(deck)));

// ------------------------------------------------------------------ shared gradients

/** Each SVG defines its own die shading (ids must be unique on the page); its parts look it up here. */
const Defs = createContext('mn');

function DieDefs({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={`${id}-hi`} cx=".28" cy=".22" r=".6">
        <stop offset="0" stopColor="#fff" stopOpacity=".5" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-dk`} x1="0" y1="0" x2="1" y2="1">
        <stop offset=".3" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".38" />
      </linearGradient>
    </defs>
  );
}

function useSvgId() {
  return `mn${useId().replace(/:/g, '')}`;
}

/** A diagram's canvas: `cols` × `rows` spaces plus a margin, scaled to fit its column. */
export function Diagram({
  rows,
  cols,
  label,
  left = 0,
  scale = 1.3,
  children,
}: {
  rows: number;
  cols: number;
  label: string;
  /** Extra room (SVG units) left of the grid. */
  left?: number;
  scale?: number;
  children: ReactNode;
}) {
  const id = useSvgId();
  const pad = 4;
  const w = cols * S + 2 * pad + left;
  const h = rows * S + 2 * pad;
  return (
    <svg className="mn-svg" viewBox={`${-pad - left} ${-pad} ${w} ${h}`} style={{ maxWidth: w * scale }} role="img" aria-label={label}>
      <DieDefs id={id} />
      <Defs.Provider value={id}>{children}</Defs.Provider>
    </svg>
  );
}

// ------------------------------------------------------------------ the map

/** A 3 × 3 map tile (`p8-01`…) with its top-left space at `at`. */
export function Tile({ id, at = [0, 0] }: { id: string; at?: At }) {
  return <image href={tileUrl(id)} x={at[1] * S} y={at[0] * S} width={3 * S} height={3 * S} />;
}

/** Glowing outlines on the given spaces (a planet's orbit). */
export function Glow({ cells }: { cells: At[] }) {
  const p = TILE.pad * MM;
  return (
    <g>
      {cells.map(([r, c]) => (
        <rect key={`${r},${c}`} className="mn-orbit" x={mid(c) - p / 2} y={mid(r) - p / 2} width={p} height={p} rx={4 * MM} />
      ))}
    </g>
  );
}

/** A planet's live markings, as the board draws them over the tile: its number and cube spaces. */
export function PlanetMarks({ at, n, cubes = [] }: { at: At; n: number; cubes?: Who[] }) {
  return <Marks cx={mid(at[1])} cy={mid(at[0])} n={n} cubes={cubes} mm={MM} />;
}

function Marks({ cx, cy, n, cubes, mm }: { cx: number; cy: number; n: number; cubes: Who[]; mm: number }) {
  return (
    <PlanetMarkings cx={cx} cy={cy} mm={mm} n={n} capacity={n - 6} cubes={cubes.map((w) => COLOURS[w].face)} numberClass="mn-planet-num" />
  );
}

/**
 * A planet on its own, from the real artwork. With `slots` it carries its cube spaces and its number
 * placed as on the tile; as a small symbol in text the number is enlarged so it stays readable.
 */
export function PlanetIcon({ n, size = 34, slots, cubes = [] }: { n: number; size?: number; slots?: boolean; cubes?: Who[] }) {
  const d = PLANET_DIAMETER[n];
  const place = numberPlacement(n);
  const half = slots ? Math.max(d * 0.62, place.x + place.halfW + 1.5, place.y + place.halfH * 2 + 0.5) : d * 0.62;
  const box = 2 * half;
  const px = (size / d) * box;
  const font = d * 0.52;
  return (
    <svg
      className="mn-planet-icon"
      width={px}
      height={px}
      viewBox={`${-half} ${-half} ${box} ${box}`}
      role="img"
      aria-label={`planet ${n}`}
    >
      <image href={planetUrl(n, box)} x={-half} y={-half} width={box} height={box} />
      {slots ? (
        <Marks cx={0} cy={0} n={n} cubes={cubes} mm={1} />
      ) : (
        <PlanetNumber n={n} x={d * 0.3} y={d * 0.3 + font * 0.36} size={font} className="mn-planet-num" />
      )}
    </svg>
  );
}

// ------------------------------------------------------------------ dice and cubes

/** A pip's position on a -1..1 square, from the 3D dice's 3 × 3 grid so the faces match the game's. */
const pipAt = (i: number) => [(i % 3) - 1, Math.floor(i / 3) - 1] as const;

/** A die face centred on (x, y): a coloured player die or a combat die shaded like the game's 3D dice. */
export function DieFace({
  x,
  y,
  v,
  size = S * 0.66,
  kind = 'you',
  ghost,
  dim,
  shipIllustration,
}: {
  x: number;
  y: number;
  v: number;
  size?: number;
  kind?: DieKind;
  ghost?: boolean;
  dim?: boolean;
  shipIllustration?: boolean;
}) {
  const defs = useContext(Defs);
  const id = useSvgId();
  const h = size / 2;
  const step = size * 0.27;
  const rx = size * 0.16;
  const cls = dim ? 'mn-die mn-dim' : 'mn-die';
  if (ghost)
    return (
      <g className="mn-ghost">
        <rect x={x - h} y={y - h} width={size} height={size} rx={rx} />
        {PIPS[v].map(pipAt).map(([px, py], i) => (
          <circle key={i} cx={x + px * step} cy={y + py * step} r={size * 0.075} />
        ))}
      </g>
    );
  if (shipIllustration && (kind === 'you' || kind === 'foe')) {
    // Ships are drawn as on the player aid: the starship as a hologram on its die face, in the player's colour.
    const ship = shipDie(id, v, x, y, size, PLAYER_HUES[kind === 'you' ? 0 : 1]);
    return <g className={cls} dangerouslySetInnerHTML={{ __html: `<defs>${ship.defs}</defs>${ship.body}` }} />;
  }
  const { face, pip } = COLOURS[kind];
  return (
    <g className={cls}>
      {[face, `url(#${defs}-dk)`, `url(#${defs}-hi)`].map((fill) => (
        <rect key={fill} x={x - h} y={y - h} width={size} height={size} rx={rx} fill={fill} />
      ))}
      <rect x={x - h + 0.5} y={y - h + 0.5} width={size - 1} height={size - 1} rx={rx} fill="none" stroke="rgba(255,255,255,.22)" />
      {PIPS[v].map(pipAt).map(([px, py], i) => (
        <circle key={i} cx={x + px * step} cy={y + py * step} r={size * 0.085} fill={pip} />
      ))}
    </g>
  );
}

/** A ship on a space. */
export function Ship({ at, v, who = 'you', ghost, dim }: { at: At; v: number; who?: Who; ghost?: boolean; dim?: boolean }) {
  return <DieFace x={mid(at[1])} y={mid(at[0])} v={v} kind={who} ghost={ghost} dim={dim} />;
}

/** A die as a stand-alone inline icon (for text, tables and the combat sum). */
export function DieIcon({
  v,
  kind = 'you',
  size = 26,
  shipIllustration,
}: {
  v: number;
  kind?: DieKind;
  size?: number;
  shipIllustration?: boolean;
}) {
  const id = useSvgId();
  const label = kind === 'atk' ? `attack die ${v}` : kind === 'def' ? `defence die ${v}` : `ship ${v}`;
  return (
    <svg className="mn-die-icon" width={size} height={size} viewBox="0 0 40 40" aria-label={label} role="img">
      <DieDefs id={id} />
      <Defs.Provider value={id}>
        <DieFace x={20} y={20} v={v} size={36} kind={kind} shipIllustration={shipIllustration} />
      </Defs.Provider>
    </svg>
  );
}

/** A cube as the board shows it: a rounded square in the player's colour; `empty` is a free cube space. */
export function CubeIcon({ empty, size = 22 }: { empty?: boolean; size?: number }) {
  return (
    <svg className={empty ? 'mn-cube-icon empty' : 'mn-cube-icon'} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x={3} y={3} width={18} height={18} rx={4} fill={empty ? 'none' : COLOURS.you.face} />
    </svg>
  );
}

/** One of the game's line icons (packages/art icons.ts). */
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      className="mn-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon(name, 12, 12, 24, 'currentColor') }}
    />
  );
}

// ------------------------------------------------------------------ marks drawn over the map

function ArrowHead({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" className="mn-arrowhead" />
      </marker>
    </defs>
  );
}

/** A dashed route through space centres. `attack` stops it part-way into the last space, with a burst. */
export function Path({ cells, attack }: { cells: At[]; attack?: boolean }) {
  const id = useSvgId();
  const pts = cells.map(([r, c]) => [mid(c), mid(r)]);
  if (attack && pts.length > 1) {
    const [x0, y0] = pts[pts.length - 2];
    const [x1, y1] = pts[pts.length - 1];
    pts[pts.length - 1] = [x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.62];
  }
  // Start at the edge of the first die, not its middle.
  const [ax, ay] = pts[0];
  const [bx, by] = pts[1];
  const len = Math.hypot(bx - ax, by - ay);
  pts[0] = [ax + ((bx - ax) / len) * S * 0.36, ay + ((by - ay) / len) * S * 0.36];
  const [ex, ey] = pts[pts.length - 1];
  return (
    <g>
      <ArrowHead id={id} />
      <polyline className="mn-path" points={pts.map((p) => p.join(',')).join(' ')} markerEnd={attack ? undefined : `url(#${id})`} />
      {attack && <Burst x={ex} y={ey} />}
    </g>
  );
}

/** A plain curved arrow from (x1, y1) to (x2, y2). */
export function Arrow({ x1, y1, x2, y2, curve = 0 }: { x1: number; y1: number; x2: number; y2: number; curve?: number }) {
  const id = useSvgId();
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - curve;
  return (
    <g>
      <ArrowHead id={id} />
      <path className="mn-path" d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} markerEnd={`url(#${id})`} />
    </g>
  );
}

/** The flash where an attacker hits its target. */
function Burst({ x, y }: { x: number; y: number }) {
  const r = 9;
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${x + Math.cos(a) * rr},${y + Math.sin(a) * rr}`);
  }
  return <polygon className="mn-burst" points={pts.join(' ')} />;
}

/** A ✓ or ✗ badge at the top-right corner of a space. */
export function Mark({ at, ok }: { at: At; ok: boolean }) {
  const x = at[1] * S + S - 7;
  const y = at[0] * S + 7;
  return (
    <g className={ok ? 'mn-mark mn-ok' : 'mn-mark mn-no'}>
      <circle cx={x} cy={y} r={6.5} />
      <path d={ok ? `M${x - 3},${y} l2,2.2 l4,-4.4` : `M${x - 2.4},${y - 2.4} l4.8,4.8 M${x + 2.4},${y - 2.4} l-4.8,4.8`} />
    </g>
  );
}

/** A small caption inside a diagram. */
export function Note({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text className="mn-note" x={x} y={y} textAnchor="middle">
      {children}
    </text>
  );
}

/** A dot on each space in `cells`. */
export function Dots({ cells }: { cells: At[] }) {
  return (
    <g>
      {cells.map(([r, c]) => (
        <circle key={`${r},${c}`} className="mn-dot" cx={mid(c)} cy={mid(r)} r={3.2} />
      ))}
    </g>
  );
}

/** Spaces a ship can reach in up to `steps` orthogonal steps, not through `blocked` spaces. */
export function reachable(rows: number, cols: number, from: At, steps: number, blocked: At[]): At[] {
  const key = (r: number, c: number) => r * cols + c;
  const block = new Set(blocked.map(([r, c]) => key(r, c)));
  const dist = new Map<number, number>([[key(from[0], from[1]), 0]]);
  const queue: At[] = [from];
  const out: At[] = [];
  while (queue.length) {
    const [r, c] = queue.shift()!;
    const d = dist.get(key(r, c))!;
    if (d === steps) continue;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || block.has(key(nr, nc)) || dist.has(key(nr, nc))) continue;
      dist.set(key(nr, nc), d + 1);
      out.push([nr, nc]);
      queue.push([nr, nc]);
    }
  }
  return out;
}
