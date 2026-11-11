import type { Rng } from '../rng';
import { n } from '../svg';
import type { Spot } from '../tile/geometry';
import { polar } from './core';
import { KEEP } from './inks';
import { H, type Part, type Drawn, placed, merged, disc, square, box, graded, glow, lamp, run } from './parts';
import { hub, dish, tankFarm, containers, solar, silos } from './buildings';
import { landingPad } from './craft';

/**
 * The hard objectives' landmarks, each a site a map can be built round: the 11 a Ring Accelerator (the Mass
 * Driver), the 12 a Deep Space Array or an Atmosphere Plant, the 13 the Citadel. A tile names its own by its
 * `design` (set.ts), and the base (base.ts) draws it. The drafts they were picked from are kept: a launch
 * complex for the 11, and an alien dig and a drydock for the 13.
 */

/** A clear circle where something stands. */
export type Taken = Spot & { r: number };

/** An outbuilding a base may have: how likely it is, how far out it stands (in spaces), how it's linked to the hub along `a`, what it is, how much larger than drawn, and whether it's turned with the way out. */
export interface Annex {
  weight: number;
  reach: [number, number];
  link: (a: number, p: Spot) => Part;
  part: (r: Rng) => Part;
  scale: number;
  turned: boolean;
}

/** How much larger than drawn a base's outbuildings stand, reaching well into the hexes round it. */
export const BIG = 1.35;

export const annex = (
  weight: number,
  reach: [number, number],
  link: (a: number, p: Spot) => Part,
  part: (r: Rng) => Part,
  scale = BIG,
  turned = false,
): Annex => ({ weight, reach, link, part, scale, turned });

/** What base.ts lends a landmark: the tile's random numbers, the sockets, the ground already taken, and its ways of laying out outbuildings and small things. */
export interface Kit {
  r: Rng;
  pads: Spot[];
  taken: Taken[];
  /** Outbuildings out along the ways that aren't `blocked` (angles, ±40°), clear of the hub `hubReach` across. */
  outskirts: (hubReach: number, pool: Annex[], blocked?: number[]) => Part[];
  /** Small things round what stands, the hub `hubReach` across. */
  around: (hubReach: number, light: string) => Part[];
  /** A pipe out to an outbuilding. */
  tube: (w: number, colour: string) => (a: number, p: Spot) => Part;
}

/** A landmark's own parts keep their colours (inks.ts `KEEP`); its hub is in its number's ink, what's round it faded. */
const kept = (p: Part): Part => ({ ...p, tint: p.tint && KEEP(p.tint), paint: p.paint && KEEP(p.paint) });

const pts = (list: Spot[]) => list.map((p) => `${n(p.x)},${n(p.y)}`).join(' ');

/** A point turned `turn` degrees round the origin. */
const turned = (p: Spot, turn: number): Spot => {
  const [c, s] = [Math.cos((turn * Math.PI) / 180), Math.sin((turn * Math.PI) / 180)];
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};

const line = (a: Spot, b: Spot, stroke: string, w: number, extra = '') =>
  `<path d="M${n(a.x)},${n(a.y)} L${n(b.x)},${n(b.y)}" stroke="${stroke}" stroke-width="${n(w)}" stroke-linecap="round"${extra}/>`;

/** A lattice tower `s` across: four legs, cross-braced, its light on top. */
const lattice = (s: number, light: string, height = 'rgb(250,120,210)'): Part => {
  const h = s / 2;
  const braces = `M${-h},${-h} L${h},${h} M${h},${-h} L${-h},${h}`;
  return {
    grade: graded(0, 0, s + 4),
    heights:
      `<rect x="${-h}" y="${-h}" width="${s}" height="${s}" fill="none" stroke="${height}" stroke-width="2"/>` +
      `<path d="${braces}" stroke="${height}" stroke-width="1.4"/>`,
    tint: square(0, 0, s + 1.5, 0.5, '#c8321f'),
    paint: `<path d="${braces}" stroke="#fff" stroke-width="0.35" opacity="0.5"/>` + lamp(0, 0, light),
  };
};

// ─────────────────────────────────────────────── 11 ───────────────────────────────────────────────

/**
 * A heavy rocket stood on its pad, seen from above: a white core with a black interstage band, four strap-on
 * boosters round it, standing tall so its shadow runs long.
 */
const heavyRocket = (): Part => {
  const boosters = [45, 135, 225, 315].map((a) => polar(a, 10.5));
  return {
    heights:
      boosters.map((b) => disc(b.x, b.y, 4.4, 'rgb(250,170,220)')).join('') +
      disc(0, 0, 8.2, 'rgb(255,170,235)') +
      disc(0, 0, 4.5, 'url(#rg-nose)'),
    tint: boosters.map((b) => disc(b.x, b.y, 4.6, '#ecebe6')).join('') + disc(0, 0, 8.4, '#f2f2ee'),
    paint:
      `<circle r="6.4" fill="none" stroke="#25272a" stroke-width="1.8" opacity="0.9"/>` +
      boosters.map((b) => disc(b.x, b.y, 1.6, '#25272a', ' opacity="0.8"')).join('') +
      disc(-2.4, -2.4, 2.2, '#fff', ' opacity="0.6" filter="url(#rg-soft1)"') +
      // Oxygen boiling off.
      KEEP(glow(6, -9, 9, '#ffffff', 0.35, 'rg-soft6')),
  };
};

/**
 * 11, Launch Complex: the hub is the launch control blockhouse. Out one way a round launch mount holds a heavy
 * rocket beside its service tower, its swing arms reaching to it, and from under the mount a flame trench, sunk and
 * soot-black, runs off the tile. Fuel tanks and the rest go round
 * the other ways.
 */
function launch(k: Kit): Drawn {
  const { r, pads, taken } = k;
  const a = r.pick([-90, -150, -30]);
  const pad = polar(a, 64);
  const out = polar(a, 1);
  const side = polar(a + 90, 1);
  // The trench runs out sideways, along the tile, the tower on the other side.
  const tower = { x: pad.x - side.x * 25, y: pad.y - side.y * 25 };
  const trenchEnd = { x: pad.x + side.x * 56, y: pad.y + side.y * 56 };
  taken.push({ ...pad, r: 34 }, { ...tower, r: 9 }, { ...trenchEnd, r: 22 });
  const trench = `M${n(pad.x)},${n(pad.y)} L${n(trenchEnd.x)},${n(trenchEnd.y)}`;
  return merged([
    ...[
      {
        grade:
          graded(pad.x, pad.y, 40) +
          // The flame trench, sunk, with a fan of scorch where it comes out.
          `<path d="${trench}" stroke="rgb(70,120,40)" stroke-width="15" stroke-linecap="square"/>` +
          disc(trenchEnd.x + side.x * 14, trenchEnd.y + side.y * 14, 26, 'rgb(112,150,40)', ' filter="url(#rg-soft6)"'),
        // Its concrete lips stand up either side, the trench black between them.
        heights: `<path d="${trench}" stroke="${H.apron}" stroke-width="21" stroke-linecap="square"/><path d="${trench}" stroke="rgb(60,130,30)" stroke-width="13" stroke-linecap="square"/>`,
        tint: `<path d="${trench}" stroke="#a59c90" stroke-width="21" stroke-linecap="square"/>`,
        paint:
          `<path d="${trench}" stroke="#0d0a08" stroke-width="12" opacity="0.85" stroke-linecap="square"/>` +
          `<path d="${trench}" stroke="#F2B233" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.6" transform="translate(${n(out.x * 9)},${n(out.y * 9)})"/>` +
          disc(trenchEnd.x + side.x * 14, trenchEnd.y + side.y * 14, 24, '#140e0a', ' opacity="0.55" filter="url(#rg-soft6)"'),
      },
      // The mount: a deck of concrete, scorched in the middle, a hazard ring round it.
      {
        heights: disc(pad.x, pad.y, 31, H.apron) + disc(pad.x, pad.y, 29.5, 'url(#rg-scorch)'),
        tint:
          disc(pad.x, pad.y, 31, '#a59c90') +
          `<circle cx="${n(pad.x)}" cy="${n(pad.y)}" r="25" fill="none" stroke="#F2B233" stroke-width="1.6" stroke-dasharray="5 3"/>`,
        paint:
          `<circle cx="${n(pad.x)}" cy="${n(pad.y)}" r="29" fill="none" stroke="#2a2d30" stroke-width="0.5" opacity="0.5"/>` +
          [0, 90, 180, 270].map((d) => lamp(pad.x + polar(a + 45 + d, 27).x, pad.y + polar(a + 45 + d, 27).y, '#ff3b2a')).join(''),
      },
      // Swing arms from the tower to the rocket.
      ...[-5, 5].map((s) =>
        run(
          { x: tower.x + out.x * s, y: tower.y + out.y * s },
          { x: pad.x - side.x * 10 + out.x * s, y: pad.y - side.y * 10 + out.y * s },
          1.6,
          '#c8321f',
          'rgb(235,120,205)',
        ),
      ),
      placed(tower.x, tower.y, lattice(15, '#ff3b2a'), a),
      placed(pad.x, pad.y, heavyRocket(), r.range(0, 90), 1.35),
    ].map(kept),
    ...k.outskirts(
      32,
      [
        annex(2, [0.7, 0.8], k.tube(3, '#f2ad2c'), tankFarm, 1),
        annex(1, [0.6, 0.75], k.tube(2, '#8d969c'), () => dish('#ffcf4a'), 1.2),
        annex(0.8, [0.6, 0.78], k.tube(2.5, '#8d969c'), containers, 1.4),
      ],
      [a],
    ),
    hub(pads, '#3a3836', H.deck, '#ff7a1a', { tint: '#c9c2b4' }, { tint: '#E0703A', band: ['#a8441a', 0.8] }),
    ...k.around(34, '#ffcf4a'),
  ]);
}

/**
 * 11, Ring Accelerator: the Mass Driver wound into a loop. A ring track round the hub, its coils glowing
 * blue-white, pods riding it, and one straight run leaving it on a tangent, off the tile, where the pods are
 * thrown to orbit. Three walkways cross to it from the hub.
 */
function ring(k: Kit): Drawn {
  const { r, pads, taken } = k;
  const R = 62;
  const leave = r.pick([-120, -60, 180, 0]);
  const at = polar(leave, R);
  const dir = polar(leave - 90, 1);
  const end = { x: at.x + dir.x * 140, y: at.y + dir.y * 140 };
  const coils = Array.from({ length: 18 }, (_, i) => leave + 10 + i * 20);
  const exitCoils = Array.from({ length: 6 }, (_, i) => 14 + i * (12 - i));
  const pods = [r.range(0, 360), r.range(0, 360)];
  for (let a = 0; a < 360; a += 15) taken.push({ ...polar(a, R), r: 9 });
  const track = (w: number, fill: string) => `<circle r="${R}" fill="none" stroke="${fill}" stroke-width="${w}"/>`;
  const exit = (w: number, fill: string) => line(at, end, fill, w);
  const coilAt = (a: number, fill: string, w = 15, t = 3.4) =>
    `<g transform="rotate(${n(a)}) translate(${R},0)">${box(0, 0, w, t, 1, fill)}</g>`;
  const exitCoilAt = (d: number, fill: string) =>
    `<g transform="translate(${n(at.x + dir.x * d)},${n(at.y + dir.y * d)}) rotate(${n(leave)})">${box(0, 0, 15, 3.4, 1, fill)}</g>`;
  return merged([
    ...[
      {
        grade: track(22, H.graded) + exit(22, H.graded),
        heights:
          track(12, H.apron) +
          exit(12, H.apron) +
          track(9, H.deck) +
          exit(9, H.deck) +
          coils.map((a) => coilAt(a, H.dark)).join('') +
          exitCoils.map((d) => exitCoilAt(d, H.dark)).join('') +
          pods.map((a) => coilAt(a, 'rgb(200,160,210)', 6, 8)).join(''),
        tint:
          track(12, '#4a4640') +
          exit(12, '#4a4640') +
          track(8, '#d8d4cc') +
          exit(8, '#d8d4cc') +
          coils.map((a) => coilAt(a, '#3a3a44')).join('') +
          exitCoils.map((d) => exitCoilAt(d, '#3a3a44')).join('') +
          pods.map((a) => coilAt(a, '#e8f1f6', 6, 8)).join(''),
        paint: KEEP(
          track(1, '#bfeaff').replace('/>', ' opacity="0.6" stroke-dasharray="2 3"/>') +
            coils.map((a) => glow(polar(a, R).x, polar(a, R).y, 5, '#7fd8ff', 0.5, 'rg-soft1')).join('') +
            exitCoils.map((d) => glow(at.x + dir.x * d, at.y + dir.y * d, 6, '#9fe4ff', 0.6, 'rg-soft1')).join(''),
        ),
      },
      // Walkways out to the ring from under the hub (drawn over them), so they meet it on every side.
      ...[leave + 60, leave + 180, leave + 300].map((a) => run({ x: 0, y: 0 }, polar(a, R - 4), 4, '#8d969c')),
    ].map(kept),
    hub(pads, '#3a3836', H.deck, '#7fd8ff', { tint: '#c9c2b4' }, { tint: '#6f93a8', band: ['#2f6f8f', 0.8] }),
    ...k.around(R + 8, '#7fd8ff'),
  ]);
}

// ─────────────────────────────────────────────── 12 ───────────────────────────────────────────────

/**
 * 12, Deep Space Array: a radio dish laid in a crater, its mesh panels in rings and spokes, and the receiver
 * (the hub) hung high over its middle on cables from three pylons on the rim, so its shadow falls into the bowl.
 */
function array(k: Kit): Drawn {
  const { r, pads, taken } = k;
  const R = 84;
  const turn = r.pick([0, 60]);
  const pylons = [-90, 30, 150].map((a) => polar(a + turn, R + 6));
  taken.push({ x: 0, y: 0, r: R + 14 });
  const rings = [18, 30, 42, 54, 66, 78];
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  const mesh =
    rings.map((rr) => `<circle r="${rr}" fill="none"/>`).join('') +
    `<path d="${spokes.map((a) => `M${n(polar(a, 18).x)},${n(polar(a, 18).y)} L${n(polar(a, R).x)},${n(polar(a, R).y)}`).join(' ')}"/>`;
  const truss = pts([-90, 30, 150].map((a) => polar(a + turn, 40)));
  return merged([
    ...[
      {
        // The bowl: dug down into the ground, smooth.
        grade: disc(0, 0, R + 10, H.graded, ' filter="url(#rg-soft6)"') + disc(0, 0, R + 2, 'url(#rg-dishBowl)'),
        tint: disc(0, 0, R, '#c9d2d6'),
        paint:
          `<g stroke="#1e2426" stroke-width="0.5" opacity="0.4">${mesh}</g>` +
          `<circle r="${R}" fill="none" stroke="#e9ecee" stroke-width="2.2" opacity="0.7"/>` +
          disc(-20, -24, 30, '#ffffff', ' opacity="0.12" filter="url(#rg-soft6)"'),
      },
      // The cables, high enough to cast shadows into the dish.
      ...pylons.flatMap((p) =>
        [-3, 3].map((s) => {
          const q = turned({ x: s, y: 0 }, (Math.atan2(p.y, p.x) * 180) / Math.PI + 90);
          return run({ x: p.x + q.x, y: p.y + q.y }, { x: q.x * 4, y: q.y * 4 }, 0.9, '#d8d4cc', 'rgb(245,120,210)');
        }),
      ),
      // The receiver's truss round the hub.
      {
        heights: `<polygon points="${truss}" fill="none" stroke="rgb(250,120,210)" stroke-width="3" stroke-linejoin="round"/>`,
        tint: `<polygon points="${truss}" fill="none" stroke="#e8e2d4" stroke-width="3.6" stroke-linejoin="round"/>`,
      },
      ...pylons.map((p) => placed(p.x, p.y, lattice(12, '#ff3b2a', 'rgb(255,120,225)'), (Math.atan2(p.y, p.x) * 180) / Math.PI)),
    ].map(kept),
    hub(pads, '#a59c90', 'rgb(250,160,215)', '#ff3b2a', { tint: '#c9c2b4' }, { tint: '#3e6fb0', band: ['#2b4f86', 0.85] }),
    ...k.around(R + 10, '#ff3b2a'),
  ]);
}

/** One of the air plant's intakes: a fan `R` across, sunk in its cowl, blades blurred as they turn. */
const fan = (R: number, spin: number): Part => {
  const blades = Array.from({ length: 9 }, (_, i) => {
    const a = spin + i * 40;
    const [p, q, s] = [polar(a, 5), polar(a + 22, R - 3), polar(a + 34, R - 4)];
    return `M${n(p.x)},${n(p.y)} Q${n(polar(a + 12, R * 0.6).x)},${n(polar(a + 12, R * 0.6).y)} ${n(q.x)},${n(q.y)} L${n(s.x)},${n(s.y)} Q${n(polar(a + 22, R * 0.5).x)},${n(polar(a + 22, R * 0.5).y)} ${n(polar(a + 10, 5).x)},${n(polar(a + 10, 5).y)} Z`;
  }).join(' ');
  return {
    extent: R + 3,
    grade: graded(0, 0, R + 8),
    heights:
      disc(0, 0, R + 3, H.apron) +
      disc(0, 0, R + 1.5, H.deck) +
      disc(0, 0, R - 1.5, 'rgb(84,150,60)') +
      `<path d="${blades}" fill="rgb(150,150,150)"/>` +
      disc(0, 0, 5.5, 'url(#rg-nose)'),
    tint:
      disc(0, 0, R + 3, '#8d969c') + disc(0, 0, R - 1.5, '#1e2022') + `<path d="${blades}" fill="#5a5f66"/>` + disc(0, 0, 5.5, '#c9c4bc'),
    paint:
      `<circle r="${n(R * 0.62)}" fill="none" stroke="#cfd6dc" stroke-width="${n(R * 0.55)}" opacity="0.12" filter="url(#rg-soft3)"/>` +
      `<circle r="${n(R + 1.5)}" fill="none" stroke="#F2B233" stroke-width="0.8" stroke-dasharray="3 2" opacity="0.6"/>`,
  };
};

/**
 * 12, Atmosphere Plant: three great intake fans round the hub, joined by wide ducts, breathing the moon's
 * thin trace of gas out of its dust, a plume of vapour drifting off downwind.
 */
function air(k: Kit): Drawn {
  const { r, pads, taken } = k;
  // Fans small enough, and near enough, to stay on the tile whichever way they're turned.
  const [R, D] = [19, 56];
  const angles = [0, 120, 240].map((a) => a + r.pick([-8, 0, 8]));
  const fans = angles.map((a) => polar(a, D));
  fans.forEach((f) => taken.push({ ...f, r: R + 6 }));
  const wind = r.pick([-120, -150, 180]);
  const plume = Array.from({ length: 6 }, (_, i) => {
    const p = polar(wind, 18 + i * 16);
    const f = fans[1];
    return (
      disc(
        f.x + p.x + 4,
        f.y + p.y + 4,
        10 + i * 4,
        '#3a3530',
        ` opacity="${n(0.2 - i * 0.025)}" filter="url(#rg-soft6)" style="mix-blend-mode: multiply"`,
      ) + disc(f.x + p.x, f.y + p.y, 10 + i * 4, '#ffffff', ` opacity="${n(0.4 - i * 0.05)}" filter="url(#rg-soft6)"`)
    );
  }).join('');
  return merged([
    ...[
      ...angles.map((a) => run({ x: 0, y: 0 }, polar(a, D - R), 13, '#a7b0b6', H.pipe)),
      ...angles.map((a) => ({ paint: line(polar(a, 30), polar(a, D - 2 - R), '#F2B233', 0.6, ' stroke-dasharray="3 2" opacity="0.5"') })),
      ...fans.map((f, i) => placed(f.x, f.y, fan(R, r.range(0, 40) + i * 13))),
      { paint: KEEP(plume) },
    ].map(kept),
    hub(pads, '#9aa3a8', H.deck, '#7fe9ff', { tint: '#c9c2b4' }, { tint: '#5f93a8', band: ['#3e7f99', 0.85] }),
    ...k.around(40, '#7fe9ff'),
  ]);
}

// ─────────────────────────────────────────────── 13 ───────────────────────────────────────────────

const VIOLET = '#9a5cff';

/** A rounded rectangle path `w` by `h` round the origin. */
const rounded = (w: number, h: number, rx: number) => box(0, 0, w, h, rx, 'FILL');

/**
 * 13, The Dig: an excavation stepped down in benches round something buried long before the bases: a great
 * ring of dark stone half out of the ground, glyphs along it and a violet light in it. The hub stands on a
 * scaffold bridge across the dig, floodlights at its corners, string lines over its floor and spoil heaped by it.
 */
function dig(k: Kit): Drawn {
  const { r, pads, taken } = k;
  const turn = r.range(-12, 12);
  const [W, Hh, up] = [150, 140, -22];
  const ringAt = turned({ x: 0, y: -46 }, turn);
  taken.push({ x: 0, y: 0, r: 92 });
  const benches = [0, 1, 2, 3].map((i) => ({ w: W - i * 22, h: Hh - i * 22, red: 118 - i * 16 }));
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => turned({ x: (sx * (W + 10)) / 2, y: up + (sy * (Hh + 10)) / 2 }, turn));
  const glyphs = Array.from({ length: 22 }, (_, i) => i * 16.4).map((a) => polar(a, 30));
  // The ring, all of it showing but where the dig's wall still buries it.
  const arc = (rr: number) => {
    const [p, q] = [polar(-60, rr), polar(-120, rr)];
    return `M${n(p.x)},${n(p.y)} A${rr},${rr} 0 1 1 ${n(q.x)},${n(q.y)}`;
  };
  const strings = [-1, 0, 1]
    .map((i) => `M${-W / 2 + 22},${up + i * 26} H${W / 2 - 22} M${i * 30},${up - Hh / 2 + 22} V${up + Hh / 2 - 22}`)
    .join(' ');
  const spoil = [polar(turn + 160, 100), polar(turn + 20, 100)];
  return merged([
    ...[
      {
        grade:
          `<g transform="rotate(${n(turn)})">` +
          benches
            .map((b, i) =>
              rounded(b.w, b.h, 10 - i * 2)
                .replace('FILL', `rgb(${b.red},${150 + i * 20},${130 - i * 10})`)
                .replace('<rect', `<rect transform="translate(0,${up + i * 4})"`),
            )
            .join('') +
          `</g>` +
          spoil.map((s) => disc(s.x, s.y, 16, 'rgb(150,140,150)', ' filter="url(#rg-soft6)"')).join(''),
        paint: `<g transform="rotate(${n(turn)})"><path d="${strings}" stroke="#f2e8c8" stroke-width="0.4" opacity="0.55"/></g>`,
      },
      // The ring: dark stone, half buried, lit from inside.
      placed(ringAt.x, ringAt.y, {
        grade: disc(0, 0, 24, 'rgb(60,170,90)', ' filter="url(#rg-soft3)"'),
        heights: `<path d="${arc(30)}" fill="none" stroke="rgb(165,170,140)" stroke-width="10"/>`,
        tint: `<path d="${arc(30)}" fill="none" stroke="#2a2438" stroke-width="10.5"/>`,
        paint: KEEP(
          glow(0, 0, 28, '#6a2cff', 0.55, 'rg-soft6') +
            glow(0, 0, 12, '#d6b8ff', 0.4) +
            glyphs.map((g) => disc(g.x, g.y, 1.1, '#e2ccff', ' opacity="0.9"')).join('') +
            `<path d="${arc(30)}" fill="none" stroke="${VIOLET}" stroke-width="3" opacity="0.35" filter="url(#rg-soft1)" style="mix-blend-mode: screen"/>`,
        ),
      }),
      // The bridge the hub stands on, across the dig.
      placed(
        0,
        0,
        {
          heights: box(0, 0, W + 16, 20, 1, 'rgb(225,140,200)'),
          tint: box(0, 0, W + 16, 20.5, 1, '#c9a227'),
          paint: `<path d="${Array.from({ length: 16 }, (_, i) => `M${-W / 2 - 8 + i * 10.5},-10 l10.5,20 M${-W / 2 - 8 + i * 10.5},10 l10.5,-20`).join(' ')}" stroke="#5b3a08" stroke-width="0.6" opacity="0.6"/>`,
        },
        turn,
      ),
      ...corners.map((c) =>
        placed(c.x, c.y, {
          heights: disc(0, 0, 3.5, 'rgb(250,120,210)'),
          tint: disc(0, 0, 3.8, '#e9ecee'),
          paint: KEEP(glow(-c.x * 0.25, -c.y * 0.25, 22, '#fff1d0', 0.28, 'rg-soft6')) + lamp(0, 0, '#fff1d0'),
        }),
      ),
    ].map(kept),
    hub(pads, '#3a3836', 'rgb(240,160,215)', VIOLET, { tint: '#c9c2b4' }, { tint: VIOLET, band: ['#5a2fb0', 0.8] }),
    ...k.around(92, '#b07bff'),
  ]);
}

/**
 * 13, The Citadel: a command bunker inside a hexagonal blast wall, the hub in its sunk courtyard. Gun turrets
 * stand on three of its corners, a radar on another, a gate on the side away from the number, and a ring of
 * tank traps and a berm keep the ground round it.
 */
function citadel(k: Kit): Drawn {
  const { r, pads, taken } = k;
  const R = 56;
  taken.push({ x: 0, y: 0, r: R + 30 });
  const corners = [0, 60, 120, 180, 240, 300].map((a) => polar(a, R));
  const hex = (rr: number) => pts([0, 60, 120, 180, 240, 300].map((a) => polar(a, rr)));
  const gate = -90;
  const gateAt = polar(gate, R * 0.866);
  const traps = Array.from({ length: 22 }, (_, i) => polar(i * (360 / 22) + r.range(-5, 5), r.range(86, 98)));
  const trap = (p: Spot, fill: string) =>
    `<g transform="translate(${n(p.x)},${n(p.y)}) rotate(${n(r.range(0, 90))})"><path d="M-3,-3 L3,3 M3,-3 L-3,3" stroke="${fill}" stroke-width="1.6" stroke-linecap="round"/></g>`;
  const trapsAt = traps.map((p) => ({ p, rot: r.range(0, 90) }));
  const turret = (aim: number): Part => ({
    heights: disc(0, 0, 10, H.apron) + disc(0, 0, 8.5, 'rgb(225,150,200)') + line({ x: 0, y: 0 }, polar(aim, 19), 'rgb(230,120,200)', 2.6),
    tint: disc(0, 0, 10, '#4a4540') + disc(0, 0, 8.5, '#6c665e') + line({ x: 0, y: 0 }, polar(aim, 19), '#2a282c', 3),
    paint: `<circle r="5" fill="none" stroke="#1e1c1a" stroke-width="0.5" opacity="0.6"/>` + lamp(-4, -4, '#ff3b2a'),
  });
  return merged([
    ...[
      {
        // The berm round it, and the courtyard sunk inside the walls.
        grade:
          `<circle r="78" fill="none" stroke="rgb(150,160,140)" stroke-width="10" filter="url(#rg-soft6)"/>` +
          `<polygon points="${hex(R + 14)}" fill="${H.graded}" filter="url(#rg-soft3)"/>` +
          `<polygon points="${hex(R - 6)}" fill="rgb(112,190,120)"/>`,
        heights: trapsAt.map(({ p }) => trap(p, 'rgb(210,120,200)')).join(''),
        tint: trapsAt.map(({ p }) => trap(p, '#3a3836')).join(''),
      },
      {
        heights:
          `<polygon points="${hex(R + 2)}" fill="none" stroke="${H.apron}" stroke-width="15" stroke-linejoin="round"/>` +
          `<polygon points="${hex(R)}" fill="none" stroke="rgb(215,160,205)" stroke-width="11" stroke-linejoin="round"/>` +
          // The gate: a gap in the wall.
          disc(gateAt.x, gateAt.y, 9, 'rgb(112,190,120)'),
        tint:
          `<polygon points="${hex(R + 1)}" fill="none" stroke="#8c8478" stroke-width="14" stroke-linejoin="round"/>` +
          disc(gateAt.x, gateAt.y, 9, '#5a5550'),
        paint:
          `<polygon points="${hex(R)}" fill="none" stroke="#1e1c1a" stroke-width="0.6" stroke-dasharray="6 3" opacity="0.4"/>` +
          line(
            { x: gateAt.x - 8, y: gateAt.y },
            { x: gateAt.x + 8, y: gateAt.y },
            '#F2B233',
            1.2,
            ' stroke-dasharray="2 1.5" opacity="0.8"',
          ),
      },
      ...[0, 2, 4].map((i) => placed(corners[(i + 1) % 6].x, corners[(i + 1) % 6].y, turret(r.range(-30, 30)), (i + 1) * 60)),
      placed(corners[3].x, corners[3].y, dish('#ff3b2a'), 0, 1.2),
      ...[0, 2, 5].map((i) => ({
        heights: square(corners[i].x, corners[i].y, 13, 2, 'rgb(225,160,205)'),
        tint: square(corners[i].x, corners[i].y, 13.5, 2, '#7c766c'),
      })),
    ].map(kept),
    hub(pads, '#3a3836', H.deck, '#ff3b2a', { tint: '#c9c2b4' }, { tint: '#8f1f12', band: ['#c8321f', 0.7] }),
    ...k.around(R + 30, '#ff3b2a'),
  ]);
}

/**
 * 13, The Drydock: a spacecraft being built in a dock cut into the ground, its bow plated and its stern still bare
 * ribs, a gantry crane across it on rails, welders' sparks along it. The hub is the dock's control deck beside
 * it.
 */
function drydock(k: Kit): Drawn {
  const { r, pads, taken } = k;
  const turn = r.pick([-20, -10, 0, 160, 170]);
  const [L, Wd] = [150, 40];
  const c = turned({ x: 0, y: -52 }, turn);
  taken.push({ ...c, r: 0 });
  for (let x = -L / 2; x <= L / 2; x += 20) taken.push({ ...turned({ x, y: -52 }, turn), r: 30 });
  const hull = `M${L / 2 - 4},0 C${L / 2 - 14},${-Wd / 2} ${L / 4},${-Wd / 2} 0,${-Wd / 2} L${-L / 2 + 14},${-Wd / 2 + 2} L${-L / 2 + 8},${-Wd / 2 + 6} L${-L / 2 + 8},${Wd / 2 - 6} L${-L / 2 + 14},${Wd / 2 - 2} L0,${Wd / 2} C${L / 4},${Wd / 2} ${L / 2 - 14},${Wd / 2} ${L / 2 - 4},0 Z`;
  const bow = `M0,${-Wd / 2} C${L / 4},${-Wd / 2} ${L / 2 - 14},${-Wd / 2} ${L / 2 - 4},0 C${L / 2 - 14},${Wd / 2} ${L / 4},${Wd / 2} 0,${Wd / 2} Z`;
  const ribs = Array.from({ length: 9 }, (_, i) => -L / 2 + 14 + i * 7);
  const plates = Array.from({ length: 8 }, (_, i) => 10 + i * 7.5);
  const crane = r.range(-L / 3, L / 3);
  const sparks = Array.from({ length: 4 }, () => ({ x: r.range(-L / 2 + 10, L / 3), y: r.pick([-1, 1]) * r.range(Wd / 2 - 6, Wd / 2) }));
  const vessel: Part = {
    grade: box(0, 0, L + 26, Wd + 28, 6, H.graded, ' filter="url(#rg-soft3)"') + box(0, 0, L + 16, Wd + 18, 4, 'rgb(100,180,110)'),
    heights:
      // Crane rails along the dock's sides, then the hull.
      [-1, 1].map((s) => box(0, s * (Wd / 2 + 6), L + 12, 2, 0.5, H.pipe)).join('') +
      `<path d="${hull}" fill="rgb(175,150,190)"/>` +
      `<path d="${bow}" fill="rgb(232,150,212)"/>` +
      ribs.map((x) => box(x, 0, 2, Wd - 6, 1, 'rgb(225,150,210)')).join('') +
      box(-L / 4, 0, L / 2 - 14, 3, 1, 'rgb(225,150,210)') +
      // The engines at the stern.
      [-10, 0, 10].map((y) => disc(-L / 2 + 4, y, 5, 'rgb(200,130,190)')).join(''),
    tint:
      [-1, 1].map((s) => box(0, s * (Wd / 2 + 6), L + 12, 2.4, 0.5, '#4a4640')).join('') +
      `<path d="${hull}" fill="#1e2022"/>` +
      `<path d="${bow}" fill="#d8d4cc"/>` +
      ribs.map((x) => box(x, 0, 2.2, Wd - 6, 1, '#b8b2a6')).join('') +
      box(-L / 4, 0, L / 2 - 14, 3.2, 1, '#b8b2a6') +
      [-10, 0, 10].map((y) => disc(-L / 2 + 4, y, 5.2, '#3a3a44')).join(''),
    paint:
      plates.map((x) => `<path d="M${x},${-Wd / 2 + 3} V${Wd / 2 - 3}" stroke="#1e2426" stroke-width="0.35" opacity="0.4"/>`).join('') +
      `<path d="M${L / 2 - 30},-4 H${L / 2 - 10} M${L / 2 - 30},4 H${L / 2 - 10}" stroke="#9fd8ff" stroke-width="1.4" opacity="0.7"/>` +
      `<path d="M0,0 H${L / 2 - 8}" stroke="#c8321f" stroke-width="1.2" opacity="0.7"/>` +
      KEEP(sparks.map((s) => glow(s.x, s.y, 4, '#ffb347', 0.9, 'rg-soft1') + disc(s.x, s.y, 0.8, '#ffffff')).join('')),
  };
  const gantry: Part = {
    heights: box(crane, 0, 8, Wd + 18, 1, 'rgb(250,120,210)') + square(crane, 4, 6, 1, 'rgb(255,130,220)'),
    tint: box(crane, 0, 8.5, Wd + 18.5, 1, '#d9a020'),
    paint:
      `<path d="M${crane - 4},${-Wd / 2 - 9} L${crane + 4},${Wd / 2 + 9} M${crane + 4},${-Wd / 2 - 9} L${crane - 4},${Wd / 2 + 9}" stroke="#5b3a08" stroke-width="0.5" opacity="0.6"/>` +
      lamp(crane, -Wd / 2 - 7, '#ffcf4a') +
      lamp(crane, Wd / 2 + 7, '#ffcf4a'),
  };
  return merged([
    ...[
      placed(c.x, c.y, merged([vessel, gantry]), turn),
      run({ x: 0, y: -15 }, turned({ x: 0, y: -52 + Wd / 2 + 8 }, turn), 5, '#8d969c'),
    ].map(kept),
    ...k.outskirts(
      32,
      [
        annex(1.2, [0.7, 0.8], k.tube(3, '#8d969c'), (rr) => landingPad(rr, '#ffcf4a'), 1.15),
        annex(1, [0.6, 0.78], k.tube(2.5, '#8d969c'), containers, 1.5),
        annex(0.8, [0.6, 0.78], k.tube(2.5, '#8d969c'), solar, BIG, true),
        annex(0.6, [0.6, 0.78], k.tube(2.5, '#8d969c'), silos, BIG, true),
      ],
      [turn - 90, turn - 150, turn - 30],
    ),
    hub(pads, '#3a3836', H.deck, '#ffcf4a', { tint: '#c9c2b4' }, { tint: '#d9a020', band: ['#8a6a1c', 0.8] }),
    ...k.around(34, '#ffcf4a'),
  ]);
}

/**
 * The landmarks by design name, and the number each is drawn for, each number's own first (set.ts
 * `LANDMARK_TILES` says which tile is which). The others are the drafts it was picked from (mood board
 * Landmarks), kept to draw by name.
 */
export const LANDMARKS: Record<string, { number: number; draw: (k: Kit) => Drawn }> = {
  ring: { number: 11, draw: ring },
  launch: { number: 11, draw: launch },
  array: { number: 12, draw: array },
  air: { number: 12, draw: air },
  citadel: { number: 13, draw: citadel },
  dig: { number: 13, draw: dig },
  drydock: { number: 13, draw: drydock },
};
