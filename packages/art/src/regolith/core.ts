import type { Rng } from '../rng';
import { TILE } from '../tokens';
import { dataUrl, n, region, type Box } from '../svg';
import { BLED, HEX_TILE_CUT, flowerPath, type Spot } from '../tile/geometry';

/** The Regolith ground's units, the hex flower in them, and the SVG helpers its parts share (index.ts says how a tile is drawn). */

/** One space in the mood board's units. */
export const SPACE = 69.3;
/** Millimetres in a board unit. */
export const SCALE = TILE.cell / SPACE;
/** The tile's trim, 96 mm, in board units. */
export const SIZE = TILE.size / SCALE;
/** How far past the area shown the ground is drawn, in board units: past the furthest shadow (9) and warp (13). */
const MARGIN = 20;
/**
 * The pixel the ground's light is made for, in board units (its `kernelUnitLength`). Chrome lights a pixel
 * at a time whatever it's told, from heights in 256 steps: much finer, as in print, each step catches the
 * light as a ridge, in wiggly contour lines all over the ground, so print lights it at this and scales it up.
 * As fine as the ground keeps clear of them (npm run ground:check): at 0.2 they start to show.
 */
export const LIT = 0.24;

/** The point `d` from the origin at `angle` degrees (0 right, y down). */
export const polar = (angle: number, d: number): Spot => ({
  x: d * Math.cos((angle * Math.PI) / 180),
  y: d * Math.sin((angle * Math.PI) / 180),
});

export const stops = (list: [number, string, number?][]) =>
  list.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('');

export const radial = (id: string, list: [number, string, number?][]) => `<radialGradient id="${id}">${stops(list)}</radialGradient>`;

/** The hex flower's outline (its cut), in board units. */
const OUTLINE = HEX_TILE_CUT.map((side) => side.map((v) => v / SCALE));

/** How far (x, y) is inside the hex flower, in board units: negative outside it. */
export function inside(x: number, y: number): number {
  let d = Infinity;
  let crossings = 0;
  for (const [x1, y1, x2, y2] of OUTLINE) {
    const [dx, dy] = [x2 - x1, y2 - y1];
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    d = Math.min(d, Math.hypot(x - x1 - t * dx, y - y1 - t * dy));
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) / (y2 - y1)) * dx) crossings++;
  }
  return crossings % 2 ? d : -d;
}

/**
 * How many features may run over the flower's edge, cut off where the next tile starts: a few, so the
 * edge doesn't look swept clear, but most stop short of it, as a crater cut in two shows at a seam.
 */
const OVER_EDGE = 0.15;

/**
 * A point anywhere on the hex flower for a feature `reach` across from its middle: clear of the edge by
 * that, or now and then (`OVER_EDGE`) only within the flower. Spread evenly, not drawn to the middle.
 */
export function anywhere(r: Rng, reach: number): Spot {
  const clear = r.chance(OVER_EDGE) ? 0 : reach;
  let p = { x: SIZE / 2, y: SIZE / 2 };
  for (let i = 0; i < 80; i++) {
    const q = { x: r.range(0, SIZE), y: r.range(0, SIZE) };
    const d = inside(q.x, q.y);
    if (d >= clear) return q;
    // Too big to keep clear of the edge anywhere: the last point inside the flower will do.
    if (d >= 0) p = q;
  }
  return p;
}

/** A point `d` spaces from the planet's space at `angle` degrees (0 right, y down), in board units. */
export const toward = (angle: number, d: number): Spot => polar(angle, d * SPACE);

/** The trim and its bleed in board units, and the margin past it, which the ground is drawn and lit over. */
export const DRAWN: Box = {
  x: BLED.x / SCALE - MARGIN,
  y: BLED.y / SCALE - MARGIN,
  w: BLED.w / SCALE + 2 * MARGIN,
  h: BLED.h / SCALE + 2 * MARGIN,
};

/**
 * How far in from the flower's cut the ground's broad patches fade out, board units (some 0.6 of a space): each
 * tile's own noise lays them, so they'd stop dead where one tile meets the next; faded, every tile's rim is the
 * same plain ground, and tiles laid side by side meet without a seam.
 */
const RIM = 40;

/**
 * Filter primitives over `area` making `rim`: white on the hex flower, fading to black over its last `RIM` in to
 * its cut, opaque throughout (light.ts `ground`). Blurred, the cut's straight edges come out at half, so that's
 * taken as black; the flower's inner corners come out a little lighter, and keep a trace.
 */
export function rimFade(area: Box): string {
  const image = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(area.x)} ${n(area.y)} ${n(area.w)} ${n(area.h)}"><rect ${region(area)} fill="#000"/><path d="${flowerPath(0)}" transform="scale(${n(1 / SCALE)})" fill="#fff"/></svg>`;
  return (
    `<feImage href="${dataUrl(image)}" ${region(area)} preserveAspectRatio="none" result="rim0"/>` +
    `<feGaussianBlur in="rim0" stdDeviation="${n(RIM / 2)}" result="rim1"/>` +
    '<feComponentTransfer in="rim1" result="rim"><feFuncR type="linear" slope="2" intercept="-1"/><feFuncG type="linear" slope="2" intercept="-1"/><feFuncB type="linear" slope="2" intercept="-1"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>'
  );
}
