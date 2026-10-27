import { GROUND, cubePad, diePad } from './aid';
import { CARD, cardPalette } from './card';
import { document, esc, hsl, hslToRgb, n } from './svg';
import { INKS } from './screenprint/inks';
import { hexEdge, hexEdges, well } from './tile/markings';
import { CARD_CATEGORIES, CUBE_PAD, DOMINANCE, FONTS, INK, TILE, WELL } from './tokens';

/**
 * The press test: one A4 page to print on the real press and stock before a run, to check what the
 * screen can't show. It has a tile and a dark card at 100 %, the ramp the ground art lives in,
 * the markings, every category colour on both card looks, the text sizes the pieces use, and hairlines.
 * See docs/GRAPHICS.md §4.
 */

export const PRESS_TEST = { w: 210, h: 297 } as const;

export interface PressTestOptions {
  /** A tile and a dark card face as image URLs (SVG data URLs carrying their fonts), placed at 100 %. */
  tile?: string;
  card?: string;
  /** `@font-face` rules to embed. */
  fontCss?: string;
}

/** CIE lightness (0–100) of an sRGB colour given in HSL. */
function lightnessOf(h: number, s: number, l: number): number {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = hslToRgb(h, s, l).map(lin);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}

/** A grey of CIE lightness `l`, as an `hsl()` colour. */
function grey(l: number): string {
  const y = l > 8 ? ((l + 16) / 116) ** 3 : (l * 27) / 24389;
  const v = y <= 0.0031308 ? 12.92 * y : 1.055 * y ** (1 / 2.4) - 0.055;
  return hsl(0, 0, v * 100);
}

/** Mars's rust (screenprint `INKS.rust`) as hue and saturation, for the ground ramp. */
const GROUND_HUE = [24, 44] as const;

const M = 8;
const WIDTH = PRESS_TEST.w - 2 * M;
const PAPER = cardPalette(true, 0).paper;
const MUTED_LIGHT = cardPalette(true, 0).muted;
const MUTED_DARK = cardPalette(false, 0).muted;
const ON_DARK = cardPalette(false, 0).ink;

const text = (x: number, y: number, s: string, size: number, fill: string, extra = '', family: string = FONTS.body) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="${family}" font-size="${n(size)}" fill="${fill}"${extra ? ` ${extra}` : ''}>${esc(s)}</text>`;
const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra ? ` ${extra}` : ''}/>`;
const heading = (y: number, s: string) => text(M, y, s.toUpperCase(), 2.1, INK, 'font-weight="700" letter-spacing=".3"');

/** The press test page as a standalone SVG document (no bleed: print it at 100 % on A4). */
export function pressTestSvg(o: PressTestOptions = {}): string {
  let body = rect(0, 0, PRESS_TEST.w, PRESS_TEST.h, '#fff');
  body += text(M, 12.5, 'REGOLITH · PRESS TEST', 4, INK, 'font-weight="900" letter-spacing=".4"', FONTS.title);
  body += text(
    M,
    17,
    'Print at 100 % on the real stock. Check: ramp steps stay apart, outlines and wells show, text is clean, colours tell apart.',
    2.1,
    MUTED_LIGHT,
  );

  // Pieces at 100 %: a tile (with dice and cubes on it, check the fit) and a dark card.
  const top = 20;
  if (o.tile) body += `<image x="${M}" y="${top}" width="${TILE.size}" height="${TILE.size}" href="${o.tile}"/>`;
  const cardX = M + TILE.size + 4;
  if (o.card) body += `<image x="${cardX}" y="${top}" width="${CARD.w}" height="${CARD.h}" href="${o.card}"/>`;

  // Category colours: each as on a light card (accent and subtitle ink on paper) and a dark one.
  const swX = cardX + CARD.w + 4;
  const cellW = (PRESS_TEST.w - M - swX - 1) / 2;
  const cellH = CARD.h / 8;
  Object.entries(CARD_CATEGORIES).forEach(([, c], i) => {
    const y = top + i * cellH;
    for (const [k, light] of [true, false].entries()) {
      const p = cardPalette(light, c.hue);
      const x = swX + k * (cellW + 1);
      body += rect(x, y, cellW, cellH - 0.6, p.paper);
      body += rect(x + 1, y + 1, cellW - 2, cellH - 5.2, p.accent);
      body += text(x + cellW / 2, y + cellH - 1.6, c.label, 1.8, p.accentInk, 'text-anchor="middle" font-style="italic"');
    }
  });

  // Ramps: Mars's rust from dark to light, where the tile art lives, and a neutral one in L* steps.
  let y = top + TILE.size + 6;
  body += heading(y, `Ground ramp: hsl(${GROUND_HUE[0]} ${GROUND_HUE[1]}% L), labelled L* · the press should keep every step apart`);
  const steps = 16;
  const pw = WIDTH / steps;
  for (let i = 0; i < steps; i++) {
    const l = 10 + i * 4;
    const x = M + i * pw;
    body += rect(x, y + 1.5, pw, 13, hsl(GROUND_HUE[0], GROUND_HUE[1], l));
    body += text(
      x + pw / 2,
      y + 13,
      lightnessOf(GROUND_HUE[0], GROUND_HUE[1], l).toFixed(1),
      1.8,
      '#fff',
      'text-anchor="middle" fill-opacity=".8"',
    );
  }
  y += 19.5;
  body += heading(y, 'Neutral ramp, L* 0–100');
  const greys = 21;
  const gw = WIDTH / greys;
  for (let i = 0; i < greys; i++) {
    const l = i * 5;
    body += rect(M + i * gw, y + 1.5, gw, 10, grey(l));
    body += text(M + i * gw + gw / 2, y + 10, String(l), 1.8, l < 55 ? '#fff' : INK, 'text-anchor="middle"');
  }

  // The tiles' markings on Mars's ground, and the player aid's pads on its ground.
  y += 16.5;
  body += heading(y, 'Markings on the ground, pads on the player aid ground');
  const strip = y + 1.5;
  const h = 34;
  body += rect(M, strip, WIDTH, h, INKS.rust);
  const cy = strip + 15;
  const label = (x: number, s: string, fill = MUTED_DARK) => text(x, strip + h - 2, s, 1.8, fill, 'text-anchor="middle"');
  body += hexEdges(hexEdge(M + 20, cy)) + label(M + 20, 'space');
  body += well(M + 56, cy, CUBE_PAD.size, CUBE_PAD.corner, WELL.cube) + label(M + 56, 'cube pad');
  // The aid's own pads, on its ground.
  const aidX = M + 84;
  body += rect(aidX, strip, M + WIDTH - aidX, h, GROUND);
  body += diePad(aidX + 18, cy, DOMINANCE, 'dominance') + label(aidX + 18, 'aid die pad');
  body += cubePad(aidX + 36, cy - CUBE_PAD.size / 2) + label(aidX + 36 + CUBE_PAD.size / 2, 'aid cube pad');

  // Type: the sizes the pieces use, on the light and the dark card paper.
  y = strip + h + 5;
  body += heading(y, 'Type: Inter, size in mm and pt, on light and dark card paper');
  const panelY = y + 1.5;
  const panelH = 46;
  const half = (WIDTH - 4) / 2;
  const sizes = [1.2, 1.35, 1.5, 1.8, 2.1, 2.4, 3, 3.3];
  for (const [k, light] of [true, false].entries()) {
    const x = M + k * (half + 4);
    const ink = light ? cardPalette(true, 0).ink : ON_DARK;
    const muted = light ? MUTED_LIGHT : MUTED_DARK;
    body += rect(x, panelY, half, panelH, light ? PAPER : INK);
    let ty = panelY + 3;
    for (const s of sizes) {
      ty += s * 1.25 + 1;
      body += text(x + 3, ty, `${s} mm · ${(s / 0.3528).toFixed(1)} pt  Move up to the ship’s value`, s, ink);
    }
    ty += 4;
    body += text(x + 3, ty, '1.5 mm muted · 7/35 C', 1.5, muted, 'font-weight="600" letter-spacing=".1"');
    ty += 3.4;
    body += text(x + 3, ty, '2.1 mm bold · Conquer · Research', 2.1, ink, 'font-weight="700"');
    ty += 3.6;
    body += text(
      x + 3,
      ty,
      '2.3 mm italic · the subtitle',
      2.3,
      cardPalette(light, CARD_CATEGORIES.research.hue).accentInk,
      'font-style="italic"',
    );
  }

  // Hairlines, and the light card paper beside white and other light tints.
  y = panelY + panelH + 5;
  body += heading(y, 'Hairlines (mm) · light tints (L % of hsl(225 30% L))');
  const lineY = y + 1.5;
  const lh = 18;
  const widths = [0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3];
  for (const [k, light] of [true, false].entries()) {
    const x = M + k * 48;
    body += rect(x, lineY, 46, lh, light ? PAPER : INK);
    widths.forEach((w, i) => {
      const lx = x + 4 + i * 6.3;
      body += `<path d="M${n(lx)} ${n(lineY + 2)}V${n(lineY + lh - 5)}" stroke="${light ? INK : '#fff'}" stroke-width="${w}"/>`;
      body += text(lx, lineY + lh - 1.5, String(w).replace(/^0/, ''), 1.8, light ? MUTED_LIGHT : MUTED_DARK, 'text-anchor="middle"');
    });
  }
  const tints = [100, 97, 95, 92, 89, 86];
  const tw = (WIDTH - 96 - 2) / tints.length;
  tints.forEach((l, i) => {
    const x = M + 98 + i * tw;
    body += rect(x, lineY, tw - 1, lh, hsl(225, 30, l), `stroke="${hsl(225, 10, 80)}" stroke-width=".15"`);
    body += text(x + (tw - 1) / 2, lineY + lh - 2, l === 95 ? '95 card' : String(l), 1.8, MUTED_LIGHT, 'text-anchor="middle"');
  });

  return document({ defs: '', body }, { x: 0, y: 0, w: PRESS_TEST.w, h: PRESS_TEST.h }, true, o.fontCss);
}
