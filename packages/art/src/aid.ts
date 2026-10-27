import { estimateWidth, type Measure } from './card';
import { icon } from './icons';
import { poly } from './kit/effects';
import { shipDie } from './kit/starships';
import { rng } from './rng';
import { starfield } from './starfield';
import { document, esc, hsl, n } from './svg';
import { ACTION_HUE, CUBE_PAD, DOMINANCE, FONTS, INK, RESEARCH, TILE } from './tokens';

/**
 * The player aid: an A6 board, landscape, the same for every player. Down the left edge, a rail of
 * seven cube pads holds the player's cubes, with the win condition beside it; then the two pads for
 * the dominance and research dice (19 mm), and between them the five actions; along the bottom,
 * the six ships on their die faces with what each can do.
 *
 * Kept deliberately quiet: a dim starfield for ground, one accent colour (actions take the cards' yellow), no boxes.
 * The ship dice are the largest thing on it, then the die pads, then the actions. No text is smaller than `MIN_TEXT`.
 */

export const AID = {
  /** A6 landscape. */
  w: 148,
  h: 105,
  bleed: 3,
  /** Outer margin: text and pads stay this far inside the trim. */
  safe: 6,
} as const;

/** The smallest text on the aid, mm (2 mm ≈ 5.7 pt), so it reads at arm's length on the table. */
export const MIN_TEXT = 2;

export type AidEdition = 'community' | 'classic';

export interface AidOptions {
  /** Community Edition or Classic (the 2013 rules) wording. */
  edition?: AidEdition;
  /** Add the bleed around the trim. */
  bleed?: boolean;
  /** Text widths with the embedded fonts; estimated when absent. */
  measure?: Measure;
  /** `@font-face` rules to embed. */
  fontCss?: string;
  idPrefix?: string;
}

// ---------------------------------------------------------------------------
// What it says

/** What each ship can do, in one short two-line phrase. */
const SHIPS: { value: number; text: [string, string] }[] = [
  { value: 1, text: ['Free attack on', 'a ship next to it'] },
  { value: 2, text: ['Carry a ship', 'as it moves'] },
  { value: 3, text: ['Swap with any', 'of your ships'] },
  { value: 4, text: ['Turn to 3 or 5', 'without rolling'] },
  { value: 5, text: ['Move and attack', 'diagonally'] },
  { value: 6, text: ['Free re-roll,', 'no action'] },
];

const actions = (edition: AidEdition): { name: string; cost: number; text: string }[] => [
  { name: 'Conquer', cost: 2, text: 'Your orbiting ships sum to exactly the planet' },
  { name: 'Deploy', cost: 1, text: 'Scrapyard ship to an orbit of your cube' },
  { name: 'Move / Attack', cost: 1, text: 'Up to the ship’s value; attack ends it' },
  {
    name: 'Reconfigure',
    cost: 1,
    text: edition === 'community' ? 'Re-roll to a value not seen this turn' : 'Re-roll a ship to a new value',
  },
  { name: 'Research', cost: 1, text: '+1 research' },
];

const rules = (edition: AidEdition): [label: string, text: string][] => [
  ['Combat', 'Die + ship value: lower wins, ties to attacker'],
  edition === 'community' ? ['Missile', 'Any time: one combat roll becomes 1'] : ['Defeat', 'The ship is re-rolled into the scrapyard'],
  ['Ships', 'Each: one move and one ability a turn'],
  ['Cards', 'At turn end: 1 per conquest · 1 at research 6'],
];

// ---------------------------------------------------------------------------
// Type

type Font = 'title' | 'body' | 'bold';

interface TextStyle {
  font?: Font;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  /** Letter spacing, as a fraction of the size. */
  track?: number;
  upper?: boolean;
}

function text(x: number, y: number, s: string, size: number, o: TextStyle = {}): string {
  const font = o.font ?? 'body';
  return (
    `<text x="${n(x)}" y="${n(y)}" font-family="${font === 'title' ? FONTS.title : FONTS.body}" font-weight="${font === 'title' ? 900 : font === 'bold' ? 700 : 400}" font-size="${n(size)}" fill="${o.fill ?? '#fff'}"` +
    (o.anchor && o.anchor !== 'start' ? ` text-anchor="${o.anchor}"` : '') +
    (o.track ? ` letter-spacing="${n(size * o.track)}"` : '') +
    `>${esc(o.upper ? s.toUpperCase() : s)}</text>`
  );
}

/** One line that shrinks to fit `width`, but never below `MIN_TEXT`. */
function line(x: number, y: number, s: string, size: number, width: number, measure: Measure, o: TextStyle = {}) {
  const shown = o.upper ? s.toUpperCase() : s;
  const w = measure(shown, 1, o.font ?? 'body') + shown.length * (o.track ?? 0);
  return text(x, y, s, Math.max(MIN_TEXT, Math.min(size, width / w)), o);
}

// ---------------------------------------------------------------------------
// The board

/** The board's ground (the press test shows the pads on it). */
export const GROUND = hsl(228, 40, 8);
const WHITE = hsl(220, 30, 96);
const MUTED = hsl(224, 18, 74);
const HAIR = hsl(224, 20, 30);
/** The quiet fill of every pad on the aid: cubes and dice. */
const PAD = hsl(228, 32, 12);
/** The one accent: the game's own cyan, the same for every player. */
const HUE = 194;

/** One action: a yellow hexagon with the action bolt, as on the cards (`glow` is its soft halo's gradient id). */
function hex(cx: number, cy: number, r: number, glow: string): string {
  return (
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.8)}" fill="url(#${glow})"/><path d="${poly(cx, cy, r)}" fill="${hsl(ACTION_HUE, 95, 58)}"/>` +
    icon('action', cx, cy, r * 1.2, INK, 2.8)
  );
}

/** A die pad: where the dominance or research die sits, the 24 mm of a tile's space (a 19 mm die with room round it). */
export function diePad(cx: number, cy: number, hue: number, kind: 'dominance' | 'research'): string {
  const s = TILE.pad;
  return (
    `<rect x="${n(cx - s / 2)}" y="${n(cy - s / 2)}" width="${s}" height="${s}" rx="3.6" fill="${PAD}" stroke="${hsl(hue, 80, 62)}" stroke-width=".4"/>` +
    icon(kind, cx, cy, 7, hsl(hue, 60, 40), 1.5)
  );
}

/** A cube pad on the rail, from its top left: the planets' cube pad in the die pads' quiet fill. */
export const cubePad = (x: number, y: number) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${CUBE_PAD.size}" height="${CUBE_PAD.size}" rx="${CUBE_PAD.corner}" fill="${PAD}" stroke="${hsl(224, 20, 52)}" stroke-width=".3"/>`;

/** Where the text sits, [x0, y0, x1, y1] mm from the trim's top left: no faint stars there. */
const TEXT: [number, number, number, number][] = [
  [13, 5, 22, 100],
  [21, 5, 51, 10],
  [21, 36, 51, 61],
  [53, 5, 114, 68],
  [113, 5, 144, 10],
  [113, 36, 144, 61],
  [21, 90, 147, 100],
];

/** The most cubes any map gives a player. */
const MAX_CUBES = 7;

/** The player aid as a standalone SVG document. */
export function playerAidSvg(o: AidOptions = {}): string {
  const edition = o.edition ?? 'community';
  const measure = o.measure ?? estimateWidth;
  const id = o.idPrefix ?? `aid-${edition}`;
  const { w: W, h: H, safe: M, bleed: B } = AID;
  const b = o.bleed ? B : 0;
  const full = { x: -B, y: -B, w: W + 2 * B, h: H + 2 * B };
  const defs: string[] = [];
  const out: string[] = [];
  const accent = hsl(HUE, 90, 66);

  // The ground: the tiles' deep space, veiled so it stays behind the board. The same sky on every aid.
  // Faint stars keep off the text, and only every other one is kept (the aid is bigger than a tile, so
  // its stars come out bigger and denser); bright stars only in the open, under the two die columns.
  const sky = starfield({
    rng: rng('player-aid'),
    id: `${id}-sky`,
    area: full,
    frame: { x: 0, y: 0, w: W, h: H },
    hues: [222, 272],
    nebula: 0.6,
    faintAllowed: (x, y) =>
      (Math.round(x * 7 + y * 13) & 1) === 0 && !TEXT.some(([x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1),
    brightAllowed: (x, y) => y > 63 && y < 70 && ((x > 22 && x < 52) || (x > 114 && x < 142)),
  });
  defs.push(
    sky.defs,
    `<radialGradient id="${id}-glow"><stop offset="0" stop-color="${hsl(ACTION_HUE, 100, 60)}" stop-opacity=".5"/><stop offset="1" stop-color="${hsl(ACTION_HUE, 100, 60)}" stop-opacity="0"/></radialGradient>`,
  );
  out.push(sky.body, `<rect x="${full.x}" y="${full.y}" width="${full.w}" height="${full.h}" fill="${GROUND}" opacity=".3"/>`);

  // --- The cube rail: a pad per cube, spread over the full height, with the win condition alongside.
  // The pads are the planets' cube pads in the die pads' quiet fill; the text runs up the rail, like a spine.
  const pad = CUBE_PAD.size;
  const step = (H - 2 * M - pad) / (MAX_CUBES - 1);
  for (let i = 0; i < MAX_CUBES; i++) {
    out.push(cubePad(M, M + i * step));
  }
  const spine = M + pad + 3.6;
  out.push(
    `<g transform="rotate(-90 ${n(spine)} ${n(H / 2)})">${text(spine, H / 2, 'Place your last cube to win', 2.4, { font: 'bold', fill: WHITE, anchor: 'middle', track: 0.16, upper: true })}</g>`,
  );
  const left = spine + 4;

  // --- Dominance and research: label, pad, what moves the die, what 6 does.
  const colW = 26;
  const side = (x: number, kind: 'dominance' | 'research') => {
    const h = kind === 'dominance' ? DOMINANCE : RESEARCH;
    const tone = hsl(h, 85, 70);
    const cx = x + colW / 2;
    out.push(text(cx, M + 3, kind, 2.4, { font: 'bold', fill: tone, anchor: 'middle', track: 0.16, upper: true }));
    out.push(diePad(cx, M + 17.5, h, kind));
    const lines =
      kind === 'dominance'
        ? {
            gain: ['+1 per enemy destroyed', '−1 per ship lost'],
            six: 'At 6 · Infamy',
            then: ['Place a cube on any', 'planet, reset to 1'],
          }
        : { gain: ['+1 per Research action'], six: 'At 6 · Breakthrough', then: ['Take a card at the', 'end of turn, reset to 1'] };
    let y = M + 35.4;
    for (const t of lines.gain) {
      out.push(line(cx, y, t, 2.3, colW, measure, { fill: WHITE, anchor: 'middle' }));
      y += 3.3;
    }
    y = M + 45.4;
    out.push(line(cx, y, lines.six, 2.4, colW, measure, { font: 'bold', fill: tone, anchor: 'middle' }));
    lines.then.forEach((t, i) => out.push(line(cx, y + 3.5 + i * 3.2, t, 2.2, colW, measure, { fill: MUTED, anchor: 'middle' })));
  };
  side(left, 'dominance');
  side(W - M - colW, 'research');

  // --- The turn, in the middle column.
  const x0 = left + colW + 4;
  const cw = W - M - colW - 4 - x0;
  const rule = (y: number) => `<path d="M${n(x0)} ${n(y)}H${n(x0 + cw)}" stroke="${HAIR}" stroke-width=".25"/>`;
  out.push(text(x0, M + 4.6, '3 actions', 3.2, { font: 'bold', fill: WHITE, upper: true, track: 0.06 }));
  for (let i = 0; i < 3; i++) out.push(hex(x0 + cw - 2.2 - i * 5, M + 3.5, 2.25, `${id}-glow`));
  out.push(rule(M + 7.6));
  const textX = x0 + 7.8;
  actions(edition).forEach((a, i) => {
    const y = M + 12.6 + i * 6.8;
    for (let k = 0; k < a.cost; k++) out.push(hex(x0 + 1.6 + k * 3.6, y - 0.8, 1.6, `${id}-glow`));
    out.push(text(textX, y, a.name, 2.6, { font: 'bold', fill: WHITE }));
    out.push(line(textX, y + 2.9, a.text, 2.2, x0 + cw - textX, measure, { fill: MUTED }));
  });
  out.push(rule(M + 45.6));
  const ruleX = x0 + 13;
  rules(edition).forEach(([label, s], i) => {
    const y = M + 49.6 + i * 3.6;
    out.push(text(x0, y, label, 2.1, { font: 'bold', fill: WHITE, track: 0.08, upper: true }));
    out.push(line(ruleX, y, s, 2.2, x0 + cw - ruleX, measure, { fill: MUTED }));
  });

  // --- The fleet: six die faces, strongest to fastest, and what each can do.
  // Anchored to the bottom: the last line of the ships' text sits on the bottom margin (less its descenders).
  const size = 17;
  const fleetY = H - M - 0.6 - (size + 4.4 + 3.1);
  const gap = (W - M - left - 6 * size) / 5;
  // One size for every ship's text: the largest at which every line fits its column.
  const lines = SHIPS.flatMap((s) => s.text);
  const shipText = Math.max(MIN_TEXT, Math.min(2.5, ...lines.map((t) => (size + gap - 0.8) / measure(t, 1, 'bold'))));
  for (const [i, s] of SHIPS.entries()) {
    const cx = left + size / 2 + i * (size + gap);
    const d = shipDie(`${id}-d${s.value}`, s.value, cx, fleetY + size / 2, size, HUE);
    defs.push(d.defs);
    out.push(d.body);
    s.text.forEach((t, k) =>
      out.push(text(cx, fleetY + size + 4.4 + k * 3.1, t, shipText, { font: 'bold', fill: accent, anchor: 'middle' })),
    );
  }

  return document({ defs: defs.join(''), body: out.join('') }, { x: -b, y: -b, w: W + 2 * b, h: H + 2 * b }, true, o.fontCss);
}
