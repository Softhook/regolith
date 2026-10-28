import { INKS } from '../screenprint/inks';
import { rgbHex } from '../svg';

/**
 * The bases' colours (mood board ObjectiveColours): the hub the cubes sit in carries the colour, in its objective's
 * palette ink (the Habitat keeps its green), and everything out from it keeps its own colours and patterns but
 * faded towards bone metal, its lights faded and dimmed with it, so it doesn't draw the eye from the hub. Which part of
 * a drawing is which is marked in it (`OUTER`, `WELL`, `LIT`, `KEEP`) and read here.
 */

type Rgb = [number, number, number];

/** An ink ramp, dark to light: a colour of that lightness is read off it. */
type Ramp = Rgb[];

const parse = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as Rgb;
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v + (b[i] - v) * t) as Rgb;

const lightness = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Hue (degrees) and saturation, 0–1. */
function hueOf([r, g, b]: Rgb): [number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return [0, 0];
  const s = d / (1 - Math.abs(max + min - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s];
}

const ramp = (...inks: string[]): Ramp => inks.map(parse).sort((a, b) => lightness(a) - lightness(b));

/** The ink at lightness `l` on `inks`: between its two nearest, below its darkest to near black, above its lightest to near white. */
function read(inks: Ramp, l: number): Rgb {
  const ls = inks.map(lightness);
  if (l <= ls[0]) return mix([0.08, 0.075, 0.07], inks[0], l / ls[0]);
  for (let i = 1; i < inks.length; i++) if (l <= ls[i]) return mix(inks[i - 1], inks[i], (l - ls[i - 1]) / (ls[i] - ls[i - 1]));
  const last = ls.length - 1;
  return mix(inks[last], [1, 0.98, 0.94], (l - ls[last]) / (1 - ls[last]));
}

const BONE = ramp(INKS.key, '#4A4540', '#8C8478', '#CFC8BC', '#EDE7DB');
const HAZARD = ramp('#5b3a08', '#c98a14', INKS.amber, '#ffd27a');
const GREEN = ramp('#14301f', '#4a9c7a', '#7dffb0');
const COMPACT = ramp('#0f4a55', '#1E8597', '#3CB8CE', '#bdf0f8');
const RED = ramp('#2e0a08', '#8f1f12', '#d63a22', '#f8a38a');
const ICE = ramp('#1f3a46', '#5f93a8', '#cfeaf2');

/** The ink each objective's hub is painted in, by planet number: the Habitat's own green, then the palette's Hazard, Compact, Union and Ejecta ice. */
const HUB_INK: Record<number, Ramp> = { 7: GREEN, 8: HAZARD, 9: COMPACT, 10: RED, 0: ICE };

/** Below this saturation a colour is grey, and goes to bone. */
const GREY = 0.18;

const toBone = (c: Rgb) => read(BONE, lightness(c));

/** How much of its ink a hub's grey metal takes: the Reactor's stays dark, so its colour is only its frame and glow. */
const GREY_SHARE: Record<number, number> = { 7: 0.7, 8: 0, 9: 0.7, 10: 0, 0: 0.7 };

/** A colour in its objective's ink; greys take most of it too, so the hub's metal is the objective's colour. */
const inInk = (number: number, c: Rgb) => {
  const [, s] = hueOf(c);
  const ink = read(HUB_INK[number] ?? BONE, lightness(c));
  return s < GREY ? mix(toBone(c), ink, GREY_SHARE[number] ?? 0.7) : ink;
};

/** The cube wells: the Refinery's in its own ink, the others plain grey, so they stand clear of the coloured deck round them. */
const wellInk = (number: number, c: Rgb) => (number === 8 ? inInk(number, c) : toBone(c));

/** The Habitat's hub keeps the green it is drawn in; the rest are in their ink. */
const hubInk = (number: number, c: Rgb) => (number === 7 ? c : inInk(number, c));

/** How much of its own colour what stands out from the hub keeps, of the way from bone metal. */
const KEEP_OF_COLOUR = 0.25;

/** What stands out from the hub: its own colours, faded, so the patterns and hues stay but quietly. */
const outerInk = (_: number, c: Rgb) => mix(toBone(c), c, KEEP_OF_COLOUR);

/** The same for a light, dimmed a little as well, so it glows without drawing the eye. */
const litInk = (n: number, c: Rgb) => outerInk(n, c).map((v) => v * 0.85) as Rgb;

/** Marks a part of a drawing to paint apart from the hub: what's out from it (`o`), its cube wells (`w`), a light (`l`: in the hub's ink even out from it), or what keeps its own colour (`k`). Marks may nest. */
const mark = (tag: 'o' | 'w' | 'k' | 'l') => (svg: string) => `<!--${tag}-->${svg}<!--/${tag}-->`;
export const OUTER = mark('o');
export const WELL = mark('w');
export const KEEP = mark('k');
export const LIT = mark('l');

const SKIP = /^(f{3}|f{6}|0{3}|0{6})$/i;

const recolour = (svg: string, paint: (c: Rgb) => Rgb) =>
  svg.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g, (all, hex: string) => (SKIP.test(hex) ? all : rgbHex(paint(parse(hex)))));

/** Every colour in `svg`, a base's drawing for planet `number` (0 for a Void tile), in the bases' inks, but for pure white and black, which masks and lights are drawn in. */
export const inked = (svg: string, number: number) => {
  const open: string[] = [];
  return svg
    .split(/<!--(\/?[owkl])-->/)
    .map((part, i) => {
      if (i % 2) {
        if (part[0] === '/') open.pop();
        else open.push(part);
        return '';
      }
      const has = (tag: string) => open.includes(tag);
      if (has('k')) return part;
      const paint = has('w') ? wellInk : has('o') ? (has('l') ? litInk : outerInk) : hubInk;
      return recolour(part, (c) => paint(number, c));
    })
    .join('');
};
