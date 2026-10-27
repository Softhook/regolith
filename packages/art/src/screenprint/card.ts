import { rng } from '../rng';
import { dieCut, document, esc, n, type Box, type Fragment } from '../svg';
import type { CardDeck, CardFace, CardOptions, Measure, MeasuredFont } from '../card';
import { INKS, ON_NIGHT, ON_PAPER } from './inks';
import { SP_FONTS, label, land, mech, paperGround, person, screens, sky, type Stage } from './kit';
import type { MechKind } from './mechs';
import { SCENES } from './scenes';

/**
 * The screenprint cards (docs/regolith/REGOLITH.md §5), after the CardStyles board's screenprint row: the scene
 * at the top in flat inks under a soft shade, a band in the card's colour plate, the name stencilled in the
 * paper's ink, the rules in condensed type, and a footer. Permanent cards are on paper in key ink;
 * one-shot cards on night paper in bone. Size, bleed and safe area as card.ts.
 */

const W = 63.5;
const H = 88.9;
const BLEED = 3;
/** Where the scene ends and the panel starts. */
const ART_BOTTOM = 42;
const SAFE = 4.5;

/** Each category's colour plate. */
const PLATE: Record<string, string> = {
  movement: INKS.ice,
  research: INKS.ice,
  expansion: INKS.ice,
  combat: INKS.oxide,
  ship: INKS.oxide,
  action: INKS.dust,
  conquer: INKS.dust,
  card: INKS.dust,
};

/**
 * The deck's name on its back, the mech standing on it (at `size` mm per board unit, so each fills the back
 * about as much as the next), and whether it prints on night paper (one-shot and face-up decks).
 */
const DECK: Record<CardDeck, { name: string; mech: MechKind; size: number; dark: boolean }> = {
  skill: { name: 'Skill', mech: 'breacher', size: 0.13, dark: false },
  tactic: { name: 'Tactic', mech: 'tactician', size: 0.13, dark: true },
  expansion: { name: 'Reinforcements', mech: 'behemoth', size: 0.11, dark: true },
};

/** Words set bold in the rules: the game's terms, in Regolith's words. */
const BOLD = new Set([
  'Research',
  'Power',
  'Atomic',
  'Atomics',
  'Combat',
  'Claim',
  'Claiming',
  'Attack',
  'Drop',
  'Refit',
  'Move',
  'Skill',
  'Skills',
  'Tactic',
  'Tactics',
  'Orbital',
  'strike',
  'strikes',
]);

/** Rough widths of the screenprint faces, per character and mm of size. */
const WIDTHS: Partial<Record<MeasuredFont, number>> = { stencil: 0.7, display: 0.74, condensed: 0.42, condensedBold: 0.45, mono: 0.62 };

/** Rough widths of the screenprint faces, when no real measurement is available. */
const estimateScreenprint: Measure = (text, size, font) => size * text.length * (WIDTHS[font] ?? 0.52);

const rect = (b: Box, fill: string, extra = '') =>
  `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${fill}"${extra}/>`;

/** A stage on the deck's paper, in its inks: key on paper, bone on night paper. */
const paperStage = (deck: CardDeck, o: Pick<Stage, 'id' | 'r' | 'world' | 'h' | 'plate'>): Stage => {
  const dark = DECK[deck].dark;
  return {
    ...o,
    dark,
    w: W,
    paper: dark ? INKS.night : INKS.paper,
    key: dark ? INKS.bone : INKS.key,
    ink: dark ? ON_NIGHT : ON_PAPER,
    defs: [],
  };
};

/** A card's stage: its plate, and its scene's world. */
const stage = (face: CardFace, id: string): Stage =>
  paperStage(face.deck, {
    id,
    r: rng(`screenprint:${face.id}`),
    world: SCENES[face.id]?.world ?? 'phobos',
    h: ART_BOTTOM,
    plate: PLATE[face.category] ?? INKS.dust,
  });

/** The scene, clipped to the art window and its bleed, under a shade fading down from the top. */
function art(face: CardFace, s: Stage): Fragment {
  const scene = SCENES[face.id];
  const body = scene ? scene.draw(s) : paperGround(s) + sky(s) + land(s, 33);
  const win: Box = { x: -BLEED, y: -BLEED, w: W + 2 * BLEED, h: ART_BOTTOM + BLEED };
  const shade = s.dark ? '#000' : s.key;
  const fade =
    `<linearGradient id="${s.id}-fade" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${shade}" stop-opacity="${s.dark ? 0.55 : 0.32}"/><stop offset="1" stop-color="${shade}" stop-opacity="0"/></linearGradient>`;
  return {
    defs: screens(s) + s.defs.join('') + fade + `<clipPath id="${s.id}-win">${rect(win, '#000')}</clipPath>`,
    body:
      `<g clip-path="url(#${s.id}-win)">${body}` +
      rect({ x: -BLEED, y: -BLEED, w: W + 2 * BLEED, h: BLEED + ART_BOTTOM * 0.45 }, `url(#${s.id}-fade)`) +
      `</g>`,
  };
}

interface Word {
  text: string;
  bold: boolean;
}

/** The rules' typography: curly apostrophes, and true minus signs on modifiers like −1. */
const typeset = (text: string) => text.replace(/'/g, '\u2019').replace(/(^|[\s(])-(?=\d)/g, '$1\u2212');

/** Greedy lines no wider than `width`. */
function fill(words: Word[], widths: number[], space: number, width: number): Word[][] {
  const lines: Word[][] = [[]];
  let used = 0;
  words.forEach((w, i) => {
    const cur = lines[lines.length - 1];
    if (cur.length && used + space + widths[i] > width) {
      lines.push([w]);
      used = widths[i];
    } else {
      used += (cur.length ? space : 0) + widths[i];
      cur.push(w);
    }
  });
  return lines;
}

/**
 * The rules in lines: as few as fit `width`, then balanced (the narrowest measure that keeps that many lines),
 * so the rag is even and the last line isn't left short. A last line of one word takes another from the line above.
 */
function wrap(text: string, size: number, width: number, measure: Measure): Word[][] {
  const words = typeset(text)
    .split(/\s+/)
    .map((w) => ({ text: w, bold: BOLD.has(w.replace(/[^A-Za-z]/g, '')) }));
  const widths = words.map((w) => measure(w.text, size, w.bold ? 'condensedBold' : 'condensed'));
  const space = measure(' ', size, 'condensed');
  let lines = fill(words, widths, space, width);
  if (lines.length > 1) {
    let lo = Math.max(...widths);
    let hi = width;
    while (hi - lo > 0.05) {
      const mid = (lo + hi) / 2;
      if (fill(words, widths, space, mid).length > lines.length) lo = mid;
      else hi = mid;
    }
    lines = fill(words, widths, space, hi);
  }
  const last = lines[lines.length - 1];
  const prev = lines[lines.length - 2];
  const wd = (w: Word) => widths[words.indexOf(w)];
  if (last.length === 1 && prev && prev.length > 2 && wd(prev[prev.length - 1]) + space + wd(last[0]) <= width) last.unshift(prev.pop()!);
  return lines;
}

/** The band in the card's colour plate between the scene and the panel. */
const BAND = 2.4;

/** The panel under the scene: the band, name, rules text and footer. */
function panel(face: CardFace, s: Stage, area: Box, measure: Measure): string {
  const ink = s.key;
  let out = rect({ x: area.x, y: ART_BOTTOM, w: area.w, h: area.y + area.h - ART_BOTTOM }, s.paper);
  out += rect({ x: area.x, y: ART_BOTTOM - 0.1, w: area.w, h: BAND }, s.plate);

  // The name, as large as fits.
  const textW = W - 2 * SAFE;
  const name = face.name.toUpperCase();
  const size = Math.min(5.8, textW / (measure(name, 1, 'display') * 1.04));
  const nameY = ART_BOTTOM + BAND + 2.6 + size * 0.95;
  out += `<text x="${n(SAFE)}" y="${n(nameY)}" font-family="${SP_FONTS.display}" font-weight="900" font-size="${n(size)}" fill="${ink}">${esc(name)}</text>`;

  // The rules: the largest size that fits between the name and the footer, set a little above the middle of
  // that space so short rules don't leave it all empty below them.
  const top = nameY + 3.4;
  const bottom = H - SAFE - 2.4;
  let tsize = 5.8;
  let lines = wrap(face.text, tsize, textW, measure);
  while (tsize > 2.4 && lines.length * tsize * 1.22 > bottom - top) {
    tsize -= 0.1;
    lines = wrap(face.text, tsize, textW, measure);
  }
  const lead = tsize * 1.22;
  const y0 = top + (bottom - top - lines.length * lead) * 0.4;
  out += lines
    .map(
      (l, i) =>
        `<text x="${n(SAFE)}" y="${n(y0 + tsize * 0.8 + i * lead)}" font-family="${SP_FONTS.condensed}" font-weight="500" font-size="${n(tsize)}" fill="${ink}">` +
        l.map((w, j) => `<tspan${w.bold ? ' font-weight="700"' : ''}>${esc(w.text)}${j < l.length - 1 ? ' ' : ''}</tspan>`).join('') +
        `</text>`,
    )
    .join('');

  // The footer: the card's copies and its place in its deck.
  const muted = s.dark ? '#8F877B' : '#8a7f6c';
  if (face.copies && face.copies > 1) out += label(`×${face.copies}`, SAFE, H - SAFE + 0.3, 1.3, muted, 'start');
  if (face.index !== undefined && face.deckSize)
    out += label(
      `${String(face.index).padStart(2, '0')}/${String(face.deckSize).padStart(2, '0')}`,
      W - SAFE,
      H - SAFE + 0.3,
      1.3,
      muted,
      'end',
    );
  return out;
}

const pageArea = (bleed?: boolean): Box =>
  bleed ? { x: -BLEED, y: -BLEED, w: W + 2 * BLEED, h: H + 2 * BLEED } : { x: 0, y: 0, w: W, h: H };

const finish = (f: Fragment, area: Box, id: string, o: CardOptions) =>
  document(o.rounded ? dieCut(f, id, W, H, 3) : f, area, true, o.fontCss);

/** A screenprint card's front, as a standalone SVG document. */
export function screenprintCardSvg(face: CardFace, o: CardOptions = {}): string {
  const id = o.idPrefix ?? `sp-${face.id}`;
  const s = stage(face, id);
  const area = pageArea(o.bleed);
  const a = art(face, s);
  const f: Fragment = { defs: a.defs, body: rect(area, s.paper) + a.body + panel(face, s, area, o.measure ?? estimateScreenprint) };
  return finish(f, area, id, o);
}

/** Lettering on a back, in the title face. */
const title = (text: string, y: number, size: number, ink: string, spacing = 0) =>
  `<text x="${n(W / 2)}" y="${n(y)}" font-family="${SP_FONTS.display}" font-weight="900" font-size="${n(size)}" letter-spacing="${n(spacing * size)}" fill="${ink}" text-anchor="middle">${esc(text)}</text>`;

/** A screenprint deck's back: the game's name over Mars and the deck's mech facing out on its ground, a person beside it for scale, on the deck's paper. */
export function screenprintBackSvg(deck: CardDeck, o: Omit<CardOptions, 'measure'> & { plain?: boolean } = {}): string {
  const id = o.idPrefix ?? `sp-back-${deck}`;
  const s = paperStage(deck, {
    id,
    r: rng(`screenprint-back:${deck}`),
    world: deck === 'expansion' ? 'mars' : 'phobos',
    h: H,
    plate: deck === 'expansion' ? INKS.ice : INKS.oxide,
  });
  const area = pageArea(o.bleed);
  const body =
    paperGround(s) +
    sky(s, { planet: { x: W * 0.62, y: H * 0.3, r: 22 } }) +
    land(s, H * 0.7) +
    mech(s, DECK[deck].mech, W * 0.44, H * 0.72, DECK[deck].size) +
    // The person is in the mech's units, so at its size they stand to scale.
    person(W * 0.85, H * 0.72, DECK[deck].size, { facing: -1 }, s.key, s.paper) +
    (o.plain ? '' : title('REGOLITH', H * 0.88, 9, s.key, 0.02) + title(DECK[deck].name.toUpperCase(), H * 0.88 + 4.6, 2.6, s.key, 0.16)) +
    `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="${s.key}" stroke-width="0.5"/>`;
  return finish({ defs: screens(s) + s.defs.join(''), body: rect(area, s.paper) + body }, area, id, o);
}
