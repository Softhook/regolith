import type { Rng } from '../rng';
import { n } from '../svg';
import type { Spot } from '../tile/geometry';
import { polar, inside, toward } from './core';
import { H, type Part, placed, merged, disc, square, box, graded, glow, lamp } from './parts';

/** Rockets, landers, rovers and the small things round a base: landing pads and what stands on them, crates, beacons, an old probe. */

/** Four landing legs splayed out to `reach`, each on a foot, `height` high. */
const legs = (reach: number, angles = [45, 135, 225, 315], height = H.pipe) =>
  angles
    .map((a) => {
      const { x, y } = polar(a, reach);
      return `<path d="M0,0 L${n(x)},${n(y)}" stroke="${height}" stroke-width="1.3"/>` + disc(x, y, 1.5, height);
    })
    .join('');

/** A craft's legs: they stand on a pad's deck, so above it. */
const craftLegs = (reach: number) => legs(reach, undefined, 'rgb(206,120,200)');

/** A rocket stood on its tail, seen from above: the nose high in the middle, four fins and four legs, banded. */
const rocket = (r: Rng): Part => {
  const band = r.pick(['#e8322a', '#2a2d30', '#2f6fd0']);
  const fins = [0, 90, 180, 270].map((a) => `<path d="M0,0 L9,0" transform="rotate(${a})"`);
  return {
    heights:
      craftLegs(9.5) + fins.map((f) => `${f} stroke="rgb(218,160,200)" stroke-width="1.8"/>`).join('') + disc(0, 0, 5.4, 'url(#rg-nose)'),
    tint: fins.map((f) => `${f} stroke="${band}" stroke-width="2.2"/>`).join('') + disc(0, 0, 5.6, '#f2f2ee'),
    paint:
      `<circle r="3.9" fill="none" stroke="${band}" stroke-width="0.9" opacity="0.85"/>` +
      `<path d="M-5.2,0 H5.2" stroke="#1e2426" stroke-width="0.25" opacity="0.4"/>` +
      disc(-1.5, -1.5, 1.6, '#fff', ' opacity="0.55" filter="url(#rg-soft1)"'),
  };
};

/** A spaceplane: delta wings, a dark nose and its leading edges heat-tiled. */
const spaceplane = (): Part => {
  const wing = 'M11,0 L1,-3 L-8,-10 L-10,-10 L-9,0 L-10,10 L-8,10 L1,3 Z';
  const body = 'M12,0 C10,-2.2 4,-2.6 -10,-2.4 L-10,2.4 C4,2.6 10,2.2 12,0 Z';
  return {
    heights: `<path d="${wing}" fill="rgb(212,170,205)"/><path d="${body}" fill="rgb(236,170,215)"/>`,
    tint: `<path d="${wing}" fill="#ecebe6" stroke="#ecebe6" stroke-width="0.6"/>`,
    paint:
      '<path d="M1,-3 L-8,-10 M1,3 L-8,10" stroke="#25272a" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>' +
      '<path d="M12,0 C11,-1.6 9,-2 7,-2.1 L7,2.1 C9,2 11,1.6 12,0 Z" fill="#25272a" opacity="0.9"/>' +
      '<path d="M6,-1 L4,-1.2 L4,1.2 L6,1 Z" fill="#9fd8ff" opacity="0.8"/>' +
      '<path d="M-3,-5 L-7,-5 M-3,5 L-7,5" stroke="#e8322a" stroke-width="0.7" opacity="0.7"/>' +
      disc(-10.5, -1.2, 0.9, '#ff9a2a', ' opacity="0.7"') +
      disc(-10.5, 1.2, 0.9, '#ff9a2a', ' opacity="0.7"'),
  };
};

/** A squat lander, its body wrapped in gold foil, an aerial on top. */
const lander = (): Part => {
  const hex = [0, 60, 120, 180, 240, 300].map((a) => `${n(polar(a, 5).x)},${n(polar(a, 5).y)}`).join(' ');
  return {
    heights: craftLegs(9) + `<polygon points="${hex}" fill="rgb(225,90,190)"/>` + disc(1.5, -1, 1.8, 'rgb(244,150,215)'),
    tint: `<polygon points="${hex}" fill="#d9a531" stroke="#d9a531" stroke-width="0.6"/>` + disc(1.5, -1, 2, '#e9ecee'),
    paint:
      `<polygon points="${hex}" fill="none" stroke="#5b3a08" stroke-width="0.4" opacity="0.6"/>` +
      '<path d="M-3,2 L0,3.5 L2.5,1.5" stroke="#fff3c0" stroke-width="0.5" fill="none" opacity="0.6"/>' +
      lamp(-2.5, -2, '#e8322a'),
  };
};

/** A landing pad ringed in amber, scorched where engines fired on it, mostly with a rocket or lander standing on it. */
export function landingPad(r: Rng, light: string): Part {
  const lamps = [0, 90, 180, 270].map((a) => toward(a, 0.19));
  const craft = r.chance(0.4) ? r.pick([rocket, rocket, spaceplane, lander])(r) : undefined;
  return {
    extent: 15,
    ...merged([
      {
        grade: graded(0, 0, 20),
        heights: disc(0, 0, 15, H.apron) + disc(0, 0, 14, 'url(#rg-scorch)'),
        // Its ring in the tint, not the paint, so a craft standing on it covers it.
        tint: disc(0, 0, 15, '#8d969c') + '<circle r="11" fill="none" stroke="#F2B233" stroke-width="1.2" stroke-dasharray="4 2.6"/>',
        paint:
          (craft ? '' : '<path d="M-4,-4 V4 M4,-4 V4 M-4,0 H4" stroke="#F2B233" stroke-width="1.3" opacity="0.85"/>') +
          lamps.map((l) => lamp(l.x, l.y, light)).join(''),
      },
      ...(craft ? [placed(0, 0, craft, r.range(0, 360))] : []),
    ]),
  };
}

/** A six-wheeled rover, facing +x: a white body, a solar deck, its mast and headlights. */
export const rover = (): Part => {
  const wheels = [-3.4, 0, 3.4].flatMap((x) => [disc(x, -3.6, 1.3, 'rgb(170,60,60)'), disc(x, 3.6, 1.3, 'rgb(170,60,60)')]).join('');
  return {
    heights: wheels + box(0, 0, 9, 5.6, 1, 'rgb(196,150,195)') + box(-1, 0, 5, 4.4, 0.4, H.panel) + disc(3, -1.6, 1, 'rgb(225,120,205)'),
    tint:
      [-3.4, 0, 3.4].map((x) => box(x, 0, 2.4, 9.4, 1, '#2a282c')).join('') +
      box(0, 0, 9.4, 6, 1, '#e9e4da') +
      box(-1, 0, 5, 4.4, 0.4, '#2448b8'),
    paint:
      box(-1, 0, 5, 4.4, 0.4, 'none', ' stroke="#bfe6ff" stroke-width="0.25" opacity="0.6"') +
      disc(3, -1.6, 0.5, '#1e2426') +
      glow(5.5, -1.6, 1.8, '#fff6e0', 0.6, 'rg-soft1') +
      glow(5.5, 1.6, 1.8, '#fff6e0', 0.6, 'rg-soft1') +
      disc(4.6, -1.6, 0.45, '#fffbe8') +
      disc(4.6, 1.6, 0.45, '#fffbe8'),
  };
};

/** Two or three crates stacked by a building, in the containers' colours. */
export function crates(r: Rng): Part {
  let heights = '';
  let tint = '';
  let paint = '';
  for (let i = r.int(2, 4); i > 0; i--) {
    const [x, y, s, turn] = [r.range(-3.5, 3.5), r.range(-3.5, 3.5), r.range(2.6, 3.8), r.range(-25, 25)];
    const at = ` transform="rotate(${n(turn)} ${n(x)} ${n(y)})"`;
    heights += box(x, y, s, s, 0.3, `rgb(${r.int(170, 200)},150,190)`, at);
    tint += box(x, y, s, s, 0.3, r.pick(['#d9622b', '#e8e2d4', '#2f6fd0', '#c9a227', '#7a7f84']), at);
    paint += `<path d="M${n(x - s / 2)},${n(y)} H${n(x + s / 2)}"${at} stroke="#000" stroke-width="0.25" opacity="0.35"/>`;
  }
  return { heights, tint, paint };
}

/** A survey beacon: a thin post on a tripod, its light blinking. */
export const beacon = (r: Rng, light: string): Part => ({
  heights: legs(2, [90, 210, 330]) + disc(0, 0, 0.9, 'rgb(250,120,200)'),
  tint: disc(0, 0, 2.6, '#e9ecee'),
  paint: lamp(0, 0, r.pick([light, '#ff3b3b'])),
});

/** An old probe from before the bases, long dead and dusty, its parachute lying spread out on the ground where it came down. */
export function probe(r: Rng): Part {
  const [px, py] = [r.range(14, 22), r.range(-6, 6)];
  const gores = Array.from({ length: 10 }, (_, i) => {
    const [a, b] = [polar(i * 36, 7), polar((i + 1) * 36, 7)];
    return `<path d="M${n(px)},${n(py)} L${n(px + a.x)},${n(py + a.y)} A7,7 0 0 1 ${n(px + b.x)},${n(py + b.y)} Z" fill="${i % 2 ? '#e8e2d4' : '#d9622b'}"/>`;
  }).join('');
  // Centred between the probe and its chute.
  return placed(-px / 2, -py / 2, {
    // The chute lies flat in the dust, folded where it fell: part of the ground, lit with it.
    grade:
      `<ellipse cx="${n(px)}" cy="${n(py)}" rx="7.5" ry="7" fill="rgb(140,200,170)" filter="url(#rg-soft1)"/>` +
      `<path d="M${n(px - 7)},${n(py)} L0,0 M${n(px - 5)},${n(py - 5)} L0,0 M${n(px - 5)},${n(py + 5)} L0,0" stroke="rgb(132,120,170)" stroke-width="0.4"/>`,
    heights: legs(5.5, [30, 150, 270]) + square(0, 0, 5, 0.6, 'rgb(200,90,150)') + disc(-1, 1, 2.6, 'rgb(215,170,190)'),
    tint: square(0, 0, 5.4, 0.6, '#b89a5a') + disc(-1, 1, 2.8, '#c9c4bc'),
    paint:
      `<g opacity="0.7" style="mix-blend-mode: multiply">${gores}</g>` +
      `<circle cx="${n(px)}" cy="${n(py)}" r="7" fill="#c9783f" opacity="0.25"/>`,
  });
}

/** Tyre tracks behind a rover at p facing `turn`: two treads wandering back the way it came, sunk and darkened, until they leave the tile. */
export function tyreTracks(r: Rng, p: Spot, turn: number, centre: Spot): Part {
  const pts: Spot[] = [];
  let [x, y, a] = [p.x, p.y, ((turn + 180) * Math.PI) / 180];
  for (let i = r.int(6, 14); i > 0 && inside(centre.x + x, centre.y + y) > 2; i--) {
    pts.push({ x, y });
    a += r.range(-0.35, 0.35);
    [x, y] = [x + 6 * Math.cos(a), y + 6 * Math.sin(a)];
  }
  if (pts.length < 2) return {};
  const tread = (side: number) =>
    pts
      .map((q, i) => {
        const [u, v] = [pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]];
        const len = Math.hypot(u.x - v.x, u.y - v.y) || 1;
        return `${i ? 'L' : 'M'}${n(q.x - (side * (u.y - v.y)) / len)},${n(q.y + (side * (u.x - v.x)) / len)}`;
      })
      .join(' ');
  return {
    grade: [-5, 5]
      .map((s) => `<path d="${tread(s)}" fill="none" stroke="rgb(124,100,108)" stroke-width="1.3" stroke-linejoin="round" opacity="0.6"/>`)
      .join(''),
  };
}
