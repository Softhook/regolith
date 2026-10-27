import type { Rng } from '../rng';
import { n, region, turbulence, type Box } from '../svg';
import type { World } from '../tile/look';
import type { Spot } from '../tile/geometry';
import { DRAWN, SIZE, anywhere, radial, stops } from './core';

/** Where a feature `reach` across goes: on a tile's hex flower (`anywhere`), or anywhere on the lobby's surface. */
export type Strew = (r: Rng, reach: number) => Spot;

/**
 * The Regolith ground's terrain, as a height map: craters of every age, pits, boulders, ridges, on Mars dunes
 * and dust devils' tracks, and on Deimos craters buried in dust and bright streaks where it slid downhill.
 */

/** Craters carve: the bowl multiplies height (red only), the rim is screened on, so overlaps cut each other. */
export const GRADIENTS =
  radial('rg-bowl', [
    [0, 'rgb(70,255,255)'],
    [0.35, 'rgb(80,255,255)'],
    [0.65, 'rgb(115,255,255)'],
    [0.85, 'rgb(180,255,255)'],
    [0.96, 'rgb(235,255,255)'],
    [1, 'rgb(255,255,255)', 0],
  ]) +
  radial('rg-bowlOld', [
    [0, 'rgb(95,255,200)'],
    [0.5, 'rgb(105,255,205)'],
    [0.75, 'rgb(150,255,225)'],
    [0.92, 'rgb(215,255,245)'],
    [1, 'rgb(255,255,255)', 0],
  ]) +
  radial('rg-rim', [
    [0.58, '#000'],
    [0.66, 'rgb(80,0,0)'],
    [0.71, 'rgb(108,0,0)'],
    [0.78, 'rgb(70,0,0)'],
    [0.88, 'rgb(25,0,0)'],
    [1, '#000'],
  ]) +
  radial('rg-terr', [
    [0.7, '#000'],
    [0.8, 'rgb(40,0,0)'],
    [0.88, '#000'],
  ]) +
  radial('rg-peak', [
    [0, 'rgb(120,0,0)'],
    [0.5, 'rgb(55,0,0)'],
    [1, '#000'],
  ]) +
  radial('rg-ej', [
    [0.42, 'rgb(0,0,255)', 0],
    [0.5, 'rgb(0,0,255)'],
    [1, 'rgb(0,0,255)', 0],
  ]) +
  radial('rg-boulder', [
    [0, 'rgb(245,0,128)'],
    [0.6, 'rgb(205,0,128)'],
    [1, 'rgb(128,0,128)', 0],
  ]);

/** Weathering: noise pushes a crater's outline about (lobes, slumps), then age softens it. In crater units (r 25). */
const weather = (id: string, freq: number, seed: number, scale: number, sd: number, box = 'x="-30%" y="-30%" width="160%" height="160%"') =>
  `<filter id="${id}" ${box}>` +
  turbulence(freq, 4, seed, 't') +
  `<feDisplacementMap in="SourceGraphic" in2="t" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/>` +
  `<feGaussianBlur in="d" stdDeviation="${sd}"/></filter>`;

const circle = (r: number, fill: string, blend: string, opacity?: number, filter?: string) =>
  `<circle r="${r}" fill="url(#${fill})" style="mix-blend-mode: ${blend}"${opacity === undefined ? '' : ` opacity="${opacity}"`}${filter ? ` filter="url(#${filter})"` : ''}/>`;

/** A crater's bowl and rim, weathered by `wx`; past its oldest age, terraces inside the rim. */
const crater = (wx: string, terraced: boolean, bowl = 'rg-bowl', opacity?: number, rim?: number) =>
  circle(25, bowl, 'multiply', opacity, wx) +
  circle(36, 'rg-rim', 'screen', rim, wx) +
  (terraced ? circle(25, 'rg-terr', 'screen', undefined, wx) : '');

/** Craters by age, r 25 (rim 36): old ones shallow and soft, young ones crisp with a bright ejecta ring, the big one with a central peak. */
export const CRATERS =
  `<g id="rg-cr-o">${crater('rg-wx-o', false, 'rg-bowlOld', 0.7, 0.45)}</g>` +
  `<g id="rg-cr-m">${crater('rg-wx-m', true, 'rg-bowl', 0.85, 0.75)}</g>` +
  `<g id="rg-cr-y">${crater('rg-wx-y', true)}${circle(55, 'rg-ej', 'lighten', 0.4)}</g>` +
  `<g id="rg-cr-big">${crater('rg-wx-y', true)}${circle(7, 'rg-peak', 'screen', undefined, 'rg-wx-y')}${circle(68, 'rg-ej', 'lighten', 0.5)}</g>`;

/** A low ridge: a soft rise with a sharper crest. */
export const RIDGE =
  '<g id="rg-ridge">' +
  '<path d="M-30,10 C-22,-6 -6,-16 12,-16 C24,-16 32,-8 30,2 C26,14 4,18 -12,20 C-24,21 -32,18 -30,10 Z" fill="rgb(200,0,128)" filter="url(#rg-soft6)"/>' +
  '<path d="M-22,8 C-12,-4 6,-11 22,-6" fill="none" stroke="rgb(226,0,128)" stroke-width="6" stroke-linecap="round" filter="url(#rg-soft3)"/>' +
  '<path d="M-20,6 C-11,-5 6,-11 21,-7" fill="none" stroke="rgb(236,0,128)" stroke-width="1.6" stroke-linecap="round" filter="url(#rg-soft1)"/>' +
  '</g>';

/** Deimos's craters, buried under its dust: a shallow hollow and the ghost of a rim, softer than an old one. */
export const BURIED = `<g id="rg-cr-b">${crater('rg-wx-o', false, 'rg-bowlOld', 0.55, 0.3)}</g>`;

/** How far a crater of each kind reaches, at scale 1: its rim (36), or where its bright ejecta fades (r 55, 68). */
const CRATER_REACH = { o: 38, m: 38, y: 42, big: 52, b: 38 };

/** Copies of a crater, each placed, turned and stretched a little (as the mood board's are). */
function craters(r: Rng, at: Strew, kind: keyof typeof CRATER_REACH, count: number, min: number, max: number): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const s = r.range(min, max);
    const { x, y } = at(r, CRATER_REACH[kind] * s);
    out += `<use href="#rg-cr-${kind}" transform="translate(${n(x)},${n(y)}) rotate(${r.int(0, 359)}) scale(${n(s)},${n(s * r.range(0.9, 1))})"/>`;
  }
  return out;
}

/**
 * Pits too small to weather apart, `count` of each size from `min` to `max` (skewed small): all their bowls
 * in one group and rims in another, so each is weathered in one go.
 */
function pits(r: Rng, at: Strew, sizes: [count: number, min: number, max: number][]): string {
  const list = sizes.flatMap(([count, min, max]) =>
    Array.from({ length: count }, () => {
      const size = min + (max - min) * r.next() ** 2;
      // The rim is 1.45 times the bowl, and weathered a little further.
      return { ...at(r, size * 1.45 + 1), r: size };
    }),
  );
  const group = (attrs: string, k: number) =>
    `<g ${attrs} filter="url(#rg-wx-p)">${list.map((p) => `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r * k)}"/>`).join('')}</g>`;
  return (
    group('fill="url(#rg-bowl)" style="mix-blend-mode: multiply"', 1) +
    group('fill="url(#rg-rim)" style="mix-blend-mode: screen" opacity="0.75"', 1.45)
  );
}

/** Boulders strewn in a few clusters. */
function boulders(r: Rng, at: Strew, clusters: number, each: number): string {
  let out = '';
  for (let c = 0; c < clusters; c++) {
    const { x, y } = at(r, 18);
    for (let i = 0; i < each; i++) {
      const a = r.range(0, 2 * Math.PI);
      const d = 14 * Math.sqrt(r.next());
      out += `<circle cx="${n(x + d * Math.cos(a))}" cy="${n(y + d * Math.sin(a))}" r="${n(r.range(0.9, 3.6))}"/>`;
    }
  }
  return `<g fill="url(#rg-boulder)">${out}</g>`;
}

/** Dune ripples: a gentle slope up and a sharp drop, every 8, of bright, fairly smooth sand. */
export const DUNES =
  `<linearGradient id="rg-duneG" x2="1">${stops([
    [0, 'rgb(116,120,155)'],
    [0.72, 'rgb(146,120,170)'],
    [0.82, 'rgb(114,120,150)'],
    [1, 'rgb(116,120,155)'],
  ])}</linearGradient>` +
  '<pattern id="rg-dunes" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="url(#rg-duneG)"/></pattern>' +
  radial('rg-duneFade', [
    [0, '#fff'],
    [0.55, '#fff', 0.8],
    [1, '#fff', 0],
  ]) +
  '<mask id="rg-duneMask"><ellipse rx="62" ry="38" fill="url(#rg-duneFade)"/></mask>';

/** Now and then a field of dunes, waved about, faded out at its edges. */
function dunes(r: Rng, at: Strew): string {
  if (!r.chance(0.6)) return '';
  const { x, y } = at(r, 30);
  return (
    `<g transform="translate(${n(x)},${n(y)}) rotate(${r.int(0, 179)})" mask="url(#rg-duneMask)">` +
    `<rect x="-70" y="-45" width="140" height="90" fill="url(#rg-dunes)" filter="url(#rg-wx-d)"/></g>`
  );
}

/** Dust devils' tracks, starting anywhere on a square `span` across: long wandering dark streaks where they swept the bright dust off (darker only: blue is brightness). */
function tracks(r: Rng, span: number): string {
  let out = '';
  for (let i = r.int(1, 4); i > 0; i--) {
    let { x, y } = { x: r.range(0, span), y: r.range(0, span) };
    let a = r.range(0, 2 * Math.PI);
    let d = `M${n(x)},${n(y)}`;
    for (let s = 0; s < 8; s++) {
      a += r.range(-0.7, 0.7);
      const [mx, my] = [x + 9 * Math.cos(a), y + 9 * Math.sin(a)];
      [x, y] = [mx + 9 * Math.cos(a), my + 9 * Math.sin(a)];
      d += ` Q${n(mx)},${n(my)} ${n(x)},${n(y)}`;
    }
    out += `<path d="${d}" fill="none" stroke="rgb(255,255,${r.int(120, 160)})" stroke-width="${n(r.range(1.5, 3.5))}" stroke-linecap="round"/>`;
  }
  return `<g style="mix-blend-mode: multiply" filter="url(#rg-soft1)">${out}</g>`;
}

/** Bright streaks where dust slid down a slope, each a fan of a few tapering ones (lighter only: blue is brightness). */
function streaks(r: Rng, at: Strew): string {
  let out = '';
  for (let i = r.int(2, 4); i > 0; i--) {
    const { x, y } = at(r, 30);
    const a = r.range(0, 2 * Math.PI);
    for (let j = r.int(3, 6); j > 0; j--) {
      const b = a + r.range(-0.35, 0.35);
      const [ox, oy] = [x + r.range(-6, 6), y + r.range(-6, 6)];
      const [len, w] = [r.range(14, 34), r.range(1.5, 4)];
      const [px, py] = [(-Math.sin(b) * w) / 2, (Math.cos(b) * w) / 2];
      out += `<path d="M${n(ox + px)},${n(oy + py)} L${n(ox + len * Math.cos(b))},${n(oy + len * Math.sin(b))} L${n(ox - px)},${n(oy - py)} Z" fill="rgb(0,0,${r.int(200, 240)})"/>`;
    }
  }
  return `<g style="mix-blend-mode: lighten" opacity="0.9" filter="url(#rg-soft1)">${out}</g>`;
}

/** The weathering filters, `rg-wx-*`: a young, middle-aged and old crater's, the pits' and the dunes'. The bases' sinkhole and ice pit use them too. */
export const weathering = (r: Rng) =>
  weather('rg-wx-y', 0.07, r.noiseSeed(), 5, 0.5) +
  weather('rg-wx-m', 0.06, r.noiseSeed(), 7, 1.3) +
  weather('rg-wx-o', 0.05, r.noiseSeed(), 10, 2.6) +
  weather('rg-wx-p', 0.3, r.noiseSeed(), 1.8, 0.6, 'x="0" y="0" width="100%" height="100%"') +
  weather('rg-wx-d', 0.02, r.noiseSeed(), 14, 0.4);

/**
 * Deimos's terrain: smoother than Phobos's, its dust deep enough to bury most craters, leaving a fresh one now
 * and then, fewer pits, a low ridge at most, boulders, and bright streaks down the slopes.
 */
function deimos(r: Rng, at: Strew): string {
  return (
    ridges(r, at, 1) +
    craters(r, at, 'b', r.int(2, 4), 0.6, 1.6) +
    craters(r, at, 'o', r.int(0, 1), 0.4, 0.9) +
    craters(r, at, 'y', r.int(0, 1), 0.24, 0.45) +
    streaks(r.fork('streaks'), at) +
    pits(r.fork('pits'), at, [
      [22, 0.45, 1],
      [6, 1.2, 4],
    ]) +
    boulders(r.fork('boulders'), at, r.int(1, 2), 10)
  );
}

/** Up to `max` low ridges. */
const ridges = (r: Rng, at: Strew, max: number) =>
  Array.from({ length: r.int(0, max) }, () => {
    const { x, y } = at(r, 34);
    return `<use href="#rg-ridge" transform="translate(${n(x)},${n(y)}) rotate(${r.int(-40, 40)})"/>`;
  }).join('');

/**
 * A tile's terrain on `world` as a height map over all that's drawn (`DRAWN`): level ground, on Mars dunes
 * and dust devils' tracks, a ridge or two, craters of every age, pits and boulders; Deimos's its own.
 */
export const terrain = (r: Rng, world: World): string => LEVEL(DRAWN) + features(r, world, anywhere);

/** Level ground over `area`, for features to stand on and carve. */
export const LEVEL = (area: Box) => `<rect ${region(area)} fill="rgb(128,0,128)"/>`;

/** A tile's worth of the terrain's features on `world`, each where `at` puts it; dust devils' tracks start anywhere on a square `span` across. */
export function features(r: Rng, world: World, at: Strew, span = SIZE): string {
  if (world === 'deimos') return deimos(r, at);
  const mars = world === 'mars';
  return (
    (mars ? dunes(r.fork('dunes'), at) + tracks(r.fork('tracks'), span) : '') +
    ridges(r, at, 2) +
    craters(r, at, 'o', r.int(1, 2), 0.6, 1.4) +
    (r.chance(0.25) ? craters(r, at, 'big', 1, 0.8, 1.05) : '') +
    craters(r, at, 'm', r.int(1, 2), 0.32, 0.8) +
    craters(r, at, 'y', r.int(1, 2), 0.24, 0.6) +
    // As many on the flower as there were when they were strewn past the tile's square too.
    pits(r.fork('pits'), at, [
      [55, 0.45, 1.12],
      [21, 1.2, 5.6],
    ]) +
    boulders(r.fork('boulders'), at, 1, 15)
  );
}
