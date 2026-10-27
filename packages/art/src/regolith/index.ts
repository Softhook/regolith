import { rng } from '../rng';
import { blur, document, n, region, type Fragment } from '../svg';
import { BLED, type Spot } from '../tile/geometry';
import type { World } from '../tile/look';
import type { TileSpec } from '../tile/set';
import { SPACE, SCALE, SIZE, LIT, DRAWN, MARGIN } from './core';
import { ground, built, cast, dust, SHADOW } from './light';
export { GROUND_BASE } from './light';
import { GRADIENTS, CRATERS, BURIED, RIDGE, DUNES, LEVEL, features, terrain, weathering, type Strew } from './terrain';
import { BUILDING_GRADIENTS } from './parts';
import { base } from './base';
import { inked } from './inks';

/**
 * Phobos, Deimos or Mars ground for a hex tile, after the Regolith mood board (docs/moodboards/regolith/HexSurface.dc.html):
 * a height map painted in colour (red is height, 128 the ground; green marks smooth areas; blue is
 * brightness), then lit once by one filter. Drawn in the board's own units, where a space is 69.3 tall,
 * so its numbers carry over; the tile is scaled to millimetres at the end. Each tile's craters, pits and
 * boulders come from its seed; the world changes its colour, adds Mars's dunes, tracks and dust, and on
 * Deimos buries most craters in dust, smooths the ground and streaks it bright.
 *
 * Chrome ignores the lighting's `kernelUnitLength`, so its relief differs from Firefox's and Safari's
 * (the mood board's Surface study); the game draws each tile once to a bitmap, in the player's browser.
 *
 * The ground is drawn, and lit, past the area shown by `MARGIN`: the lighting reads its neighbours and the
 * shadows and warps reach in from further, so at the filter's edge they'd go wrong, as a grey line.
 *
 * The parts: core (units, the hex flower, SVG helpers), light (the lighting filters), terrain (craters,
 * ridges, dunes), parts (how a piece of a base is drawn, in layers), buildings, craft (ships, rovers and
 * small things), base (how a base is laid out round its planet's space) and inks (the bases' colours in
 * each world's inks).
 */

/** A tile's scene, in board units: the ground's defs and its lit height map, and what stands on it (if anything), drawn round the planet's space. */
interface Scene {
  defs: string;
  lit: string;
  /** What stands: its height map, which also cuts it out, and its drawing over the ground. */
  standing?: { heights: string; drawn: string };
}

/** A tile's scene on `world`, its base standing `at` its planet's space. */
function scene(spec: TileSpec, at: Spot, world: World): Scene {
  const mars = world === 'mars';
  const r = rng(spec.seed).fork('regolith');
  const site = base(spec.number, at, r.fork('base'));
  const [bx, by] = [SIZE / 2 + at.x * SPACE, SIZE / 2 + at.y * SPACE];
  const place = (f: string) => `<g transform="translate(${n(bx)},${n(by)})">${f}</g>`;
  const heights =
    terrain(r, world) +
    // The ground is levelled round a base, smoothing over any crater there, then it's built.
    (site ? place(site.grade + site.heights) : '');
  // Craters, pits and dunes are weathered, and the blurs soften what's drawn: after the terrain, as they draw on its stream.
  const filters = blur('rg-soft1', 1) + blur('rg-soft3', 3) + blur('rg-soft6', 6) + weathering(r);
  const defs =
    GRADIENTS +
    BUILDING_GRADIENTS +
    (mars ? DUNES : '') +
    filters +
    ground(r.fork('ground'), DRAWN, world) +
    built(r.fork('built'), DRAWN) +
    cast(DRAWN) +
    (mars ? dust(r.noiseSeed(), DRAWN) : '') +
    CRATERS +
    (world === 'deimos' ? BURIED : '') +
    RIDGE;
  const lit = `<g filter="url(#rg-ground)">${heights}</g>`;
  if (!site) return { defs, lit };
  const standing = place(site.heights);
  // The buildings' filters are over the tile's area, so they're applied outside the move to the planet's space.
  const drawn =
    `<g filter="url(#rg-cast)">${standing}</g>` +
    `<g filter="url(#rg-built)">${standing}</g>` +
    place(`<g style="mix-blend-mode: color">${inked(site.tint, world)}</g>`) +
    (mars ? `<g filter="url(#rg-dust)" opacity="0.9" style="mix-blend-mode: soft-light">${standing}</g>` : '') +
    place(inked(site.paint, world));
  return { defs, lit, standing: { heights: standing, drawn } };
}

/** The trim and its bleed in board units, where a bitmap of the lit ground goes (`regolithGroundSvg`). */
const LIT_AREA = { x: BLED.x / SCALE, y: BLED.y / SCALE, w: BLED.w / SCALE, h: BLED.h / SCALE };

/** The lit ground: drawn by its filter, or a bitmap of it (a data URL of `regolithGroundSvg`) in its place. */
const litGround = (scene: Scene, image?: string) =>
  image ? `<image href="${image}" ${region(LIT_AREA)} preserveAspectRatio="none"/>` : scene.lit;

/** The buildings' cast shadows (light.ts `SHADOW`), their blur in mm: for the dice and cubes the game stands on the ground. */
export const REGOLITH_SHADOW = { ...SHADOW, blur: SHADOW.blur * SCALE };

/** The size, px, to draw `regolithGroundSvg` at: a pixel the size its light is made for (`LIT`). */
export const REGOLITH_GROUND_PX = Math.round(LIT_AREA.w / LIT);

/** Board units drawn as trim millimetres. */
const inMm = (body: string) => `<g transform="scale(${n(SCALE)})">${body}</g>`;

/** Paints what it's given white, keeping its shape. */
const WHITE = `<filter id="rg-white" filterUnits="userSpaceOnUse" ${region(DRAWN)}><feFlood flood-color="#fff"/><feComposite in2="SourceAlpha" operator="in"/></filter>`;

/** What stands on a tile in white: its heights' shapes, in mm. */
const silhouette = (heights: string) => inMm(`<g filter="url(#rg-white)">${heights}</g>`);

/**
 * A tile's ground on `world` over its trim and bleed (mm, the trim's top left at 0, 0), with everything on it;
 * and what stands on it alone (its buildings, ships and rovers), cut to their outlines, to print over the
 * spaces' wells. Its lit ground drawn by its filter, or as `image`, a bitmap of it (`regolithGroundSvg`). For
 * a tile on a world's ground (tile/index.ts `tileSvg`), in place of its sky and planet.
 */
export function groundArt(spec: TileSpec, at: Spot, world: World, image?: string): Fragment & { standing?: Fragment } {
  const s = scene(spec, at, world);
  const { defs, standing } = s;
  return {
    defs,
    body: inMm(litGround(s, image) + (standing?.drawn ?? '')),
    ...(standing && {
      standing: {
        defs: WHITE + `<mask id="rg-standing" maskUnits="userSpaceOnUse" ${region(BLED)}>${silhouette(standing.heights)}</mask>`,
        body: `<g mask="url(#rg-standing)">${inMm(standing.drawn)}</g>`,
      },
    }),
  };
}

/**
 * A hex tile's ground on `world`, in place of its sky and planet, trim 96 × 96 mm and its 3 mm bleed (so a map's
 * clip a touch past the hexes still lands on ground): the planet's building stands `at` its space (in
 * spaces from the tile's middle, x right and y down). No markings: the game draws the cubes and the
 * number over its bays, and the spaces' wells under what stands (`regolithMaskSvg`).
 */
export function regolithSvg(spec: TileSpec, world: World, at: Spot = { x: 0, y: 0 }): string {
  const { defs, lit, standing } = scene(spec, at, world);
  return document({ defs, body: inMm(lit + (standing?.drawn ?? '')) }, BLED, true);
}

/**
 * A hex tile's lit ground on `world` alone, over the same area as `regolithSvg`, its building `at` its planet's
 * space: nothing standing on it, as that's drawn over it. For print, drawn at `REGOLITH_GROUND_PX` and passed
 * back as the tile's `ground` (tile/index.ts `tileGroundSvg`), so the light is as on screen, not in contour
 * lines (`LIT`), while what stands is drawn at the print's own resolution.
 */
export function regolithGroundSvg(spec: TileSpec, world: World, at: Spot = { x: 0, y: 0 }): string {
  const { defs, lit } = scene(spec, at, world);
  return document({ defs, body: inMm(lit) }, BLED, true);
}

/**
 * What stands on a tile's ground (`regolithSvg`), as a mask over the same area: white where it stands,
 * clear elsewhere. Cheap to draw (no lighting), so the game cuts what stands out of the drawn ground with
 * it, to lay over the spaces' wells, rather than drawing it again.
 */
export function regolithMaskSvg(spec: TileSpec, at: Spot = { x: 0, y: 0 }): string {
  // What stands is the same on every world, so any will do.
  const { standing } = scene(spec, at, 'mars');
  // Only the defs its shapes use: their gradients, and a blur.
  const defs = WHITE + BUILDING_GRADIENTS + blur('rg-soft1', 1);
  return document(standing ? { defs, body: silhouette(standing.heights) } : { defs: '', body: '' }, BLED, true);
}

/** The lobby's surface (`regolithSurfaceSvg`), across and down, in board units. */
const SURFACE = 640;
/** How far past the square the surface is drawn, right and down, as a share of it: what's blended over its other edges. */
const OVERLAP = 0.08;

/**
 * The lobby's surface: `mm` across and down, drawn to `px` (a pixel the size its light is made for, `LIT`); and
 * `overlap`, the share of that drawn again past its right and bottom edges, to blend over its left and top.
 */
export const REGOLITH_SURFACE = { mm: SURFACE * SCALE, px: Math.round(SURFACE / LIT), overlap: OVERLAP };
/** Tiles' worth of terrain on the surface: as many to the area as on a tile's hex flower, seven spaces. */
const SURFACE_TILES = Math.round(SURFACE ** 2 / (7 * (Math.sqrt(3) / 2) * SPACE ** 2));

/**
 * Bare ground on `world` with no tiles, for the lobby: a square for the page to lay edge to edge, and past it the
 * square's start again (`REGOLITH_SURFACE`). Its terrain is strewn over the square and drawn again a square away
 * on every side, so what runs off one edge comes back in at the other, and its light's noise repeats so too
 * (light `ground`). That doesn't quite meet: Chrome weathers each crater by where it is, so a copy is a little
 * different; the page blends the overlap in. From 0, 0, in mm.
 */
export function regolithSurfaceSvg(world: World, seed = 1): string {
  const r = rng(seed).fork(`surface:${world}`);
  const square: Strew = (q) => ({ x: q.range(0, SURFACE), y: q.range(0, SURFACE) });
  const strewn = Array.from({ length: SURFACE_TILES }, (_, i) => features(r.fork(`terrain${i}`), world, square, SURFACE)).join('');
  const copies = [-1, 0, 1]
    .flatMap((i) => [-1, 0, 1].map((j) => `<g transform="translate(${i * SURFACE},${j * SURFACE})">${strewn}</g>`))
    .join('');
  const drawn = SURFACE * (1 + OVERLAP);
  const area = { x: -MARGIN, y: -MARGIN, w: drawn + 2 * MARGIN, h: drawn + 2 * MARGIN };
  const defs =
    GRADIENTS +
    (world === 'mars' ? DUNES : '') +
    blur('rg-soft1', 1) +
    blur('rg-soft3', 3) +
    blur('rg-soft6', 6) +
    weathering(r) +
    ground(r.fork('ground'), area, world, SURFACE) +
    CRATERS +
    (world === 'deimos' ? BURIED : '') +
    RIDGE;
  const mm = drawn * SCALE;
  return document({ defs, body: inMm(`<g filter="url(#rg-ground)">${LEVEL(area)}${copies}</g>`) }, { x: 0, y: 0, w: mm, h: mm }, true);
}
