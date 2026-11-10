import type { Rng } from '../rng';
import { n } from '../svg';
import type { Spot } from '../tile/geometry';
import { polar } from './core';
import { KEEP, LIT } from './inks';
import { H, biohazard, nuclear, type Part, type Drawn, placed, merged, disc, square, box, graded, glow, lamp, run } from './parts';
import { hub, dome, stack, tank, torus, column, cutter, hoop } from './buildings';
import type { Taken } from './landmarks';

/**
 * The middles of the 7 to 10 bases, one for each tile of a number (tile/set.ts `DESIGN_TILES`), so no two
 * tiles of an objective look alike. Each keeps its objective's hub, colours and outbuildings, so a Habitat
 * still reads as a Habitat: only what the hub stands in changes.
 */

/** What base.ts lends a base's middle: the tile's random numbers, the sockets, the ways out, the ground and links already taken, and its ways of laying out outbuildings and small things. */
interface CoreKit {
  r: Rng;
  pads: Spot[];
  /** The ways out to the next hexes, best first. */
  ways: number[];
  taken: Taken[];
  links: [Spot, Spot][];
  /** The number's outbuildings out along the ways that aren't `blocked` (±40°), clear of the hub `hubReach` across. */
  outskirts: (hubReach: number, blocked?: number[]) => Part[];
  /** Small things round what stands, `hubReach` across. */
  around: (hubReach: number) => Part[];
  /** The collars the outbuildings' pipes go into the hub through, drawn over it: filled by `outskirts`. */
  collars: Part[];
  /** A collar on the hub's side at `s`, facing `out`, round a pipe `w` wide. */
  collar: (s: Spot, out: Spot, w: number) => Part;
  deck: string;
}

type Core = (k: CoreKit) => Drawn;

/** A point turned `turn` degrees round the origin. */
const rot = (p: Spot, turn: number): Spot => {
  const [c, s] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

const pts = (list: Spot[]) => list.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');

/** A flat-topped hexagon `R` across its corners round (x, y). */
const hexagon = (x: number, y: number, R: number, fill: string, extra = '') =>
  `<polygon points="${pts([0, 60, 120, 180, 240, 300].map((a) => ({ x: x + polar(a, R).x, y: y + polar(a, R).y })))}" fill="${fill}"${extra}/>`;

/** Circles along the line from a to b, `r` across, `step` apart, for the ground it takes. */
const along = (a: Spot, b: Spot, r: number, step = 10): Taken[] => {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return Array.from({ length: Math.max(1, Math.ceil(d / step)) + 1 }, (_, i) => {
    const t = Math.min(1, (i * step) / (d || 1));
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r };
  });
};

/** A part's every layer turned `turn` degrees round the origin. */
const turnedPart = (p: Part, turn: number) => placed(0, 0, p, turn);

// ─────────────────────────────────────────────── 7 ───────────────────────────────────────────────

const GLASS = 'rgb(205,255,135)';
const habitat = (k: CoreKit) => hub(k.pads, '#9aa3a8', 'rgb(246,160,205)', '#7dffb0');

/** The hub's own plain deck, round, as a core whose glass doesn't reach under it stands on. */
const hubDeck: Part = { heights: disc(0, 0, 22, H.apron) + disc(0, 0, 21, H.deck), tint: disc(0, 0, 22, '#8d969c') };

/** Glass the hub stands on, its glow and glazing kept off the hub, so the hub shows clear, as it does on a plain deck. */
function underHub(k: CoreKit, parts: Part[]): Part {
  const half = Math.max(...k.pads.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])) + 17;
  const id = `rg-clear${Math.round(half)}`;
  const hole = `M${n(-half)},${n(-half)} V${n(half)} H${n(half)} V${n(-half)} Z`;
  const clip = `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="M-500,-500 H500 V500 H-500 Z ${hole}"/></clipPath>`;
  const m = merged(parts);
  return { ...m, paint: `${clip}<g clip-path="url(#${id})">${m.paint}</g>` };
}

/** A run of glazing, a long greenhouse tunnel `len` by `w` round (x, y): its frame, its glass, ribs across it, plants glowing green under it. */
function tunnel(x: number, y: number, len: number, w: number): Part {
  const ribs = Array.from({ length: Math.floor(len / 5) }, (_, i) => `M${n(x - len / 2 + 2.5 + i * 5)},${n(y - w / 2)} v${n(w)}`).join(' ');
  return {
    grade: box(x, y, len + 10, w + 10, 6, H.graded, ' filter="url(#rg-soft3)"'),
    heights:
      box(x, y, len + 3, w + 3, (w + 3) / 2, H.deck) +
      box(x, y, len, w, w / 2, GLASS) +
      box(x, y, len - 4, w * 0.3, 1.5, 'rgb(240,255,150)', ' filter="url(#rg-soft1)"'),
    tint: box(x, y, len + 3.5, w + 3.5, (w + 3) / 2, '#8d969c') + box(x, y, len, w, w / 2, '#4a9c7a'),
    paint:
      LIT(box(x, y, len - 2, w * 0.7, 3, '#6dff9e', ' opacity="0.4" filter="url(#rg-soft3)" style="mix-blend-mode: screen"')) +
      `<path d="${ribs}" stroke="#1e2426" stroke-width="0.5" opacity="0.5"/>` +
      box(x, y - w * 0.22, len - 6, w * 0.15, 1, '#fff', ' opacity="0.25" filter="url(#rg-soft1)"'),
  };
}

/** A glazed hexagonal cell `R` across, its glass `glass`, its panes in triangles. */
function cell(x: number, y: number, R: number, glass: string): Part {
  const spokes = [0, 60, 120, 180, 240, 300].map((a) => `M${n(x)},${n(y)} l${n(polar(a, R).x)},${n(polar(a, R).y)}`).join(' ');
  return {
    grade: hexagon(x, y, R + 6, H.graded, ' filter="url(#rg-soft3)"'),
    heights: hexagon(x, y, R + 1.8, H.deck) + hexagon(x, y, R, GLASS),
    tint: hexagon(x, y, R + 2.2, '#8d969c') + hexagon(x, y, R, glass),
    paint:
      glow(x, y, R * 0.6, '#6dff9e', 0.4) +
      `<g fill="none" stroke="#1e2426" stroke-width="0.5" opacity="0.5"><path d="${spokes}"/>${hexagon(x, y, R * 0.55, 'none')}</g>` +
      disc(x - R * 0.3, y - R * 0.35, R * 0.22, '#fff', ' opacity="0.2" filter="url(#rg-soft1)"'),
  };
}

/** The great dome: its hatch, on top, holds the cube. */
const greatDome: Core = (k) => {
  const great = k.r.range(25, 30);
  return merged([...k.outskirts(great + 2.5), underHub(k, [dome(great, '#4a9c7a', '#6dff9e', 22)]), habitat(k), ...k.around(great + 2.5)]);
};

/** A smaller dome over the hatch, three or four more round it, each joined to it by a short tube. */
const warren: Core = (k) => {
  const { r, taken } = k;
  const core = r.range(23, 25);
  const turn = r.range(0, 360);
  const count = 3;
  const pods = Array.from({ length: count }, (_, i) => {
    const size = r.range(11, 14.5);
    const a = turn + (360 * i) / count + r.range(-10, 10);
    return { size, ...polar(a, core + size + 6) };
  });
  pods.forEach((p) => taken.push({ x: p.x, y: p.y, r: p.size + 3 }));
  return merged([
    ...k.outskirts(core + 2.5),
    ...pods.map((p) => run({ x: 0, y: 0 }, p, 7, '#a7b0b6')),
    ...pods.map((p) => placed(p.x, p.y, dome(p.size, '#4a9c7a', '#6dff9e'))),
    underHub(k, [dome(core, '#4a9c7a', '#6dff9e', 22)]),
    habitat(k),
    ...k.around(core + 2.5),
  ]);
};

/** A greenhouse ring round the hatch, walkways across to it. */
const ringHouse: Core = (k) => {
  const [R, w] = [k.r.range(37, 40), 13];
  const turn = k.r.range(0, 90);
  return merged([
    ...k.outskirts(R + w / 2 + 2),
    ...[0, 90, 180, 270].map((a) => run({ x: 0, y: 0 }, polar(a + turn, R), 5, '#a7b0b6')),
    torus(R, w),
    hubDeck,
    habitat(k),
    ...k.around(R + w / 2 + 2),
  ]);
};

/** A small dome over the hatch, and out one way two or three long greenhouse tunnels side by side, a corridor across their ends. */
const farm: Core = (k) => {
  const { r, taken } = k;
  const t = k.ways[0] ?? 90;
  const rows = r.pick([
    [-17, 0, 17],
    [-9, 9],
  ]);
  const [x0, len, w] = [30, r.range(46, 56), 12];
  rows.forEach((y) => taken.push(...along(rot({ x: x0, y }, t), rot({ x: x0 + len, y }, t), 8)));
  const [lo, hi] = [rows[0], rows[rows.length - 1]];
  return merged([
    ...k.outskirts(26, [t]),
    run({ x: 0, y: 0 }, rot({ x: x0, y: 0 }, t), 7, '#a7b0b6'),
    turnedPart(
      merged([run({ x: x0 - 2, y: lo }, { x: x0 - 2, y: hi }, 7, '#a7b0b6'), ...rows.map((y) => tunnel(x0 + len / 2 + 2, y, len, w))]),
      t,
    ),
    underHub(k, [dome(23, '#4a9c7a', '#6dff9e', 22)]),
    habitat(k),
    ...k.around(26),
  ]);
};

/** A honeycomb: the hub in a great glazed hexagon, four to six smaller cells set round it edge to edge. */
const comb: Core = (k) => {
  const { r, taken } = k;
  const [R0, R1] = [24, r.range(12, 14)];
  const d = (R0 + R1) * 0.866 + 3;
  const spots = [30, 90, 150, 210, 270, 330]
    .map((a) => ({ a, k: r.next() }))
    .sort((p, q) => p.k - q.k)
    .slice(0, r.int(4, 6))
    .map(({ a }) => polar(a, d));
  spots.forEach((p) => taken.push({ ...p, r: R1 + 2 }));
  const glass = ['#4a9c7a', '#5aa86a', '#3f8f86'];
  return merged([
    ...k.outskirts(R0 + 3),
    ...spots.map((p) => cell(p.x, p.y, R1, r.pick(glass))),
    underHub(k, [cell(0, 0, R0, '#4a9c7a')]),
    habitat(k),
    ...k.around(R0 + 3),
  ]);
};

/** A flat glazed roof `w` by `h` round (x, y), its glazing bars across its length, a ridge down it, plants glowing green under it. */
function pane(x: number, y: number, w: number, h: number, glass = '#4a9c7a'): Part {
  const long = w >= h;
  const [len, wide] = long ? [w, h] : [h, w];
  const bars = Array.from({ length: Math.floor(len / 5) - 1 }, (_, i) => -len / 2 + 5 + i * 5)
    .map((o) => (long ? `M${n(x + o)},${n(y - h / 2)} v${n(h)}` : `M${n(x - w / 2)},${n(y + o)} h${n(w)}`))
    .join(' ');
  const ridge = long ? `M${n(x - w / 2)},${n(y)} h${n(w)}` : `M${n(x)},${n(y - h / 2)} v${n(h)}`;
  return {
    grade: box(x, y, w + 10, h + 10, 4, H.graded, ' filter="url(#rg-soft3)"'),
    heights: box(x, y, w + 2.5, h + 2.5, 2, H.deck) + box(x, y, w - 1, h - 1, 1.5, GLASS),
    tint: box(x, y, w + 3, h + 3, 2, '#8d969c') + box(x, y, w - 1, h - 1, 1.5, glass),
    paint:
      LIT(
        box(
          x,
          y,
          long ? len - 4 : wide * 0.5,
          long ? wide * 0.5 : len - 4,
          2,
          '#6dff9e',
          ' opacity="0.4" filter="url(#rg-soft3)" style="mix-blend-mode: screen"',
        ),
      ) + `<path d="${bars} ${ridge}" stroke="#1e2426" stroke-width="0.5" opacity="0.5"/>`,
  };
}

/** A curved greenhouse hugging one side of the hub, a third to a half of the way round it, ribbed across. */
const crescent: Core = (k) => {
  const { r, taken } = k;
  const [R, w] = [r.range(31, 34), 12];
  const sweep = r.range(130, 180);
  const mid = r.range(0, 360);
  const [a0, a1] = [mid - sweep / 2, mid + sweep / 2];
  const [p, q] = [polar(a0, R), polar(a1, R)];
  const d = `M${n(p.x)},${n(p.y)} A${n(R)},${n(R)} 0 0 1 ${n(q.x)},${n(q.y)}`;
  for (let a = a0; a <= a1; a += 12) taken.push({ ...polar(a, R), r: w / 2 + 3 });
  const line = (stroke: string, width: number, extra = '', cap = 'round') =>
    `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${n(width)}" stroke-linecap="${cap}"${extra}/>`;
  return merged([
    ...k.outskirts(R + w / 2 + 2),
    run({ x: 0, y: 0 }, polar(mid, R), 5, '#a7b0b6'),
    {
      grade: line(H.graded, w + 14, ' filter="url(#rg-soft3)"'),
      heights: line(H.deck, w + 3) + line(GLASS, w) + line('rgb(240,255,150)', w * 0.35, ' filter="url(#rg-soft1)"'),
      tint: line('#8d969c', w + 3.5) + line('#4a9c7a', w),
      paint:
        LIT(line('#6dff9e', w * 0.7, ' opacity="0.45" filter="url(#rg-soft3)" style="mix-blend-mode: screen"')) +
        line('#1e2426', w, ' stroke-dasharray="0.5 4.5" opacity="0.5"', 'butt'),
    },
    hubDeck,
    habitat(k),
    ...k.around(R + w / 2 + 2),
  ]);
};

/** A glasshouse off one side of the hub, its roof a sawtooth of glazed slopes, each facing the same way, a short corridor across to it. */
const sawtooth: Core = (k) => {
  const { r, taken } = k;
  const t = k.ways[0] ?? 90;
  const [x0, bays, bay, W] = [30, r.int(4, 5), 6.5, r.range(40, 46)];
  const D = bays * bay;
  const cx = x0 + D / 2;
  taken.push(...along(rot({ x: x0 + W / 4, y: 0 }, t), rot({ x: x0 + D - W / 4, y: 0 }, t), W / 2 + 2));
  const xs = Array.from({ length: bays }, (_, i) => x0 + i * bay + bay / 2);
  // Each bay a glazed slope rising away from the hub, an upright at its top edge: the next bay starts below it.
  const slopes = (fill: (i: number) => string, inset = 0.6) => xs.map((x, i) => box(x, 0, bay - inset, W - 1, 0.6, fill(i))).join('');
  const uprights = xs.map((x) => `M${n(x + bay / 2 - 0.3)},${n(-W / 2 + 0.5)} v${n(W - 1)}`).join(' ');
  const bars = Array.from({ length: Math.floor(W / 6) - 1 }, (_, i) => -W / 2 + 6 + i * 6)
    .map((y) => `M${n(x0)},${n(y)} h${n(D)}`)
    .join(' ');
  return merged([
    ...k.outskirts(26, [t]),
    turnedPart(
      merged([
        run({ x: 0, y: 0 }, { x: x0, y: 0 }, 8, '#a7b0b6'),
        {
          grade: box(cx, 0, D + 12, W + 12, 6, H.graded, ' filter="url(#rg-soft3)"'),
          heights: box(cx, 0, D + 3, W + 3, 2, H.deck) + slopes((i) => `rgb(${190 + i * 10},255,135)`),
          tint: box(cx, 0, D + 3.5, W + 3.5, 2, '#8d969c') + slopes((i) => (i % 2 ? '#4a9c7a' : '#3f8f86')),
          paint:
            LIT(box(cx, 0, D - 4, W * 0.6, 3, '#6dff9e', ' opacity="0.35" filter="url(#rg-soft3)" style="mix-blend-mode: screen"')) +
            `<path d="${bars}" stroke="#1e2426" stroke-width="0.4" opacity="0.4"/>` +
            xs.map((x) => box(x - bay / 2 + 1.6, 0, 2.6, W - 1, 0.5, '#0c1a14', ' opacity="0.35" filter="url(#rg-soft1)"')).join('') +
            `<path d="${uprights}" stroke="#1e2426" stroke-width="1.4" opacity="0.55"/>` +
            `<path d="${uprights}" stroke="#fff" stroke-width="0.5" opacity="0.3" transform="translate(-1,0)"/>`,
        },
      ]),
      t,
    ),
    hubDeck,
    habitat(k),
    ...k.around(26),
  ]);
};

/** Two glazed wings meeting at the hub in an L, each a long flat-roofed greenhouse. */
const wings: Core = (k) => {
  const { r, taken } = k;
  const turn = r.range(0, 360);
  const [W, l1, l2] = [15, r.range(28, 34), r.range(22, 28)];
  const x0 = 20;
  taken.push(
    ...along(rot({ x: x0, y: 0 }, turn), rot({ x: x0 + l1, y: 0 }, turn), W / 2 + 3),
    ...along(rot({ x: 0, y: x0 }, turn), rot({ x: 0, y: x0 + l2 }, turn), W / 2 + 3),
  );
  const reach = x0 + Math.max(l1, l2) + 2;
  return merged([
    ...k.outskirts(26, [turn, turn + 90]),
    turnedPart(merged([pane(x0 + l1 / 2, 0, l1, W), pane(0, x0 + l2 / 2, W, l2, '#5aa86a')]), turn),
    hubDeck,
    habitat(k),
    ...k.around(reach),
  ]);
};

// ─────────────────────────────────────────────── 8 ───────────────────────────────────────────────

/** A dark deck in a bright Hazard frame that follows its outline, the wells plain grey. */
const refinery = (k: CoreKit) => hub(k.pads, '#3a3836', H.deck, undefined, { tint: '#c9c2b4' }, { tint: '#d9a020' });

/** The hub's half width. */
const half8 = (k: CoreKit) => k.pads[1].x + 15;

/** A refinery round its plain deck, and what's out from it. */
const refineryOf = (k: CoreKit, plant: Part[], reach = 32): Drawn =>
  merged([...k.outskirts(reach), ...plant, refinery(k), ...k.collars, ...k.around(reach)]);

const plainDeck: Core = (k) => refineryOf(k, []);

/** A distillation column at each end, a pipe rack along one side joining them. */
const columns: Core = (k) => {
  const { r, taken, links } = k;
  const X = half8(k);
  const R = r.range(10, 11.5);
  const at = [-1, 1].map((s) => ({ x: s * (X + R + 5), y: r.range(-4, 4) }));
  const rack = r.pick([-1, 1]) * 23;
  at.forEach((p) => taken.push({ ...p, r: R + 2 }));
  for (let x = -X; x <= X; x += 10) taken.push({ x, y: rack, r: 5 });
  links.push([
    { x: at[0].x, y: rack },
    { x: at[1].x, y: rack },
  ]);
  return refineryOf(k, [
    ...at.map((p) => run(p, { x: p.x, y: rack }, 3, '#c9c4bc')),
    ...[-2.6, 0, 2.6].map((dy) => run({ x: at[0].x, y: rack + dy }, { x: at[1].x, y: rack + dy }, 1.8, '#c9c4bc')),
    ...at.map((p) => placed(p.x, p.y, column(R))),
  ]);
};

/** Two great storage spheres at opposite corners, piped in under the deck. */
const spheres: Core = (k) => {
  const { r, taken } = k;
  const a = r.pick([25, 155]);
  const R = r.range(14, 16);
  const at = [a, a + 180].map((d) => polar(d + r.range(-6, 6), half8(k) + R + 9));
  at.forEach((p) => taken.push({ ...p, r: R + 2 }));
  return refineryOf(k, [...at.map((p) => run({ x: 0, y: 0 }, p, 4, '#f2ad2c')), ...at.map((p) => tank(p.x, p.y, R))]);
};

/** A flat-roofed storage tank `R` across. */
const drum = (x: number, y: number, R: number): Part => ({
  heights:
    disc(x, y, R + 1, H.apron) +
    disc(x, y, R, 'rgb(225,150,205)') +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(R * 0.55)}" fill="none" stroke="rgb(240,150,215)" stroke-width="1"/>`,
  tint:
    disc(x, y, R + 1, '#e8e2d4') + `<circle cx="${n(x)}" cy="${n(y)}" r="${n(R * 0.55)}" fill="none" stroke="#c9a227" stroke-width="1.4"/>`,
  paint:
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(R)}" fill="none" stroke="#2a2d30" stroke-width="0.4" opacity="0.5"/>` +
    disc(x - R * 0.35, y - R * 0.35, R * 0.25, '#fff', ' opacity="0.35" filter="url(#rg-soft1)"'),
});

/** A tank farm in a walled bund off one long side: two rows of flat-roofed tanks, each piped to the deck. */
const bund: Core = (k) => {
  const { r, taken } = k;
  const s = r.pick([-1, 1]);
  const R = r.range(8, 9);
  const xs = r.pick([[-22, 0, 22], [-24, -8, 8, 24].slice(0, 3)]);
  const tanks = [s * 34, s * 54].flatMap((y) => xs.map((x) => ({ x: x + r.range(-1.5, 1.5), y })));
  tanks.forEach((p) => taken.push({ ...p, r: R + 2 }));
  const wall = box(0, s * 44, 76, 38, 3, 'none', ` stroke="FILL" stroke-width="3"`);
  return refineryOf(k, [
    {
      grade: box(0, s * 44, 84, 46, 4, H.graded, ' filter="url(#rg-soft3)"'),
      heights: wall.replace('FILL', H.apron),
      tint: wall.replace('FILL', '#8e8a86'),
    },
    ...xs.map((x) => run({ x, y: s * 15 }, { x, y: s * 54 }, 2, '#f2ad2c')),
    ...tanks.map((p) => drum(p.x, p.y, R)),
  ]);
};

/** A fired heater out one way: a long furnace, its firebox windows glowing, its stack at the far end, the duct back to the deck. */
const furnace: Core = (k) => {
  const { r, taken } = k;
  const t = k.ways[0] ?? 90;
  const [x0, len] = [30, r.range(24, 28)];
  const cx = x0 + len / 2;
  taken.push(...along(rot({ x: x0, y: 0 }, t), rot({ x: x0 + len + 10, y: 0 }, t), 14, 12));
  const windows = Array.from({ length: Math.floor(len / 9) }, (_, i) => x0 + 6 + i * 9);
  return merged([
    ...k.outskirts(32, [t]),
    turnedPart(
      merged([
        run({ x: 10, y: 0 }, { x: x0, y: 0 }, 9, '#8e8a86'),
        {
          grade: box(cx, 0, len + 12, 34, 4, H.graded, ' filter="url(#rg-soft3)"'),
          heights: box(cx, 0, len + 2, 26, 2, H.apron) + box(cx, 0, len, 24, 2, H.dark),
          tint: box(cx, 0, len + 2, 26, 2, '#55504a') + box(cx, 0, len - 5, 18, 1, '#3a3836'),
          paint:
            `<path d="M${n(x0 + 2)},0 H${n(x0 + len - 2)}" stroke="#1e1c1a" stroke-width="0.6" opacity="0.6"/>` +
            KEEP(
              windows
                .map((x) =>
                  [-7, 7].map((y) => glow(x, y, 4.5, '#ff6a10', 0.7) + box(x, y, 4, 2.4, 0.5, '#ffb347', ' opacity="0.9"')).join(''),
                )
                .join(''),
            ),
        },
        placed(x0 + len + 7, 0, stack(), 0, 1.2),
      ]),
      t,
    ),
    refinery(k),
    ...k.collars,
    ...k.around(32),
  ]);
};

/** A pipeline corridor: six pipes in a band right across the site, under the deck, on their supports, with valves along them. */
const manifold: Core = (k) => {
  const { r, taken, links } = k;
  const L = r.range(84, 96);
  const turn = r.pick([0, 0, 90]) + r.range(-8, 8);
  const ys = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5];
  const colours = ['#c9c4bc', '#f2ad2c', '#8d969c', '#c9c4bc', '#c8321f', '#f2ad2c'];
  const [a, b] = [rot({ x: -L, y: 0 }, turn), rot({ x: L, y: 0 }, turn)];
  taken.push(...along(a, b, 17, 12).filter((p) => Math.hypot(p.x, p.y) > 30));
  links.push([a, b]);
  const supports = Array.from({ length: Math.floor((2 * L) / 14) + 1 }, (_, i) => -L + i * 14).filter((x) => Math.abs(x) > 34);
  const valves = [r.range(40, L - 10), -r.range(40, L - 10)].map((x) => ({ x, y: r.pick(ys) }));
  return merged([
    ...k.outskirts(32),
    turnedPart(
      merged([
        {
          grade: box(0, 0, 2 * L + 6, 36, 6, H.graded, ' filter="url(#rg-soft3)"'),
          heights: supports.map((x) => box(x, 0, 3, 34, 0.5, H.dark)).join(''),
          tint: supports.map((x) => box(x, 0, 3.4, 34, 0.5, '#4a4540')).join(''),
        },
        ...ys.map((y, i) => run({ x: -L, y }, { x: L, y }, 3.6, colours[i])),
        ...valves.map((v) =>
          placed(v.x, v.y, {
            heights: disc(0, 0, 4, 'rgb(250,130,215)'),
            tint: disc(0, 0, 4.2, '#c8321f'),
            paint: `<path d="M-3,0 H3 M0,-3 V3" stroke="#1e1c1a" stroke-width="0.8" opacity="0.7"/>`,
          }),
        ),
      ]),
      turn,
    ),
    refinery(k),
    ...k.collars,
    ...k.around(32),
  ]);
};

/** One great flare tower out one way, guyed to the ground, its flame roaring, a knockout drum on the line to it. */
const greatFlare: Core = (k) => {
  const { r, taken } = k;
  const t = k.ways[0] ?? 90;
  const D = r.range(60, 68);
  taken.push({ ...polar(t, D), r: 30 }, { ...polar(t, 34), r: 8 });
  const anchors = [0, 120, 240].map((a) => polar(a + r.range(0, 120), 26));
  const braces = 'M-8,-8 L8,8 M8,-8 L-8,8';
  return merged([
    ...k.outskirts(32, [t]),
    turnedPart(
      merged([
        run({ x: 10, y: 0 }, { x: D, y: 0 }, 4, '#c9c4bc'),
        // The knockout drum, lying on its side.
        {
          heights: box(36, 0, 22, 11, 5.5, 'rgb(230,160,210)'),
          tint: box(36, 0, 22.5, 11.5, 5.5, '#e8e2d4'),
          paint: box(36, -2.5, 18, 2, 1, '#fff', ' opacity="0.4" filter="url(#rg-soft1)"'),
        },
        placed(D, 0, {
          grade: graded(0, 0, 32),
          heights:
            anchors
              .map((p) => `<path d="M0,0 L${n(p.x)},${n(p.y)}" stroke="rgb(230,120,200)" stroke-width="0.8"/>` + disc(p.x, p.y, 2, H.apron))
              .join('') +
            `<rect x="-8" y="-8" width="16" height="16" fill="none" stroke="rgb(255,120,220)" stroke-width="2"/><path d="${braces}" stroke="rgb(255,120,220)" stroke-width="1.4"/>` +
            disc(0, 0, 3.5, 'rgb(255,130,230)'),
          tint:
            anchors.map((p) => `<path d="M0,0 L${n(p.x)},${n(p.y)}" stroke="#8e8a86" stroke-width="1"/>`).join('') +
            square(0, 0, 18, 0.5, '#c8321f'),
          paint: KEEP(
            glow(-4, -4, 26, '#ff6a10', 0.55, 'rg-soft6') +
              glow(-3, -3, 9, '#ff9a2a', 0.9) +
              glow(-3, -3, 4, '#ffe9a0', 1, 'rg-soft1') +
              disc(-3, -3, 1.4, '#fff'),
          ),
        }),
      ]),
      t,
    ),
    refinery(k),
    ...k.collars,
    ...k.around(32),
  ]);
};

/** A smelter out one way: a crucible of molten regolith, crusted at its edge, a conveyor feeding it and a slag heap by it. */
const smelter: Core = (k) => {
  const { r, taken } = k;
  const t = k.ways[0] ?? 90;
  const D = r.range(58, 64);
  const R = r.range(16, 19);
  const side = r.pick([-1, 1]);
  const slag = { x: D - 10, y: side * (R + 22) };
  taken.push({ ...polar(t, D), r: R + 4 }, { ...rot(slag, t), r: 16 });
  const crust = Array.from({ length: 6 }, () => polar(r.range(0, 360), r.range(R * 0.5, R * 0.75)));
  return merged([
    ...k.outskirts(32, [t]),
    turnedPart(
      merged([
        {
          ...run({ x: 10, y: 0 }, { x: D - R, y: 0 }, 8, '#8e8a86'),
          paint: `<path d="M${30},0 H${n(D - R - 2)}" stroke="#1e1c1a" stroke-width="6" stroke-dasharray="1 3" opacity="0.4"/>`,
        },
        // The slag, heaped on the ground and lit with it, dark.
        {
          grade: disc(slag.x, slag.y, 15, 'rgb(158,165,60)', ' filter="url(#rg-soft6)"'),
          paint: disc(slag.x, slag.y, 12, '#140e0a', ' opacity="0.45" filter="url(#rg-soft3)"'),
        },
        placed(D, 0, {
          grade: graded(0, 0, R + 9),
          heights: disc(0, 0, R + 2, H.apron) + disc(0, 0, R, H.dark) + disc(0, 0, R * 0.78, 'rgb(90,210,60)'),
          tint: disc(0, 0, R + 2, '#55504a') + disc(0, 0, R * 0.8, '#2a1a10'),
          paint: KEEP(
            glow(0, 0, R * 1.2, '#ff5a10', 0.4, 'rg-soft6') +
              disc(0, 0, R * 0.74, '#ff7a1a', ' opacity="0.9"') +
              glow(1, 1, R * 0.5, '#ffd27a', 0.9) +
              crust.map((c) => disc(c.x, c.y, r.range(1.5, 3), '#3a1a0a', ' opacity="0.8" filter="url(#rg-soft1)"')).join(''),
          ),
        }),
      ]),
      t,
    ),
    refinery(k),
    ...k.collars,
    ...k.around(32),
  ]);
};

// ─────────────────────────────────────────────── 9 ───────────────────────────────────────────────

/** A deep teal frame painted along its outline, the wells plain grey; the frost haze over it is thin, so it keeps its colour. */
const mine = (k: CoreKit) => hub(k.pads, k.deck, H.deck, '#ff3b2a', { tint: '#9a9a9a' }, { tint: '#1e8597', band: ['#117487', 0.9] });

/** A biohazard sign on one of its sockets. */
const sign = (k: CoreKit): Part => ({ paint: biohazard(k.r.pick(k.pads)) });

const frost = (x: number, y: number, R: number): Part => ({
  grade: disc(x, y, R, 'url(#rg-frost)', ' style="mix-blend-mode: lighten"'),
  paint: glow(x, y, R, '#7fdcec', 0.1, 'rg-soft6'),
});

/** In a ring of frost, its tower in a corner the three sockets leave, piped up into the deck's underside. */
const frostRing: Core = (k) => {
  const ice = k.r.range(45, 66);
  const tower = k.r.pick([-1, 1]) * 25;
  return merged([
    frost(0, 0, ice),
    ...k.outskirts(40),
    run({ x: tower, y: 15 }, { x: tower, y: -4 }, 2.5, '#c9c4bc'),
    mine(k),
    ...k.collars,
    k.collar({ x: tower, y: k.pads[0].y + 15 }, { x: 0, y: 1 }, 2.5),
    sign(k),
    placed(tower, 15, stack(), 0, 1.25),
    ...k.around(40),
  ]);
};

/** An open pit stepped down to glowing ice, the hub on a bridge across it. */
const quarry: Core = (k) => {
  const { r } = k;
  const outer = r.range(52, 58);
  const steps = 5;
  const y = k.pads[0].y;
  const terraces = Array.from({ length: steps }, (_, i) => {
    const s = i / steps;
    return disc(
      0,
      4 * s,
      outer * (1 - s * 0.75),
      `rgb(${n(116 - s * 64)},${n(170 + s * 80)},${n(150 + s * 80)})`,
      i ? '' : ' filter="url(#rg-wx-y)"',
    );
  }).join('');
  const span = outer * 2 + 6;
  return merged([
    frost(0, 0, outer + 14),
    ...k.outskirts(outer + 2),
    {
      grade: graded(0, 0, outer + 6) + terraces,
      tint: disc(0, 0, outer, '#bfd9e6'),
      paint:
        glow(0, 6, outer * 0.5, '#3fe6ff', 0.5, 'rg-soft6') +
        glow(-outer * 0.35, 14, outer * 0.15, '#7ff5ff', 0.8) +
        glow(outer * 0.3, 18, outer * 0.12, '#7ff5ff', 0.7) +
        disc(0, 0, outer, '#eaf6ff', ' opacity="0.15" filter="url(#rg-soft3)" style="mix-blend-mode: screen"'),
    },
    {
      heights: box(0, y, span, 20, 1, 'rgb(225,140,200)'),
      tint: box(0, y, span, 20.5, 1, '#c9c4bc'),
      paint:
        `<path d="${Array.from({ length: Math.floor(span / 10) }, (_, i) => `M${n(-span / 2 + i * 10)},${n(y - 10)} l10,20 M${n(-span / 2 + i * 10)},${n(y + 10)} l10,-20`).join(' ')}" stroke="#1e3a44" stroke-width="0.6" opacity="0.5"/>` +
        lamp(-span / 2 + 3, y, '#7fe9ff') +
        lamp(span / 2 - 3, y, '#7fe9ff'),
    },
    mine(k),
    sign(k),
    ...k.around(outer + 4),
  ]);
};

/** A boring machine's cutter head out one way, cutting into ice, a conveyor back to the hub. */
const bore: Core = (k) => {
  const { r, taken, links } = k;
  const a = k.ways[0] ?? 90;
  const R = r.range(19, 22);
  const at = polar(a, 44 + R);
  taken.push({ ...at, r: R + 4 });
  links.push([{ x: 0, y: 0 }, at]);
  const belt = `M0,0 L${n(at.x)},${n(at.y)}`;
  return merged([
    frost(at.x, at.y, R + 26),
    ...k.outskirts(40, [a]),
    {
      ...run({ x: 0, y: 0 }, at, 9, '#c9c4bc'),
      paint: `<path d="${belt}" stroke="#1e3a44" stroke-width="7" stroke-dasharray="1 3" opacity="0.45"/>`,
    },
    placed(at.x, at.y, cutter(R, r.range(0, 60))),
    mine(k),
    ...k.collars,
    sign(k),
    ...k.around(40),
  ]);
};

/** A drilling derrick out one way, the drill string laid out in lengths beside it and ice cores racked in rows. */
const derrick: Core = (k) => {
  const { r, taken } = k;
  const t = k.ways[0] ?? 90;
  const D = r.range(64, 70);
  const s = r.pick([-1, 1]);
  taken.push({ ...polar(t, D), r: 26 }, ...along(rot({ x: 30, y: s * 26 }, t), rot({ x: D + 6, y: s * 26 }, t), 9));
  const lengths = [-4, -1.3, 1.3, 4].map((dy) => box(30 + (D - 34) / 2, s * 26 + dy, D - 34, 2, 1, 'FILL')).join('');
  const cores = Array.from({ length: r.int(4, 6) }, (_, i) => ({ x: D - 26 - i * 7, y: s * 37 }));
  const braces = 'M-12,-12 L12,12 M12,-12 L-12,12 M-12,0 H12 M0,-12 V12';
  return merged([
    frost(polar(t, D).x, polar(t, D).y, 34),
    ...k.outskirts(40, [t]),
    turnedPart(
      merged([
        run({ x: 20, y: 0 }, { x: D - 12, y: 0 }, 5, '#e8eef2'),
        { heights: lengths.replace(/FILL/g, H.pipe), tint: lengths.replace(/FILL/g, '#c9c4bc') },
        ...cores.map((c) => ({
          heights: box(c.x, c.y, 5, 9, 2.5, 'rgb(230,200,220)'),
          tint: box(c.x, c.y, 5.4, 9.4, 2.7, '#eef5fb'),
          paint: disc(c.x, c.y + s * 3, 1.6, '#2f8fff', ' opacity="0.9"'),
        })),
        placed(
          D,
          0,
          {
            grade: graded(0, 0, 20),
            heights:
              box(0, 0, 30, 30, 1, H.apron) +
              `<rect x="-12" y="-12" width="24" height="24" fill="none" stroke="rgb(250,120,215)" stroke-width="2.4"/><path d="${braces}" stroke="rgb(250,120,215)" stroke-width="1.6"/>` +
              disc(0, 0, 4, 'rgb(255,130,230)'),
            tint: box(0, 0, 30, 30, 1, '#8d969c') + square(0, 0, 26, 0.5, '#e8eef2'),
            paint:
              `<path d="${braces}" stroke="#fff" stroke-width="0.4" opacity="0.5"/>` +
              glow(0, 0, 8, '#7ff5ff', 0.5) +
              lamp(-11, -11, '#ff3b2a') +
              lamp(11, 11, '#ff3b2a'),
          },
          0,
          1.45,
        ),
      ]),
      t,
    ),
    mine(k),
    ...k.collars,
    sign(k),
    ...k.around(40),
  ]);
};

/** Three melt vats in an arc out one way, the ice thawing in them, steam drifting off. */
const melt: Core = (k) => {
  const { r, taken } = k;
  const b = k.ways[0] ?? 90;
  const R = r.range(12, 14);
  const D = r.range(56, 60);
  const angles = [-46, 0, 46].map((d) => b + d);
  const vats = angles.map((a) => polar(a, D));
  vats.forEach((v) => taken.push({ ...v, r: R + 4 }));
  const drift = r.range(0, 360);
  const steam = vats
    .map((v) =>
      Array.from({ length: 4 }, (_, i) => {
        const p = polar(drift, 6 + i * 8);
        return disc(v.x + p.x, v.y + p.y, 6 + i * 3, '#ffffff', ` opacity="${n(0.35 - i * 0.07)}" filter="url(#rg-soft6)"`);
      }).join(''),
    )
    .join('');
  return merged([
    ...k.outskirts(40, angles),
    ...vats.map((v) => run({ x: 0, y: 0 }, v, 3.5, '#e8eef2')),
    ...vats.map((v) =>
      placed(v.x, v.y, {
        grade: graded(0, 0, R + 7),
        heights: disc(0, 0, R + 2, H.apron) + disc(0, 0, R + 0.5, H.deck) + disc(0, 0, R - 2, 'rgb(84,215,140)'),
        tint: disc(0, 0, R + 2, '#c9c4bc') + disc(0, 0, R - 2, '#2a6f86'),
        paint:
          glow(0, 0, R * 0.8, '#3fe6ff', 0.45) +
          `<path d="M${n(-R * 0.4)},${n(-R * 0.2)} l${n(R * 0.3)},${n(-R * 0.15)} M${n(R * 0.1)},${n(R * 0.3)} l${n(R * 0.35)},${n(R * 0.05)}" stroke="#effeff" stroke-width="1.6" opacity="0.7" stroke-linecap="round"/>`,
      }),
    ),
    { paint: KEEP(steam) },
    mine(k),
    ...k.collars,
    sign(k),
    ...k.around(40),
  ]);
};

/** On a sheet of ice, cracked open in crevasses glowing blue, blocks cut from it stacked by the hub. */
const crevasse: Core = (k) => {
  const { r, taken } = k;
  const R = r.range(62, 72);
  const sheet = pts(Array.from({ length: 14 }, (_, i) => polar(i * (360 / 14) + r.range(-8, 8), R * r.range(0.8, 1.05))));
  let cracks = '';
  for (let i = r.int(4, 6); i > 0; i--) {
    let a = r.range(0, 2 * Math.PI);
    let [x, y] = [44 * Math.cos(a), 44 * Math.sin(a)];
    cracks += `M${n(x)},${n(y)}`;
    for (let s = 0; s < 5; s++) {
      a += r.range(-0.5, 0.5);
      [x, y] = [x + 6 * Math.cos(a), y + 6 * Math.sin(a)];
      cracks += ` L${n(x)},${n(y)}`;
    }
  }
  const t = r.range(0, 360);
  const blocks = Array.from({ length: r.int(5, 8) }, (_, i) => ({
    ...polar(t + (i % 3) * 7, 46 + Math.floor(i / 3) * 8),
    turn: r.range(-10, 10),
  }));
  blocks.forEach((b) => taken.push({ x: b.x, y: b.y, r: 5 }));
  return merged([
    {
      // The sheet, smooth and bright, a little raised.
      grade:
        `<polygon points="${sheet}" fill="rgb(134,235,235)" filter="url(#rg-soft3)"/>` +
        `<path d="${cracks}" fill="none" stroke="rgb(80,90,128)" stroke-width="2.4" stroke-linejoin="round"/>`,
      tint: `<polygon points="${sheet}" fill="#cfe8f0" opacity="0.55" filter="url(#rg-soft3)"/>`,
      paint: LIT(
        `<path d="${cracks}" fill="none" stroke="#3fe6ff" stroke-width="5" opacity="0.5" filter="url(#rg-soft1)" style="mix-blend-mode: screen"/>` +
          `<path d="${cracks}" fill="none" stroke="#dffbff" stroke-width="0.8" stroke-linejoin="round" opacity="0.9"/>`,
      ),
    },
    ...k.outskirts(40),
    ...blocks.map((b) =>
      placed(
        b.x,
        b.y,
        {
          heights: box(0, 0, 7, 7, 0.8, 'rgb(205,230,235)'),
          tint: box(0, 0, 7.4, 7.4, 0.8, '#e8f6ff'),
          paint: box(-1, -1, 4, 1.4, 0.4, '#fff', ' opacity="0.6"'),
        },
        b.turn,
      ),
    ),
    mine(k),
    ...k.collars,
    sign(k),
    ...k.around(40),
  ]);
};

// ─────────────────────────────────────────────── 10 ───────────────────────────────────────────────

/** The reactor's hub, a radiation sign painted small in the middle of one of its four sockets, picked from the tile's seed, as the Ice Mine's sign is. */
const reactor = (k: CoreKit) => [hub(k.pads, '#3a383c', H.dark, '#ff7a1a', { tint: '#4a4a4a' }), nuclear(k.r.pick(k.pads), 1.4)];

/** A black octagon in a red frame, vents glowing on its sides. */
const octagonal: Core = (k) => {
  const vents = [
    [37, 0],
    [-37, 0],
    [0, 37],
    [0, -37],
  ];
  const octagon = (s: number) =>
    pts(
      [
        [1, 0.41],
        [0.41, 1],
        [-0.41, 1],
        [-1, 0.41],
        [-1, -0.41],
        [-0.41, -1],
        [0.41, -1],
        [1, -0.41],
      ].map(([x, y]) => ({ x: x * s, y: y * s })),
    );
  return merged([
    ...k.outskirts(49),
    {
      grade: graded(0, 0, 52),
      heights:
        `<polygon points="${octagon(45)}" fill="${H.apron}"/>` +
        `<polygon points="${octagon(44)}" fill="${H.dark}"/>` +
        `<g fill="rgb(150,40,90)">${vents.map(([x, y]) => `<rect x="-5" y="-5" width="10" height="10" transform="translate(${x},${y}) rotate(45)"/>`).join('')}</g>`,
      // A bright frame round a dark body, so the colour follows the octagon.
      tint: `<polygon points="${octagon(45)}" fill="#c0402a"/><polygon points="${octagon(41)}" fill="#2e2c30"/>`,
      paint:
        `<polygon points="${octagon(41)}" fill="none" stroke="#ff5a14" stroke-width="0.8" opacity="0.6"/>` +
        vents.map(([x, y]) => glow(x, y, 5, '#ff4a0a', 0.8) + KEEP(glow(x, y, 2, '#F2B233', 1, 'rg-soft1'))).join(''),
    },
    ...reactor(k),
    ...k.around(49),
  ]);
};

/** A round containment building, vents glowing round its rim, a buttressed shield wall round it. */
const containment: Core = (k) => {
  const { r } = k;
  const R = 47;
  const buttresses = Array.from({ length: 6 }, (_, i) => r.range(0, 60) + i * 60);
  const buttress = (a: number, fill: string) => `<g transform="rotate(${n(a)})">${box(R + 5, 0, 12, 6, 1, fill)}</g>`;
  const ports = Array.from({ length: 8 }, (_, i) => polar(22.5 + i * 45, R - 6));
  return merged([
    ...k.outskirts(R + 13),
    {
      grade: graded(0, 0, R + 7),
      heights:
        disc(0, 0, R + 1, H.apron) +
        disc(0, 0, R, H.dark) +
        hoop(R - 2, 4, 'rgb(225,150,60)') +
        ports.map((p) => disc(p.x, p.y, 3.4, 'rgb(150,40,90)')).join(''),
      tint: disc(0, 0, R + 1, '#c0402a') + disc(0, 0, R - 4, '#2e2c30'),
      paint:
        hoop(R - 9, 1.2, '#ff5a14', ' stroke-dasharray="2 2.5" opacity="0.5"') +
        ports.map((p) => glow(p.x, p.y, 4.5, '#ff4a0a', 0.8) + KEEP(glow(p.x, p.y, 1.8, '#F2B233', 1, 'rg-soft1'))).join(''),
    },
    {
      grade: hoop(R + 10, 12, H.graded, ' filter="url(#rg-soft3)"'),
      heights:
        hoop(R + 10, 6, H.apron) + hoop(R + 10, 4.5, 'rgb(220,150,60)') + buttresses.map((a) => buttress(a, 'rgb(220,150,60)')).join(''),
      tint: hoop(R + 10, 6, '#4a4540') + buttresses.map((a) => buttress(a, '#4a4540')).join(''),
      paint: hoop(R + 10, 0.6, '#1e1c1a', ' stroke-dasharray="5 3" opacity="0.4"'),
    },
    ...reactor(k),
    ...k.around(R + 13),
  ]);
};

/** A fusion ring round the hub, its magnets set along it, the plasma glowing through it. */
const tokamak: Core = (k) => {
  const [R, w] = [53, 12];
  const turn = k.r.range(0, 360 / 14);
  const coils = Array.from({ length: 14 }, (_, i) => turn + (i * 360) / 14);
  const coil = (a: number, fill: string, grow = 0) => `<g transform="rotate(${n(a)})">${box(R, 0, w + 8 + grow, 6 + grow, 1.5, fill)}</g>`;
  return merged([
    ...k.outskirts(R + w / 2 + 3),
    ...[45, 135, 225, 315].map((a) => run({ x: 0, y: 0 }, polar(a + turn, R), 6, '#3a383c', H.dark)),
    {
      grade: hoop(R, w + 18, H.graded, ' filter="url(#rg-soft3)"'),
      heights: hoop(R, w + 2, H.apron) + hoop(R, w, H.dark) + coils.map((a) => coil(a, 'rgb(235,150,70)')).join(''),
      tint: hoop(R, w + 2, '#2e2c30') + coils.map((a) => coil(a, '#c0402a', 0.5)).join(''),
      paint: KEEP(
        hoop(R, 6, '#ff5a14', ' opacity="0.55" filter="url(#rg-soft3)" style="mix-blend-mode: screen"') +
          hoop(R, 0.8, '#ffe2a0', ' stroke-dasharray="3 2" opacity="0.8"'),
      ),
    },
    { grade: graded(0, 0, 44) },
    ...reactor(k),
    ...k.around(R + w / 2 + 3),
  ]);
};

/** The reactor joined to its turbine hall out one way, the roof ribbed, its vents glowing, a transformer yard past it. */
const hall: Core = (k) => {
  const { r, taken } = k;
  const t = k.ways[0] ?? 90;
  const [x0, len, w] = [26, r.range(54, 62), 44];
  const cx = x0 + len / 2;
  taken.push(...along(rot({ x: x0 + 10, y: 0 }, t), rot({ x: x0 + len + 14, y: 0 }, t), 24, 12));
  const ribs = Array.from({ length: Math.floor(len / 6) }, (_, i) => `M${n(x0 + 3 + i * 6)},${n(-w / 2 + 3)} V${n(w / 2 - 3)}`).join(' ');
  const vents = [0.25, 0.5, 0.75].map((f) => x0 + len * f);
  const yard = [-1, 0, 1].flatMap((i) => [-6, 6].map((j) => ({ x: x0 + len + 12 + j, y: i * 13 })));
  return merged([
    ...k.outskirts(36, [t]),
    turnedPart(
      merged([
        {
          grade: box(cx + 6, 0, len + 30, w + 12, 6, H.graded, ' filter="url(#rg-soft3)"'),
          heights:
            box(cx - 4, 0, len + 10, w + 2, 2, H.apron) +
            box(cx - 4, 0, len + 8, w, 2, H.dark) +
            vents.map((x) => box(x, 0, 8, 14, 1, 'rgb(150,40,90)')).join(''),
          tint: box(cx - 4, 0, len + 10, w + 2, 2, '#c0402a') + box(cx - 4, 0, len + 4, w - 4, 1.5, '#2e2c30'),
          paint:
            `<path d="${ribs}" stroke="#ff5a14" stroke-width="0.4" opacity="0.35"/>` +
            vents
              .map((x) => glow(x, 0, 6, '#ff4a0a', 0.75) + KEEP(box(x, 0, 6, 11, 1, '#F2B233', ' opacity="0.55" filter="url(#rg-soft1)"')))
              .join(''),
        },
        ...yard.map((p) => ({
          heights: box(p.x, p.y, 8, 8, 1, 'rgb(225,150,200)'),
          tint: box(p.x, p.y, 8.4, 8.4, 1, '#8d969c'),
          paint: lamp(p.x + 2.5, p.y - 2.5, '#ff7a1a'),
        })),
      ]),
      t,
    ),
    ...reactor(k),
    ...k.around(36),
  ]);
};

/** A reactor pool: the hub on a bridge over the water, the fuel racked under it glowing Cherenkov blue. */
const pool: Core = (k) => {
  const { r } = k;
  const S = r.range(104, 112);
  const turn = r.pick([0, 90]);
  const cells = [];
  for (let x = -S / 2 + 9; x < S / 2 - 6; x += 9)
    for (let y = -S / 2 + 9; y < S / 2 - 6; y += 9) if (Math.max(Math.abs(x), Math.abs(y)) > 34 && r.chance(0.7)) cells.push({ x, y });
  // The water `a` out from the middle, square, with the hub's square cut out of it.
  const water = (a: number) => `M${n(-a)},${n(-a)} H${n(a)} V${n(a)} H${n(-a)} Z M-32,-32 V32 H32 V-32 Z`;
  return merged([
    ...k.outskirts(S / 2 + 3),
    turnedPart(
      {
        grade: box(0, 0, S + 12, S + 12, 8, H.graded, ' filter="url(#rg-soft3)"'),
        heights:
          box(0, 0, S + 4, S + 4, 6, H.apron) +
          box(0, 0, S, S, 5, H.deck) +
          box(0, 0, S - 10, S - 10, 3, 'rgb(84,215,140)') +
          box(0, 0, S + 4, 14, 1, 'rgb(220,150,200)'),
        tint: box(0, 0, S + 4, S + 4, 6, '#c0402a') + box(0, 0, S - 4, S - 4, 4, '#4a4540') + box(0, 0, S + 4, 14.5, 1, '#55504a'),
        paint: KEEP(
          // Round the hub, not over it.
          `<path d="${water(S / 2 - 5)}" fill="#0b2a4a" fill-rule="evenodd" opacity="0.65"/>` +
            cells.map((c) => box(c.x, c.y, 6, 6, 0.8, '#05101c', ' opacity="0.6"')).join('') +
            `<path d="${water(S / 2 - 8)}" fill="#3fa9ff" fill-rule="evenodd" opacity="0.55" filter="url(#rg-soft6)" style="mix-blend-mode: screen"/>` +
            cells.map((c) => glow(c.x, c.y, 4, '#9fdcff', 0.5, 'rg-soft1')).join(''),
        ),
      },
      turn,
    ),
    ...reactor(k),
    ...k.around(S / 2 + 3),
  ]);
};

/** Each number's middles by design name, the first drawn when a tile names none. */
export const CORES: Record<number, Record<string, Core>> = {
  7: { dome: greatDome, warren, torus: ringHouse, farm, comb, crescent, sawtooth, wings },
  8: { deck: plainDeck, columns, spheres, bund, furnace, manifold, flare: greatFlare, smelter },
  9: { frost: frostRing, quarry, bore, derrick, melt, crevasse },
  10: { octagon: octagonal, containment, tokamak, hall, pool },
};
