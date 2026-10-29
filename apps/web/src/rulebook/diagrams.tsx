import { createContext, useContext, useId, type ReactNode } from 'react';
import {
  CUBE_PAD,
  TILE,
  cardBackSvg,
  cubePadCentres,
  dataUrl,
  icon,
  numberPlacement,
  mechDie,
  tileSpec,
  tileSvg,
  type CardDeck,
  type World,
} from '@regolith/art';
import { BarrierBubble } from '../components/board/BarrierBubble';
import { PlanetMarkings } from '../components/board/PlanetMarkings';
import { PIPS } from '../components/Die3D';
import { COMBAT_DICE, PIP, PLAYER_COLORS } from '../theme';

/**
 * Building blocks for the manual's diagrams, drawn with the game's own artwork: real hex tiles on a world's
 * ground (packages/art), dice, cubes, barriers and objective numbers styled as on the board (BoardArt, Die3D),
 * so a picture in the manual looks like the screen. Everything is inline SVG or data URLs, so it prints and
 * survives the downloaded HTML.
 *
 * Spaces are the engine's: flat-topped hexes in axial coordinates, `[r, c]` with `c` the column and `r` the
 * axial row (engine board.ts), each column half a hex lower than the one before.
 */

/** One space, flat side to flat side, in SVG units. */
const S = 40;
/** How far a column is from the next, in SVG units. */
const COLUMN = (S * Math.sqrt(3)) / 2;
/** Half a hex's width, corner to corner. */
const HALF_WIDTH = S / Math.sqrt(3);
/** SVG units per printed millimetre: the tile art and board overlays use the printed geometry. */
const MM = S / TILE.cell;
/** The manual's ground: Mars. */
const WORLD: World = 'mars';

export type At = readonly [r: number, c: number];
export type Who = 'you' | 'foe';
/** Mech colours, plus the attack (black) and defence (white) combat dice. */
export type DieKind = Who | 'atk' | 'def';

/** The game's own colours (theme.ts): the first two player colours and the combat dice. */
const COLOURS: Record<DieKind, { face: string; pip: string }> = {
  you: { face: PLAYER_COLORS[0], pip: PIP },
  foe: { face: PLAYER_COLORS[1], pip: PIP },
  atk: { face: COMBAT_DICE.attacker.color, pip: COMBAT_DICE.attacker.pip },
  def: { face: COMBAT_DICE.defender.color, pip: COMBAT_DICE.defender.pip },
};

/** A space's middle, in SVG units. */
const centre = ([r, c]: At) => ({ x: c * COLUMN, y: (r + c / 2) * S });

/** The six steps out of a hex's sides, as the engine has them (board.ts `HEX_SIDES`). */
const SIDES: At[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, 1],
  [1, -1],
];

const same = (a: At, b: At) => a[0] === b[0] && a[1] === b[1];
const has = (list: readonly At[], p: At) => list.some((q) => same(q, p));

/** The six spaces next to one: an objective's perimeter, or a mech's zone of control. */
export const around = ([r, c]: At): At[] => SIDES.map(([dr, dc]) => [r + dr, c + dc]);

/** A hex tile's seven spaces, its middle `at` first. */
export const flower = (at: At): At[] => [at, ...around(at)];

/** The corners of a flat-topped hex `size` tall centred on (x, y), as SVG points. */
const hexPoints = (x: number, y: number, size: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(x + (size / Math.sqrt(3)) * Math.cos(a)).toFixed(2)},${(y + (size / Math.sqrt(3)) * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

const urls = new Map<string, string>();
const cached = (key: string, make: () => string) => {
  let url = urls.get(key);
  if (!url) urls.set(key, (url = make()));
  return url;
};

/** A hex tile's artwork (its ground, the objective's building, the spaces' outlines), cut to its flower, as on the board. */
const tileUrl = (id: string) =>
  cached(`tile:${id}`, () => dataUrl(tileSvg(tileSpec(id), { world: WORLD, rounded: true, markings: 'spaces' })));

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

/** A diagram's canvas: just big enough for the spaces in `cells` plus a margin, scaled to fit its column. */
export function Diagram({
  cells,
  label,
  left = 0,
  scale = 1.3,
  children,
}: {
  cells: readonly At[];
  label: string;
  /** Extra room (SVG units) left of the spaces. */
  left?: number;
  scale?: number;
  children: ReactNode;
}) {
  const id = useSvgId();
  const pad = 4;
  const mids = cells.map(centre);
  const x0 = Math.min(...mids.map((p) => p.x)) - HALF_WIDTH - pad - left;
  const y0 = Math.min(...mids.map((p) => p.y)) - S / 2 - pad;
  const w = Math.max(...mids.map((p) => p.x)) + HALF_WIDTH + pad - x0;
  const h = Math.max(...mids.map((p) => p.y)) + S / 2 + pad - y0;
  return (
    <svg className="mn-svg" viewBox={`${x0} ${y0} ${w} ${h}`} style={{ maxWidth: w * scale }} role="img" aria-label={label}>
      <DieDefs id={id} />
      <Defs.Provider value={id}>{children}</Defs.Provider>
    </svg>
  );
}

/** A canvas of its own size for a drawing that isn't on the map's grid (dice, shots and barriers in a row). */
export function Canvas({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) {
  const id = useSvgId();
  return (
    <svg className="mn-svg" viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: w * 3 }} role="img" aria-label={label}>
      <DieDefs id={id} />
      <Defs.Provider value={id}>{children}</Defs.Provider>
    </svg>
  );
}

// ------------------------------------------------------------------ the map

/** A hex tile (`p8-01`…, `void`, `blank-01`) with its middle space at `at`. */
export function Tile({ id, at }: { id: string; at: At }) {
  const { x, y } = centre(at);
  return <image href={tileUrl(id)} x={x - 1.5 * S} y={y - 1.5 * S} width={3 * S} height={3 * S} />;
}

/** Glowing outlines on the given spaces (an objective's perimeter). */
export function Glow({ cells, tone = 'orbit' }: { cells: readonly At[]; tone?: 'orbit' | 'zone' | 'plain' }) {
  return (
    <g>
      {cells.map((p) => {
        const { x, y } = centre(p);
        return <polygon key={p.join()} className={`mn-${tone}`} points={hexPoints(x, y, S * 0.84)} />;
      })}
    </g>
  );
}

/** An objective's live markings, as the board draws them over the tile: its number and cube spaces. */
export function PlanetMarks({ at, n, cubes = [] }: { at: At; n: number; cubes?: Who[] }) {
  const { x, y } = centre(at);
  return <Marks cx={x} cy={y} n={n} cubes={cubes} mm={MM} />;
}

function Marks({ cx, cy, n, cubes, mm }: { cx: number; cy: number; n: number; cubes: Who[]; mm: number }) {
  return (
    <PlanetMarkings cx={cx} cy={cy} mm={mm} n={n} capacity={n - 6} cubes={cubes.map((w) => COLOURS[w].face)} numberClass="mn-planet-num" />
  );
}

/**
 * An objective on its own: the middle space of its tile, with its building, and its number and cube spaces
 * as on the board.
 */
export function PlanetIcon({ n, size = 34, cubes = [] }: { n: number; size?: number; cubes?: Who[] }) {
  const id = useSvgId();
  const place = numberPlacement(n);
  // Room for the number past the hex, at the vertex below right.
  const right = Math.max(HALF_WIDTH, (place.x + place.halfW) * MM + 1);
  const bottom = Math.max(S / 2, (place.y + place.halfH * 2) * MM + 1);
  const [w, h] = [HALF_WIDTH + right, S / 2 + bottom];
  return (
    <svg
      className="mn-planet-icon"
      width={(size * w) / S}
      height={(size * h) / S}
      viewBox={`${-HALF_WIDTH} ${-S / 2} ${w} ${h}`}
      role="img"
      aria-label={`objective ${n}`}
    >
      <clipPath id={`${id}-hex`}>
        <polygon points={hexPoints(0, 0, S)} />
      </clipPath>
      <image href={tileUrl(`p${n}-01`)} x={-1.5 * S} y={-1.5 * S} width={3 * S} height={3 * S} clipPath={`url(#${id}-hex)`} />
      <Marks cx={0} cy={0} n={n} cubes={cubes} mm={MM} />
    </svg>
  );
}

/** Where an objective's cube space `i` is, in SVG units: its middle and its width. For flying a cube onto it. */
export function cubeSpot(at: At, n: number, i = 0) {
  const { x, y } = centre(at);
  const pad = cubePadCentres(n - 6, 0, 0)[i];
  return { x: x + pad.x * MM, y: y + pad.y * MM, size: CUBE_PAD.size * MM };
}

/** A barrier on a space, as the Wisp fires it (the board's BarrierBubble). */
export function Barrier({ at }: { at: At }) {
  const { x, y } = centre(at);
  return <BarrierBubble r={at[0]} c={at[1]} x={x} y={y} cell={S} mm={MM} cast={false} world={WORLD} />;
}

// ------------------------------------------------------------------ dice and cubes

/** A pip's position on a -1..1 square, from the 3D dice's 3 × 3 grid so the faces match the game's. */
const pipAt = (i: number) => [(i % 3) - 1, Math.floor(i / 3) - 1] as const;

/** A die face centred on (x, y): a coloured player die or a combat die shaded like the game's 3D dice. */
export function DieFace({
  x,
  y,
  v,
  size = S * 0.6,
  kind = 'you',
  ghost,
  dim,
  shipIllustration,
  portrait,
}: {
  x: number;
  y: number;
  v: number;
  size?: number;
  kind?: DieKind;
  ghost?: boolean;
  dim?: boolean;
  shipIllustration?: boolean;
  portrait?: boolean;
}) {
  const defs = useContext(Defs);
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
  if (shipIllustration) {
    // Mechs are drawn as on the player aid: the mech printed on its die face.
    const face = mechDie(v, x, y, size, portrait);
    return <g className={cls} dangerouslySetInnerHTML={{ __html: face.body }} />;
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

/** A mech on a space. */
export function Ship({ at, v, who = 'you', ghost, dim }: { at: At; v: number; who?: Who; ghost?: boolean; dim?: boolean }) {
  const { x, y } = centre(at);
  return <DieFace x={x} y={y} v={v} kind={who} ghost={ghost} dim={dim} />;
}

/** A die as a stand-alone inline icon (for text, tables and the combat sum). */
export function DieIcon({
  v,
  kind = 'you',
  size = 26,
  shipIllustration,
  portrait,
}: {
  v: number;
  kind?: DieKind;
  size?: number;
  shipIllustration?: boolean;
  portrait?: boolean;
}) {
  const id = useSvgId();
  const label = kind === 'atk' ? `attack die ${v}` : kind === 'def' ? `defence die ${v}` : `mech ${v}`;
  return (
    <svg className="mn-die-icon" width={size} height={size} viewBox="0 0 40 40" aria-label={label} role="img">
      <DieDefs id={id} />
      <Defs.Provider value={id}>
        <DieFace x={20} y={20} v={v} size={36} kind={kind} shipIllustration={shipIllustration} portrait={portrait} />
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

/**
 * A dashed route through space middles. `attack` stops it part-way into the last space, with a burst; `shot`
 * draws it as a line of fire, straight and solid.
 */
export function Path({ cells, attack, shot }: { cells: readonly At[]; attack?: boolean; shot?: boolean }) {
  const id = useSvgId();
  const pts = cells.map((p) => {
    const { x, y } = centre(p);
    return [x, y];
  });
  if (attack && pts.length > 1) {
    const [x0, y0] = pts[pts.length - 2];
    const [x1, y1] = pts[pts.length - 1];
    pts[pts.length - 1] = [x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.62];
  }
  // Start at the edge of the first die, not its middle.
  const [ax, ay] = pts[0];
  const [bx, by] = pts[1];
  const len = Math.hypot(bx - ax, by - ay);
  pts[0] = [ax + ((bx - ax) / len) * S * 0.34, ay + ((by - ay) / len) * S * 0.34];
  const [ex, ey] = pts[pts.length - 1];
  return (
    <g>
      <ArrowHead id={id} />
      <polyline
        className={shot ? 'mn-path mn-shot' : 'mn-path'}
        points={pts.map((p) => p.join(',')).join(' ')}
        markerEnd={attack ? undefined : `url(#${id})`}
      />
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

/** A ✓ or ✗ badge at the top right of a space. */
export function Mark({ at, ok }: { at: At; ok: boolean }) {
  const { x: cx, y: cy } = centre(at);
  const x = cx + S * 0.3;
  const y = cy - S * 0.3;
  return (
    <g className={ok ? 'mn-mark mn-ok' : 'mn-mark mn-no'}>
      <circle cx={x} cy={y} r={6.5} />
      <path d={ok ? `M${x - 3},${y} l2,2.2 l4,-4.4` : `M${x - 2.4},${y - 2.4} l4.8,4.8 M${x + 2.4},${y - 2.4} l-4.8,4.8`} />
    </g>
  );
}

/** A small caption inside a diagram, on a space or at (x, y). */
export function Note({ at, x, y, children }: { at?: At; x?: number; y?: number; children: ReactNode }) {
  const p = at ? centre(at) : { x: x!, y: y! };
  return (
    <text className="mn-note" x={p.x} y={p.y} textAnchor="middle">
      {children}
    </text>
  );
}

/** A dot on each space in `cells`. */
export function Dots({ cells }: { cells: readonly At[] }) {
  return (
    <g>
      {cells.map((p) => {
        const { x, y } = centre(p);
        return <circle key={p.join()} className="mn-dot" cx={x} cy={y} r={3.2} />;
      })}
    </g>
  );
}

/**
 * The spaces a mech can reach in up to `steps` steps, each out of a side, staying on `spaces` and not
 * entering `blocked` ones (objectives, mechs, barriers). A space in `stops` (an enemy's zone of control) can
 * be entered but not left.
 */
export function reachable(spaces: readonly At[], from: At, steps: number, blocked: readonly At[], stops: readonly At[] = []): At[] {
  const out: At[] = [];
  let edge: At[] = [from];
  const seen: At[] = [from];
  for (let d = 0; d < steps; d++) {
    const next: At[] = [];
    for (const p of edge)
      for (const q of around(p)) {
        if (!has(spaces, q) || has(blocked, q) || has(seen, q)) continue;
        seen.push(q);
        out.push(q);
        if (!has(stops, q)) next.push(q);
      }
    edge = next;
  }
  return out;
}

/** The spaces in a straight line out of a side of `from`, nearest first, while they're in `spaces`. */
export function line(spaces: readonly At[], from: At, side: number): At[] {
  const [dr, dc] = SIDES[side];
  const out: At[] = [];
  for (let p: At = [from[0] + dr, from[1] + dc]; has(spaces, p); p = [p[0] + dr, p[1] + dc]) out.push(p);
  return out;
}
