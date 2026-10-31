import { estimateWidth, type Measure } from './card';
import { icon } from './icons';
import { poly } from './kit/effects';
import { rng } from './rng';
import { mechDie } from './screenprint/die';
import { INKS } from './screenprint/inks';
import { document, esc, hsl, n } from './svg';
import { ACTION_HUE, CUBE_PAD, FONTS, INK, TILE, TRACK_INK } from './tokens';

/**
 * The player aid: an A6 board, landscape, the same for every player. Down the left edge, a rail of
 * seven cube pads holds the player's cubes, with the win condition beside it; then the pads for the
 * power and research dice (19 mm), and beside them the actions and the rules that hold
 * ground; along the bottom, the six mechs on their die faces with what each can do.
 *
 * Kept deliberately quiet: the night paper of the cards with a few faint craters for ground, one accent colour
 * (actions take the cards' yellow), no boxes. The mech dice are the largest thing on it, then the die pads,
 * then the actions. No text is smaller than `MIN_TEXT`.
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

export interface AidOptions {
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

/** What each mech can do, in one short two-line phrase. */
const SHIPS: { value: number; text: [string, string] }[] = [
  { value: 1, text: ['Free attack on', 'a mech next to it'] },
  { value: 2, text: ['Carry a mech', 'as it moves'] },
  { value: 3, text: ['Swap with any', 'of your mechs'] },
  { value: 4, text: ['Turn to 3 or 5', 'without rolling'] },
  { value: 5, text: ['Shoot down a', 'clear line'] },
  { value: 6, text: ['Free barrier', 'down a clear line'] },
];

const ACTIONS: { name: string; cost: number; text: string }[] = [
  { name: 'Claim', cost: 2, text: 'Your perimeter mechs sum to exactly the objective' },
  { name: 'Drop', cost: 1, text: 'Salvage mech onto the perimeter of your cube' },
  { name: 'Move / Attack', cost: 1, text: 'Up to its value, at most 3; attack ends it' },
  { name: 'Refit', cost: 1, text: 'Re-roll to a value not seen this turn' },
  { name: 'Research', cost: 1, text: '+1 research' },
];

const RULES: [label: string, text: string][] = [
  ['Combat', 'Die + mech value: lower wins, ties to attacker'],
  ['Zones', 'Entering a space next to an enemy mech: stop'],
  ['Contested', 'Enemy on the perimeter: no claim, no drop but home'],
  ['Atomic', 'One combat roll of yours becomes 1'],
  ['Cards', 'At turn end: 1 per claim · 1 at research 6'],
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

export function text(x: number, y: number, s: string, size: number, o: TextStyle = {}): string {
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

/** The board's ground, the cards' night paper (the press test shows the pads on it). */
export const GROUND = INKS.night;
export const WHITE = INKS.bone;
export const MUTED = '#B9B0A2';
export const HAIR = '#4A4540';
/** The quiet fill of every pad on the aid: cubes and dice. */
export const PAD = '#2E2B28';

/** One action: a yellow hexagon with the action bolt, as on the cards (`glow` is its soft halo's gradient id). */
function hex(cx: number, cy: number, r: number, glow: string): string {
  return (
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.8)}" fill="url(#${glow})"/><path d="${poly(cx, cy, r)}" fill="${hsl(ACTION_HUE, 95, 58)}"/>` +
    icon('action', cx, cy, r * 1.2, INK, 2.8)
  );
}

/** A die pad: where the dominance or research die sits, the 24 mm of a tile's space (a 19 mm die with room round it). */
export function diePad(cx: number, cy: number, ink: string, kind: 'dominance' | 'research'): string {
  const s = TILE.pad;
  return (
    `<rect x="${n(cx - s / 2)}" y="${n(cy - s / 2)}" width="${s}" height="${s}" rx="3.6" fill="${PAD}" stroke="${ink}" stroke-width=".4"/>` +
    icon(kind, cx, cy, 7, ink, 1.5)
  );
}

/** A cube pad on the rail, from its top left: the planets' cube pad in the die pads' quiet fill. */
export const cubePad = (x: number, y: number) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${CUBE_PAD.size}" height="${CUBE_PAD.size}" rx="${CUBE_PAD.corner}" fill="${PAD}" stroke="${MUTED}" stroke-opacity=".5" stroke-width=".3"/>`;

/** A few faint craters on the ground, rings in the plates' rust, the same on every aid. */
function craters(): string {
  const r = rng('player-aid');
  let out = '';
  for (let i = 0; i < 9; i++) {
    const [x, y, size] = [r.range(0, AID.w), r.range(0, AID.h), r.range(4, 16)];
    out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(size)}" fill="none" stroke="${INKS.rust}" stroke-opacity=".08" stroke-width="${n(size / 10)}"/>`;
  }
  return out;
}

/** The most cubes any map gives a player. */
const MAX_CUBES = 7;

/** The player aid as a standalone SVG document. */
export function playerAidSvg(o: AidOptions = {}): string {
  const measure = o.measure ?? estimateWidth;
  const id = o.idPrefix ?? 'aid';
  const { w: W, h: H, safe: M, bleed: B } = AID;
  const b = o.bleed ? B : 0;
  const full = { x: -B, y: -B, w: W + 2 * B, h: H + 2 * B };
  const defs: string[] = [];
  const out: string[] = [];
  const accent = INKS.amber;

  defs.push(
    `<radialGradient id="${id}-glow"><stop offset="0" stop-color="${hsl(ACTION_HUE, 100, 60)}" stop-opacity=".5"/><stop offset="1" stop-color="${hsl(ACTION_HUE, 100, 60)}" stop-opacity="0"/></radialGradient>`,
  );
  out.push(`<rect x="${full.x}" y="${full.y}" width="${full.w}" height="${full.h}" fill="${GROUND}"/>`, craters());

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

  // --- Power and research: label, pad, what moves the die, what 6 does.
  const colW = 26;
  const side = (x: number, kind: 'dominance' | 'research') => {
    const tone = TRACK_INK[kind];
    const cx = x + colW / 2;
    out.push(
      text(cx, M + 3, kind === 'dominance' ? 'power' : kind, 2.4, { font: 'bold', fill: tone, anchor: 'middle', track: 0.16, upper: true }),
    );
    out.push(diePad(cx, M + 17.5, tone, kind));
    const lines =
      kind === 'dominance'
        ? {
            gain: ['+1 per enemy destroyed', '−1 per mech lost'],
            six: 'At 6 · Take Over',
            then: ['Place a cube on any', 'objective, reset to 1'],
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
  const cw = W - M - (colW + 4) - x0;
  const rule = (y: number) => `<path d="M${n(x0)} ${n(y)}H${n(x0 + cw)}" stroke="${HAIR}" stroke-width=".25"/>`;
  out.push(text(x0, M + 4.6, '3 actions', 3.2, { font: 'bold', fill: WHITE, upper: true, track: 0.06 }));
  for (let i = 0; i < 3; i++) out.push(hex(x0 + cw - 2.2 - i * 5, M + 3.5, 2.25, `${id}-glow`));
  out.push(rule(M + 7.6));
  const textX = x0 + 7.8;
  ACTIONS.forEach((a, i) => {
    const y = M + 12.6 + i * 6.8;
    for (let k = 0; k < a.cost; k++) out.push(hex(x0 + 1.6 + k * 3.6, y - 0.8, 1.6, `${id}-glow`));
    out.push(text(textX, y, a.name, 2.6, { font: 'bold', fill: WHITE }));
    out.push(line(textX, y + 2.9, a.text, 2.2, x0 + cw - textX, measure, { fill: MUTED }));
  });
  out.push(rule(M + 45.6));
  // The rules' text starts past the widest label.
  const labelSize = 2.1;
  const ruleX = x0 + 3.5 + Math.max(...RULES.map(([label]) => (measure(label.toUpperCase(), 1, 'bold') + 0.08 * label.length) * labelSize));
  RULES.forEach(([label, s], i) => {
    const y = M + 49.6 + i * 3.6;
    out.push(text(x0, y, label, labelSize, { font: 'bold', fill: WHITE, track: 0.08, upper: true }));
    out.push(line(ruleX, y, s, 2.2, x0 + cw - ruleX, measure, { fill: MUTED }));
  });

  // --- The mechs: six die faces, strongest to fastest, and what each can do.
  // Anchored to the bottom: the last line of the ships' text sits on the bottom margin (less its descenders).
  const size = 17;
  const fleetY = H - M - 0.6 - (size + 4.4 + 3.1);
  const gap = (W - M - left - 6 * size) / 5;
  // One size for every ship's text: the largest at which every line fits its column.
  const lines = SHIPS.flatMap((s) => s.text);
  const shipText = Math.max(MIN_TEXT, Math.min(2.5, ...lines.map((t) => (size + gap - 0.8) / measure(t, 1, 'bold'))));
  for (const [i, s] of SHIPS.entries()) {
    const cx = left + size / 2 + i * (size + gap);
    const d = mechDie(s.value, cx, fleetY + size / 2, size);
    defs.push(d.defs);
    out.push(d.body);
    s.text.forEach((t, k) =>
      out.push(text(cx, fleetY + size + 4.4 + k * 3.1, t, shipText, { font: 'bold', fill: accent, anchor: 'middle' })),
    );
  }

  return document({ defs: defs.join(''), body: out.join('') }, { x: -b, y: -b, w: W + 2 * b, h: H + 2 * b }, true, o.fontCss);
}
