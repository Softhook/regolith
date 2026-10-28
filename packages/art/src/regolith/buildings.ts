import type { Rng } from '../rng';
import { n } from '../svg';
import type { Spot } from '../tile/geometry';
import { polar } from './core';
import { LIT, WELL } from './inks';
import { H, type Part, placed, merged, disc, square, box, graded, glow, lamp, run } from './parts';

/** The buildings of the Regolith bases, each a `Part` drawn round its own middle: hubs, domes, tanks, towers, pits and the rest. */

/**
 * The outline of a deck round three sockets, two side by side over one between them, `e` out from their
 * centres (`cubePadCentres` order): a bar over a block, its corners rounded to `round` and the corners where they meet filled to `fill`.
 */
function trefoil(pads: readonly Spot[], e: number, round: number, fill: number): string {
  const [left, right, below] = pads;
  const cx = below.x;
  const X = (right.x - left.x) / 2 + e;
  const [T, B1, B2] = [left.y - e, left.y + e, below.y + e];
  const [r, f] = [round, fill];
  const at = (x: number, y: number) => `${n(cx + x)},${n(y)}`;
  const arc = (rad: number, sweep: number, x: number, y: number) => `A${n(rad)},${n(rad)} 0 0 ${sweep} ${at(x, y)}`;
  return (
    `M${at(-X + r, T)} L${at(X - r, T)} ${arc(r, 1, X, T + r)} L${at(X, B1 - r)} ${arc(r, 1, X - r, B1)} ` +
    `L${at(e + f, B1)} ${arc(f, 0, e, B1 + f)} L${at(e, B2 - r)} ${arc(r, 1, e - r, B2)} ` +
    `L${at(-e + r, B2)} ${arc(r, 1, -e, B2 - r)} L${at(-e, B1 + f)} ${arc(f, 0, -e - f, B1)} ` +
    `L${at(-X + r, B1)} ${arc(r, 1, -X, B1 - r)} L${at(-X, T + r)} ${arc(r, 1, -X + r, T)} Z`
  );
}

/** The hub deck's dashed amber edge. */
const EDGE = ' stroke="#F2B233" stroke-width="0.7" stroke-dasharray="3 2" opacity="0.55"';

/** How a hub's cube wells are coloured, apart from its deck: their colour, and a wash of a lighter one over them (colour and opacity). */
export interface Wells {
  tint: string;
  wash?: [string, number];
}

/** A hub's frame, the band round its edge, coloured apart from the deck. */
export interface Frame {
  tint?: string;
  /** A band of paint along its edge: colour and opacity. */
  band?: [string, number];
}

const bandOf = (band?: [string, number]) => (band ? ` stroke="${band[0]}" stroke-width="4.5" opacity="${band[1]}"` : '');

/** The wells' own colour and wash, over the deck's. */
const wellsOf = (pads: readonly Spot[], wells?: Wells): Pick<Part, 'tint' | 'paint'> => {
  if (!wells) return {};
  const each = (fill: string) => pads.map((p) => square(p.x, p.y, 24.5, 3.4, fill)).join('');
  return {
    tint: WELL(each(wells.tint)),
    paint: wells.wash ? WELL(`<g opacity="${wells.wash[1]}">${each(wells.wash[0])}</g>`) : '',
  };
};

/**
 * The hub: a deck round the planet's cube sockets (`cubePadCentres`, one per cube it holds), no larger
 * than they need, edged in amber, a light at a corner: round three, the three squares' own
 * shape, smoothed; otherwise a box.
 */
export function hub(pads: readonly Spot[], deck: string, height = H.deck, light = '#F2B233', wells?: Wells, frame?: Frame): Part {
  const xs = pads.map((p) => p.x);
  const ys = pads.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 15, Math.max(...xs) + 15, Math.min(...ys) - 15, Math.max(...ys) + 15];
  const [w, h, cx, cy] = [x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2];
  const wellArt = wellsOf(pads, wells);
  const sockets = pads.map((p) => square(p.x, p.y, 24.5, 3.4, H.socket)).join('');
  const grade = graded(cx, cy, Math.max(w, h) / 2 + 12);
  if (pads.length === 3) {
    // Grown by `g` (shrunk if less than 0), as the boxes are; the rounding and the fill share the 13.5 the bar
    // overhangs the block by.
    const shape = (g: number, fill: string, extra = '') => `<path d="${trefoil(pads, 15 + g, 5 + g / 2, 7 - g)}" fill="${fill}"${extra}/>`;
    return {
      grade,
      heights: shape(1.5, H.apron) + shape(0, height) + sockets,
      // The deck's colour reaches out over the apron round it, so no bare grey shows at its edge.
      tint: (frame?.tint ? shape(1.5, frame.tint) + shape(-2.5, deck) : shape(1.5, deck)) + (wellArt.tint ?? ''),
      paint:
        (frame?.band ? shape(-0.8, 'none', bandOf(frame.band)) : '') +
        shape(-2, 'none', EDGE) +
        (wellArt.paint ?? '') +
        lamp(x0 + 3, y0 + 3, light) +
        lamp(pads[2].x + 12, y1 - 3, light),
    };
  }
  return {
    grade,
    heights: box(cx, cy, w + 3, h + 3, 4, H.apron) + box(cx, cy, w, h, 3.5, height) + sockets,
    tint:
      (frame?.tint ? box(cx, cy, w + 3, h + 3, 4, frame.tint) + box(cx, cy, w - 5, h - 5, 2, deck) : box(cx, cy, w + 3, h + 3, 4, deck)) +
      (wellArt.tint ?? ''),
    paint: box(cx, cy, w - 4, h - 4, 2.5, 'none', EDGE) + (wellArt.paint ?? '') + lamp(x0 + 3, y0 + 3, light) + lamp(x1 - 3, y1 - 3, light),
  };
}

/** A glass dome `size` across, its plants glowing through it; its frame starts `clear` out from its middle, past a hatch there. */
export function dome(size: number, glass: string, plants: string, clear = 0): Part {
  const spokes = [0, 60, 120, 180, 240, 300]
    .map((a) => {
      const [p, q] = [polar(a, clear), polar(a, size)];
      return `M${n(p.x)},${n(p.y)} L${n(q.x)},${n(q.y)}`;
    })
    .join(' ');
  const rings = [0.5, 0.85, 0.94].filter((k) => k * size > clear + 1);
  return {
    grade: graded(0, 0, size + 7),
    heights: disc(0, 0, size + 2, H.deck) + disc(0, 0, size, 'url(#rg-glass)'),
    tint: disc(0, 0, size + 2.5, '#8d969c') + disc(0, 0, size, glass),
    paint:
      glow(0, 0, size * 0.65, plants, 0.45) +
      `<g fill="none" stroke="#1e2426" stroke-width="0.5" opacity="0.55">${rings.map((k) => `<circle r="${n(size * k)}"/>`).join('')}<path d="${spokes}"/></g>` +
      `<ellipse cx="${n(-size * 0.35)}" cy="${n(-size * 0.4)}" rx="${n(size * 0.3)}" ry="${n(size * 0.18)}" transform="rotate(-40 ${n(-size * 0.35)} ${n(-size * 0.4)})" fill="#fff" opacity="0.22" filter="url(#rg-soft1)"/>`,
  };
}

/** Up to `count` things in a row `gap` apart, centred on 0. */
const row = (count: number, gap: number) => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * gap);

/** Small blue domes, one to three, joined in a line. */
export function domelets(r: Rng): Part {
  const xs = row(r.int(1, 3), 26);
  return {
    extent: (xs.length - 1) * 13 + 13,
    ...merged([
      ...(xs.length > 1 ? [run({ x: xs[0], y: 0 }, { x: xs[xs.length - 1], y: 0 }, 5, '#a7b0b6')] : []),
      ...xs.map((x) => placed(x, r.range(-3, 3), dome(r.range(6.5, 10), '#4b93b5', '#8fe8ff'))),
    ]),
  };
}

/** Solar panels, one or two rows of two to four, across the way they're turned. */
export function solar(r: Rng): Part {
  const cells = row(r.int(2, 4), 10.5).flatMap((x) => row(r.pick([1, 2, 2]), 8.4).map((y) => ({ x, y })));
  const each = (f: (c: Spot) => string) => cells.map(f).join('');
  const span = Math.max(...cells.map((c) => Math.abs(c.x))) + 6;
  return {
    extent: Math.hypot(span, Math.max(...cells.map((c) => Math.abs(c.y))) + 3.5),
    grade: graded(0, 0, span + 6),
    heights: box(0, 0, 3, 18, 0.5, H.pipe) + each((c) => box(c.x, c.y, 9.5, 7, 0.5, H.panel)),
    tint: each((c) => box(c.x, c.y, 9.5, 7, 0.5, '#2448b8')),
    paint:
      each((c) => box(c.x, c.y, 9.5, 7, 0.5, 'none', ' stroke="#bfe6ff" stroke-width="0.3" opacity="0.6"')) +
      each(
        (c) =>
          `<path d="M${n(c.x - 4.75)},${n(c.y)} H${n(c.x + 4.75)} M${n(c.x)},${n(c.y - 3.5)} V${n(c.y + 3.5)}" stroke="#bfe6ff" stroke-width="0.2" opacity="0.4"/>`,
      ) +
      glow(-6, -2, 6, '#9fd8ff', 0.18),
  };
}

/** A sphere tank, gold, banded. */
const tank = (x: number, y: number, r: number): Part => ({
  heights: disc(x, y, r + 1.2, H.apron) + disc(x, y, r, 'url(#rg-sphere)'),
  tint: disc(x, y, r + 1, '#f2ad2c'),
  paint:
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.62)}" fill="none" stroke="#5b3a08" stroke-width="0.6" opacity="0.5"/>` +
    disc(x - r * 0.35, y - r * 0.35, r * 0.28, '#fffbe8', ' opacity="0.7" filter="url(#rg-soft1)"'),
});

/** Two to four gold tanks in a huddle, sizes mixed, far enough apart that none touches the next. */
export function tankFarm(r: Rng): Part {
  const count = r.int(2, 4);
  // Tanks up to 12.2 across with their aprons, a little clear ground between.
  const spread = [13, 15, 18][count - 2];
  const turn = r.range(0, 360);
  const spots = Array.from({ length: count }, (_, i) => polar(turn + (360 * i) / count, spread));
  const deck = spread * 0.75;
  return {
    extent: spread + 12.2,
    ...merged([
      { grade: graded(0, 0, 32) },
      // A low platform in the middle, where the pipe comes in, piped out to each tank.
      ...spots.map((s) => run({ x: 0, y: 0 }, s, 2.4, '#f2ad2c')),
      { heights: disc(0, 0, deck + 1, H.apron) + disc(0, 0, deck, H.deck), tint: disc(0, 0, deck + 0.5, '#8e8a86') },
      ...spots.map((s) => tank(s.x, s.y, r.range(8, 11))),
      { paint: lamp(0, 0, '#ffcf4a') },
    ]),
  };
}

/** Gas burning off the top of a stack: a hot core in a glow `halo` across, of `opacity`. */
const flame = (halo: number, opacity: number) =>
  glow(-1, -1, halo, '#ff6a10', opacity, 'rg-soft6') +
  glow(-1, -1, 5, '#ff9a2a', 0.85) +
  glow(-1, -1, 2.2, '#ffe9a0', 1, 'rg-soft1') +
  disc(-1, -1, 0.9, '#fff');

/** One or two tall flare stacks, burning off gas. */
export function flares(r: Rng): Part {
  const xs = row(r.pick([1, 1, 2]), 15);
  return {
    extent: (xs.length - 1) * 7.5 + 8,
    ...merged(
      xs.map((x) =>
        placed(x, 0, {
          grade: graded(0, 0, 14),
          heights: square(0, 0, 11, 1, H.dark) + disc(0, 0, 3.2, 'rgb(250,120,200)'),
          tint: square(0, 0, 11.5, 1, '#55504a') + disc(0, 0, 3.4, '#c9c4bc'),
          paint: flame(11, 0.55),
        }),
      ),
    ),
  };
}

/**
 * A refinery's tower: a tall stack, banded red and white, ringed by a walkway, burning off gas at its top.
 */
export const stack = (): Part => ({
  extent: 8,
  grade: graded(0, 0, 13),
  heights:
    disc(0, 0, 8, H.apron) +
    `<circle r="7" fill="none" stroke="${H.pipe}" stroke-width="1.2"/>` +
    disc(0, 0, 5.4, 'url(#rg-sphere)') +
    disc(0, 0, 2.2, 'rgb(255,120,235)'),
  tint:
    disc(0, 0, 8, '#55504a') +
    `<circle r="7" fill="none" stroke="#8e8a86" stroke-width="1.4"/>` +
    disc(0, 0, 5.6, '#e8e2d4') +
    `<circle r="4.3" fill="none" stroke="#c8321f" stroke-width="1.4"/>` +
    `<circle r="2.2" fill="none" stroke="#c8321f" stroke-width="1.2"/>`,
  paint:
    `<circle r="7" fill="none" stroke="#ffd27a" stroke-width="0.3" stroke-dasharray="1 1.2" opacity="0.6"/>` +
    flame(12, 0.5) +
    lamp(5.2, 5.2, '#ff3b2a'),
});

/** An open pit stepping down to glowing ice, three to five benches deep. */
export function pit(r: Rng): Part {
  const steps = r.int(3, 5);
  const outer = r.range(19, 26);
  return {
    extent: outer,
    // Dug ground, not built: lit with the surface.
    grade:
      graded(0, 0, outer + 6) +
      Array.from({ length: steps }, (_, i) => {
        const k = i / steps;
        return disc(
          0,
          0,
          outer * (1 - k * 0.8),
          `rgb(${n(116 - k * 64)},${n(170 + k * 80)},${n(150 + k * 80)})`,
          i ? '' : ' filter="url(#rg-wx-y)"',
        );
      }).join(''),
    tint: disc(0, 0, outer, '#bfd9e6'),
    paint:
      glow(0, 0, outer * 0.55, '#3fe6ff', 0.55, 'rg-soft6') +
      glow(0, 0, outer * 0.27, '#7ff5ff', 0.85) +
      `<path d="M-3,-2 L1,-4 L4,0 L1,3 L-2,2 Z" fill="#effeff" opacity="0.85" filter="url(#rg-soft1)"/>` +
      `<circle r="${n(outer)}" fill="#eaf6ff" opacity="0.18" filter="url(#rg-soft3)" style="mix-blend-mode: screen"/>`,
  };
}

/** A drill rig: a lattice tower, its light on top. */
export const rig = (): Part => ({
  extent: 9.5,
  grade: graded(0, 0, 14),
  heights:
    `<rect x="-6.5" y="-6.5" width="13" height="13" fill="none" stroke="${H.pipe}" stroke-width="2"/>` +
    `<path d="M-6.5,-6.5 L6.5,6.5 M6.5,-6.5 L-6.5,6.5" stroke="rgb(220,120,200)" stroke-width="1.6"/>` +
    disc(0, 0, 2.6, 'rgb(250,120,210)'),
  tint: square(0, 0, 15, 0, '#e8eef2'),
  paint: `<path d="M-6.5,-6.5 L6.5,6.5 M6.5,-6.5 L-6.5,6.5" stroke="#fff" stroke-width="0.4" opacity="0.5"/>` + lamp(0, 0, '#ff3b3b'),
});

/** Two to four ice silos, white with blue caps. */
export function silos(r: Rng): Part {
  const xs = row(r.int(2, 4), 13.5);
  return {
    extent: (xs.length - 1) * 6.75 + 6,
    grade: graded(0, 0, xs.length * 5.5 + 8),
    heights: xs.map((x) => disc(x, 0, 5.6, 'url(#rg-dome)')).join(''),
    tint: xs.map((x) => disc(x, 0, 6, '#eef5fb')).join(''),
    paint: xs.map((x) => disc(x, 0, 2.2, '#2f8fff', ' opacity="0.9"') + disc(x - 0.6, -0.6, 0.7, '#dff1ff')).join(''),
  };
}

/** A cooling tower: a dark ring round a hot glowing throat. */
export const coolingTower = (): Part => ({
  extent: 15.5,
  grade: graded(0, 0, 21),
  heights: disc(0, 0, 15.5, H.apron) + disc(0, 0, 14.5, 'rgb(240,170,50)') + disc(0, 0, 10, 'rgb(70,200,40)'),
  tint: disc(0, 0, 15.5, '#2e2c30'),
  paint:
    glow(0, 0, 10, '#ff3c0a', 0.75, 'rg-soft3') +
    glow(0, 0, 5.5, '#ffa41f', 0.9) +
    glow(0, 0, 2.4, '#fff1b0', 1, 'rg-soft1') +
    `<circle r="12.3" fill="none" stroke="#ff7a1a" stroke-width="0.5" stroke-dasharray="1 2.2" opacity="0.8"/>`,
});

/** Three to six radiator fins, black, heat glowing between them. */
export function radiators(r: Rng): Part {
  const xs = row(r.int(3, 6), 6);
  const len = r.range(18, 26);
  const gaps = xs.slice(1).map((x) => x - 3);
  return {
    extent: Math.hypot(xs.length * 3, len / 2 + 0.5),
    grade: graded(0, 0, Math.max(len / 2, xs.length * 3) + 8),
    heights: xs.map((x) => box(x, 0, 3.2, len, 0.6, 'rgb(220,150,45)')).join(''),
    tint: box(0, 0, xs.length * 6 - 2, len + 1, 1, '#2a282c'),
    paint:
      gaps
        .map(
          (x) =>
            `<path d="M${n(x)},${n(-len / 2 + 1)} V${n(len / 2 - 1)}" stroke="#ff6a00" stroke-width="1.6" opacity="0.6" filter="url(#rg-soft1)" style="mix-blend-mode: screen"/>`,
        )
        .join('') +
      gaps
        .map((x) => `<path d="M${n(x)},${n(-len / 2 + 2)} V${n(len / 2 - 2)}" stroke="#ffc060" stroke-width="0.4" opacity="0.9"/>`)
        .join(''),
  };
}

/** A conduit carrying power, glowing along its length. */
export function conduit(a: Spot, b: Spot, colour: string): Part {
  const d = `M${n(a.x)},${n(a.y)} L${n(b.x)},${n(b.y)}`;
  return {
    ...run(a, b, 4, '#2a282c', H.dark),
    paint: LIT(
      `<path d="${d}" stroke="${colour}" stroke-width="3.5" opacity="0.5" filter="url(#rg-soft1)" style="mix-blend-mode: screen"/>` +
        `<path d="${d}" stroke="#ffe2a0" stroke-width="0.6" stroke-dasharray="3 2"/>`,
    ),
  };
}

/** Cargo containers set down in rows, three to seven, a few askew, in the usual colours. */
export function containers(r: Rng): Part {
  let heights = '';
  let tint = '';
  let paint = '';
  // Slots in a grid, each a container's length and width with a gap, taken at random.
  const slots = row(2, 13).flatMap((x) => row(3, 7.5).map((y) => ({ x, y, k: r.next() })));
  for (const { x: sx, y: sy } of slots.sort((a, b) => a.k - b.k).slice(0, r.int(3, 6))) {
    const [x, y] = [sx + r.range(-0.6, 0.6), sy + r.range(-0.4, 0.4)];
    const turn = r.chance(0.25) ? r.range(-8, 8) : 0;
    const at = `translate(${n(x)},${n(y)}) rotate(${n(turn)})`;
    heights += `<g transform="${at}">${box(0, 0, 11, 5, 0.5, r.chance(0.3) ? 'rgb(214,150,200)' : 'rgb(182,150,200)')}</g>`;
    tint += `<g transform="${at}">${box(0, 0, 11, 5, 0.5, r.pick(['#d9622b', '#e8e2d4', '#2f6fd0', '#c9a227', '#b8322a']))}</g>`;
    paint += `<g transform="${at}"><path d="M-3.5,-2.5 V2.5 M0,-2.5 V2.5 M3.5,-2.5 V2.5" stroke="#000" stroke-width="0.3" opacity="0.3"/></g>`;
  }
  return { extent: 17, grade: graded(0, 0, 20), heights, tint, paint };
}

/** A dish aerial on its mount, turned to the sky. */
export const dish = (light: string): Part => ({
  extent: 9,
  grade: graded(0, 0, 13),
  heights: disc(0, 0, 9, H.apron) + disc(0, 0, 8, 'rgb(236,150,215)') + disc(1, 1, 5.5, 'rgb(196,200,215)', ' filter="url(#rg-soft1)"'),
  tint: disc(0, 0, 9, '#e9ecee'),
  paint: `<path d="M1,1 L-4,-4" stroke="#2a2d30" stroke-width="0.8"/>` + lamp(-4, -4, light),
});

/** Crystals jutting from the ground, violet, catching light. */
export function crystals(r: Rng, count: number, reach: number): Part {
  let heights = '';
  let tint = '';
  let paint = '';
  for (let i = 0; i < count; i++) {
    const a = r.range(0, 360);
    const d = reach * r.range(0.85, 1.12);
    const { x, y } = polar(a, d);
    const [len, w] = [r.range(8, 15), r.range(2.5, 4.5)];
    const shard = `M0,${n(-w)} L${n(len)},0 L0,${n(w)} L${n(-len * 0.25)},0 Z`;
    const at = `translate(${n(x)},${n(y)}) rotate(${n(a + r.range(-30, 30))})`;
    heights += `<path d="${shard}" transform="${at}" fill="rgb(245,230,240)"/>`;
    tint += `<path d="${shard}" transform="${at}" fill="#9a5cff" stroke="#9a5cff" stroke-width="1"/>`;
    paint +=
      `<path d="M0,0 L${n(len)},0" transform="${at}" stroke="#f1e4ff" stroke-width="0.5" opacity="0.8"/>` +
      `<path d="${shard}" transform="${at}" fill="#b07bff" opacity="0.5" filter="url(#rg-soft1)" style="mix-blend-mode: screen"/>`;
  }
  return { heights, tint, paint };
}

/** Glowing cracks running out from a point, jagged, `reach` long. */
export function fissures(r: Rng, count: number, from: number, reach: number): Part {
  // Cracks in the ground, lit with it.
  let grade = '';
  let paint = '';
  for (let i = 0; i < count; i++) {
    let a = r.range(0, 2 * Math.PI);
    let [x, y] = [from * Math.cos(a), from * Math.sin(a)];
    let d = `M${n(x)},${n(y)}`;
    for (let s = 0; s < 6; s++) {
      a += r.range(-0.5, 0.5);
      const step = reach / 6;
      [x, y] = [x + step * Math.cos(a), y + step * Math.sin(a)];
      d += ` L${n(x)},${n(y)}`;
    }
    grade += `<path d="${d}" fill="none" stroke="rgb(80,0,128)" stroke-width="2" stroke-linejoin="round"/>`;
    paint +=
      `<path d="${d}" fill="none" stroke="#a46bff" stroke-width="4" opacity="0.45" filter="url(#rg-soft1)" style="mix-blend-mode: screen"/>` +
      `<path d="${d}" fill="none" stroke="#e2ccff" stroke-width="0.7" stroke-linejoin="round" opacity="0.9"/>`;
  }
  return { grade, paint };
}

/**
 * Phobos's Mass Driver: an electromagnetic rail `reach` out either way along the y axis (across the hub's
 * two sockets), two bars on cross-ties with accelerator coils round it, glowing blue-white and closer
 * together towards the muzzle at the top, and ice pods waiting in a cradle at the foot.
 */
export function railgun(reach: number): Part {
  const bars = (fill: string) => [-3.6, 3.6].map((x) => box(x, 0, 2.2, reach * 2, 0.6, fill)).join('');
  const ties = Array.from({ length: 15 }, (_, i) => -reach + 6 + (i * (2 * reach - 12)) / 14);
  const coils = Array.from({ length: 7 }, (_, i) => -reach + 12 + i * (6 + i * 1.6));
  const pods = [34, 44].map((y) => y + reach * 0.3);
  return {
    extent: reach,
    grade: `<rect x="-12" y="${n(-reach - 4)}" width="24" height="${n(reach * 2 + 8)}" rx="10" fill="${H.graded}" filter="url(#rg-soft6)"/>`,
    heights:
      ties.map((y) => box(0, y, 11, 1.6, 0.4, H.pipe)).join('') +
      bars(H.deck) +
      coils.map((y) => box(0, y, 15, 3.4, 1, H.dark)).join('') +
      pods.map((y) => box(0, y, 6, 8, 3, 'rgb(190,160,200)')).join(''),
    tint:
      ties.map((y) => box(0, y, 11, 1.6, 0.4, '#4a4640')).join('') +
      bars('#d8d4cc') +
      coils.map((y) => box(0, y, 15, 3.4, 1, '#3a3a44')).join('') +
      pods.map((y) => box(0, y, 6, 8, 3, '#e8f1f6')).join(''),
    paint:
      coils.map((y) => glow(0, y, 6, '#7fd8ff', 0.55, 'rg-soft1')).join('') +
      glow(0, -reach + 4, 9, '#bfeaff', 0.7) +
      lamp(0, reach - 2, '#ffcf4a'),
  };
}

/**
 * Deimos's Skyhook: the anchor of a tether that climbs to orbit. A gold-banded mast stands tall (so its
 * shadow is long), guyed by two cables back to anchor blocks `reach` out, and the tether goes up from its top
 * as a faint bright line running off towards `lift` degrees.
 */
export function skyhook(reach: number, lift: number): Part {
  const anchors = [lift + 115, lift - 115].map((a) => polar(a, reach));
  const guys = anchors.map((p) => run({ x: 0, y: 0 }, p, 0.9, '#c9c2b4', H.pipe));
  const up = polar(lift, 90);
  const tether = `M0,0 L${n(up.x)},${n(up.y)}`;
  return {
    extent: reach + 12,
    ...merged([
      ...guys,
      {
        grade: anchors.map((p) => graded(p.x, p.y, 12)).join('') + graded(0, 0, 22),
        heights:
          anchors.map((p) => box(p.x, p.y, 10, 10, 2, H.deck)).join('') +
          disc(0, 0, 13, H.apron) +
          disc(0, 0, 10, 'rgb(250,150,210)') +
          disc(0, 0, 6.5, 'rgb(255,190,235)') +
          disc(0, 0, 3.2, 'rgb(255,230,245)'),
        tint:
          anchors.map((p) => box(p.x, p.y, 10, 10, 2, '#7c766c')).join('') +
          disc(0, 0, 13, '#55504a') +
          disc(0, 0, 10, '#e8e2d4') +
          `<circle r="8" fill="none" stroke="#d9a020" stroke-width="1.8"/>` +
          `<circle r="4.6" fill="none" stroke="#c8321f" stroke-width="1.4"/>` +
          disc(0, 0, 3.2, '#d9a020'),
        paint:
          `<path d="${tether}" fill="none" stroke="#fff3c8" stroke-width="4" opacity="0.4" filter="url(#rg-soft3)" style="mix-blend-mode: screen"/>` +
          `<path d="${tether}" fill="none" stroke="#fff8dc" stroke-width="0.9" stroke-dasharray="4 2.5" opacity="0.95"/>` +
          glow(0, 0, 9, '#ffe9a0', 0.8, 'rg-soft1') +
          anchors.map((p) => lamp(p.x, p.y, '#ff6a3a')).join(''),
      },
    ]),
  };
}
