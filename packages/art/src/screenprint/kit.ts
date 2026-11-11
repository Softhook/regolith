import type { Rng } from '../rng';
import { esc, n } from '../svg';
import type { World } from '../tile/look';
import { INKS, type MechInk } from './inks';
import { mech as posed, type Pose } from './pose';
import type { MechKind } from './mechs';

/**
 * What screenprint card scenes are made from: the stage (paper, sky and the world's ground), the buildings and
 * small things the Regolith tiles have (regolith/base.ts, buildings.ts, craft.ts), drawn side on as flat prints,
 * the crews in their suits, the mechs (pose.ts), and a few effects. Every part prints in up to four passes, as
 * the Vocabulary board's do: a colour plate a little off register, the key ink, the amber accent, and the
 * objective's own spot colour (habitat green, refinery gold, ice, reactor heat, crystal violet).
 *
 * Parts are drawn in the board's units, standing on y 0 round x 0, a person 60 tall; scenes place them in mm.
 */

/** The fonts the screenprint cards are lettered in, as the Vocabulary and CardStyles boards are. */
export const SP_FONTS = {
  stencil: "'Saira Stencil One', 'Arial Black', Impact, sans-serif",
  display: "Inter, 'Helvetica Neue', Arial, sans-serif",
  condensed: "'Barlow Condensed', 'Arial Narrow', Arial, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
} as const;

/** A scene's stage: the art window (mm), its inks, and somewhere to put defs. */
export interface Stage {
  id: string;
  r: Rng;
  /** The one-shot decks print on night paper, in bone. */
  dark: boolean;
  world: World;
  /** The visible art: 63.5 wide, `h` tall; it is drawn out into the bleed round it. */
  w: number;
  h: number;
  paper: string;
  key: string;
  ink: MechInk;
  /** The card's colour plate (its category's). */
  plate: string;
  defs: string[];
}

/** The bleed round the visible art, drawn into. */
const B = 3.2;

/** The world's ground: its own ink, a darker one for craters and shade, and how the sky looks above it. */
export const GROUND: Record<World, { ground: string; shade: string; light: string }> = {
  phobos: { ground: INKS.grey, shade: '#5E5A55', light: '#B9B3A9' },
  deimos: { ground: INKS.dust, shade: INKS.rust, light: '#E8C79A' },
  mars: { ground: INKS.oxide, shade: '#9C4A26', light: INKS.dust },
};

/** Each world's sky colour, where a scene isn't on bare paper (the battle strip). */
export const SKY: Record<World, string> = { phobos: GROUND.phobos.light, deimos: GROUND.deimos.light, mars: GROUND.mars.light };

/** The halftone screens, once per card: the key ink's, bone's, and the ground shade's. */
export function screens(s: Stage): string {
  const dot = (id: string, size: number, r: number, fill: string, angle = 30) =>
    `<pattern id="${s.id}-${id}" width="${n(size)}" height="${n(size)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><circle cx="${n(size / 2)}" cy="${n(size / 2)}" r="${n(r)}" fill="${fill}"/></pattern>`;
  return (
    dot('key', 1, 0.3, s.key) +
    dot('fine', 0.7, 0.2, s.key) +
    dot('bone', 1, 0.28, INKS.bone) +
    dot('shade', 1, 0.32, GROUND[s.world].shade, 15) +
    dot('plate', 1.1, 0.34, s.plate, 45)
  );
}

/** A halftone fill by name. */
export const ht = (s: Stage, which: 'key' | 'fine' | 'bone' | 'shade' | 'plate') => `url(#${s.id}-${which})`;

export const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"${extra}/>`;

/** The paper over the whole art window and its bleed. */
export function paperGround(s: Stage): string {
  return rect(-B, -B, s.w + 2 * B, s.h + 2 * B, s.paper);
}

/**
 * The sky: on Phobos and Deimos, Mars hangs in it, banded and shaded in halftone (or `planet: false`); on
 * Mars, Phobos and Deimos are two small grey moons. Stars on night paper.
 */
export function sky(s: Stage, o: { planet?: false | { x: number; y: number; r: number }; stars?: boolean } = {}): string {
  let out = '';
  if (s.dark && o.stars !== false)
    for (let i = 0; i < 18; i++)
      out += `<circle cx="${n(s.r.range(-B, s.w + B))}" cy="${n(s.r.range(-B, s.h * 0.6))}" r="${n(s.r.range(0.1, 0.28))}" fill="${INKS.bone}" opacity="${n(s.r.range(0.4, 0.9))}"/>`;
  const p = o.planet === false ? undefined : (o.planet ?? { x: s.w * 0.8, y: s.h * 0.24, r: 11 });
  if (!p) return out;
  if (s.world === 'mars') {
    // Phobos, lumpy and grey, and Deimos, a dot.
    out += `<ellipse cx="${n(p.x)}" cy="${n(p.y)}" rx="${n(p.r * 0.36)}" ry="${n(p.r * 0.28)}" fill="${INKS.grey}" transform="rotate(-20 ${n(p.x)} ${n(p.y)})"/>`;
    out += `<circle cx="${n(p.x - p.r * 0.2)}" cy="${n(p.y + p.r * 0.02)}" r="${n(p.r * 0.06)}" fill="${GROUND.phobos.shade}"/>`;
    out += `<circle cx="${n(p.x - p.r * 1.3)}" cy="${n(p.y + p.r * 0.5)}" r="${n(p.r * 0.1)}" fill="${INKS.grey}"/>`;
    return out;
  }
  const clip = `${s.id}-mars`;
  s.defs.push(`<clipPath id="${clip}"><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}"/></clipPath>`);
  const bands = [0.12, 0.3, 0.46, 0.63, 0.8]
    .map((f, i) => rect(p.x - p.r, p.y - p.r + 2 * p.r * f, 2 * p.r, p.r * (0.06 + 0.04 * (i % 3)), INKS.rust))
    .join('');
  // The night side in halftone, a crescent of the key screen.
  const night = `<circle cx="${n(p.x + p.r * 0.55)}" cy="${n(p.y + p.r * 0.35)}" r="${n(p.r * 1.05)}" fill="${ht(s, 'key')}"/>`;
  return out + `<g clip-path="url(#${clip})"><circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(p.r)}" fill="${INKS.dust}"/>${bands}${night}</g>`;
}

/**
 * The world's ground from the horizon at `y` down past the window: its own ink, a halftone band where it meets
 * the sky, rims of craters and boulders on the horizon, and on the ground the world's marks: Phobos's craters,
 * Deimos's bright slide streaks, Mars's dune ripples and dust devils' tracks.
 */
export function land(s: Stage, y: number, o: { rims?: boolean; marks?: boolean } = {}): string {
  const g = GROUND[s.world];
  const r = s.r.fork('land');
  let out = '';
  // Crater rims and boulders on the horizon, cut in the ground's ink.
  if (o.rims !== false) {
    let x = -B;
    while (x < s.w + B) {
      const w = r.range(8, 20);
      const h = r.range(0.6, 2.2);
      out += `<path d="M${n(x)},${n(y + 0.2)} Q${n(x + w * 0.2)},${n(y - h)} ${n(x + w * 0.45)},${n(y - h * 0.9)} Q${n(x + w * 0.7)},${n(y - h * 0.6)} ${n(x + w)},${n(y + 0.2)} Z" fill="${g.ground}"/>`;
      if (r.chance(0.4))
        out += `<path d="M${n(x + w * 0.6)},${n(y + 0.2)} l${n(1)},-${n(1.6)} l${n(1.6)},-0.3 l${n(0.8)},${n(1.9)} Z" fill="${g.ground}"/>`;
      x += w * r.range(0.7, 1.2);
    }
  }
  out += rect(-B, y, s.w + 2 * B, s.h + 2 * B - y, g.ground);
  out += rect(-B, y, s.w + 2 * B, 2.2, ht(s, 'shade'), ' opacity="0.9"');
  if (o.marks !== false) {
    const depth = s.h + B - y;
    if (s.world === 'phobos')
      for (let i = 0; i < 5; i++) {
        const cx = r.range(0, s.w);
        const cy = y + 3 + r.range(0, depth - 4);
        const rx = r.range(2, 5) * (0.5 + (cy - y) / depth);
        out += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(rx * 0.22)}" fill="${g.shade}"/><path d="M${n(cx - rx)},${n(cy)} A${n(rx)},${n(rx * 0.22)} 0 0,0 ${n(cx + rx)},${n(cy)}" fill="none" stroke="${g.light}" stroke-width="0.35"/>`;
      }
    if (s.world === 'deimos')
      for (let i = 0; i < 4; i++) {
        const x0 = r.range(0, s.w);
        out += `<path d="M${n(x0)},${n(y + 0.6)} l${n(r.range(-4, 4))},${n(depth)} l${n(r.range(1.5, 3))},0 Z" fill="${g.light}" opacity="0.7"/>`;
      }
    if (s.world === 'mars') {
      for (let i = 0; i < 6; i++) {
        const yy = y + 2.5 + i * (depth / 6);
        const x0 = r.range(-B, s.w * 0.4);
        out += `<path d="M${n(x0)},${n(yy)} q${n(4)},-0.8 ${n(8)},0 t${n(8)},0 t${n(8)},0 t${n(8)},0" fill="none" stroke="${g.shade}" stroke-width="0.4" opacity="0.8"/>`;
      }
      const x0 = r.range(s.w * 0.3, s.w);
      out += `<path d="M${n(x0)},${n(y + 1)} c-6,3 4,6 -3,10 s-4,5 2,9" fill="none" stroke="${INKS.key}" stroke-width="0.9" opacity="0.25"/>`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parts: buildings and small things, side on. `C` is the pass's ink (currentColor); PAPER the paper's.

/** A part's passes: the key shape, its amber accent, and the objective's own spot colour where it has one. */
interface Print {
  key: string;
  acc?: string;
  spot?: string;
  /** The spot pass's ink. */
  spotInk?: string;
}

const LINE = (w: number) => ` fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

const PARTS = {
  // 7 Habitat: the great dome over the hub, small domes and a tube, greenhouse vaults; glass in habitat green.
  habitat: {
    key:
      '<rect x="-80" y="-5" width="160" height="5"/><path d="M-74,-4 A22,22 0 0,1 -30,-4 Z"/><rect x="-34" y="-16" width="14" height="10"/>' +
      '<path d="M-22,-4 A40,40 0 0,1 58,-4 Z"/>' +
      `<path d="M44,-38 L54,-62"${LINE(2)}/><path d="M46,-66 a9,5 0 0,1 16,6 Z"/>` +
      '<path d="M62,-4 a8,14 0 0,1 16,0 Z M78,-4 a8,14 0 0,1 16,0 Z"/>',
    spot: '<path d="M-14,-6 A32,32 0 0,1 50,-6 L42,-6 A24,24 0 0,0 -6,-6 Z"/><path d="M64,-5 a6,11 0 0,1 12,0 Z M80,-5 a6,11 0 0,1 12,0 Z"/>',
    spotInk: INKS.green,
    acc: '<rect x="4" y="-22" width="5" height="4"/><rect x="12" y="-22" width="5" height="4"/><rect x="20" y="-22" width="5" height="4"/><rect x="28" y="-22" width="5" height="4"/><rect x="-56" y="-14" width="8" height="10"/>',
  },
  /** The habitat's greenhouse halls: vaulted glass, violet. */
  greenhouse: {
    key:
      '<rect x="-60" y="-4" width="120" height="4"/>' + [-40, 0, 40].map((x) => `<path d="M${x - 20},-4 a20,26 0 0,1 40,0 Z"/>`).join(''),
    spot: [-40, 0, 40].map((x) => `<path d="M${x - 16},-5 a16,21 0 0,1 32,0 Z"/>`).join(''),
    spotInk: INKS.violet,
    acc: [-40, 0, 40].map((x) => `<path d="M${x},-28 L${x},-5"${LINE(1.4)}/>`).join(''),
  },
  solar: {
    key: [-36, 0, 36]
      .map(
        (x) =>
          `<path d="M${x - 16},-22 L${x + 16},-30 L${x + 16},-26 L${x - 16},-18 Z"/><rect x="${x - 1.5}" y="-24" width="3" height="24"/>`,
      )
      .join(''),
    acc: [-36, 0, 36]
      .map((x) => `<path d="M${x - 8},-23 L${x - 8},-19 M${x},-25 L${x},-21 M${x + 8},-27 L${x + 8},-23"${LINE(0.8)}/>`)
      .join(''),
  },
  // 8 Refinery: tanks, stacks burning off gas, a lattice of pipework; gold.
  refinery: {
    key:
      '<rect x="-74" y="-40" width="34" height="40"/><ellipse cx="-57" cy="-40" rx="17" ry="5"/><rect x="-36" y="-28" width="26" height="28"/><ellipse cx="-23" cy="-28" rx="13" ry="4"/>' +
      '<rect x="6" y="-96" width="11" height="96"/><rect x="24" y="-74" width="9" height="74"/>' +
      `<path d="M-40,-20 L6,-20 M-10,-10 L24,-10 M17,-60 L24,-60 M40,0 L40,-50 L66,-50 L66,0 M40,-25 L66,-25 M40,-50 L66,-25 M40,-25 L66,0"${LINE(2.4)}/><rect x="-80" y="-4" width="152" height="4"/>`,
    acc: '<path d="M6,-96 q6,-14 0,-22 q12,8 11,22 Z"/><path d="M24,-74 q4,-9 0,-14 q8,5 9,14 Z"/>',
    spot: '<rect x="-74" y="-30" width="34" height="5"/><rect x="-36" y="-20" width="26" height="4"/>',
    spotInk: INKS.amber,
  },
  /** The refinery's sphere tanks on their legs. */
  tanks: {
    key: `<circle cx="-22" cy="-30" r="20"/><circle cx="22" cy="-22" r="14"/><path d="M-36,-12 L-40,0 M-8,-12 L-4,0 M12,-10 L10,0 M32,-10 L34,0"${LINE(3)}/><rect x="-48" y="-3" width="92" height="3"/>`,
    spot: '<path d="M-41,-34 A20,20 0 0,1 -3,-34 L-3,-30 L-41,-30 Z"/><path d="M8,-25 A14,14 0 0,1 36,-25 L36,-22 L8,-22 Z"/>',
    spotInk: INKS.amber,
  },
  // 9 Ice mine: the drill rig, its shed, the ice heap; silos with blue caps.
  icemine: {
    key:
      `<path d="M-22,0 L0,-104 L22,0 M-17,-24 L17,-24 M-12,-48 L12,-48 M-7,-72 L7,-72 M-17,-24 L12,-48 M-12,-48 L7,-72 M17,-24 L-12,-48"${LINE(2.6)}/>` +
      `<rect x="-4" y="-112" width="8" height="10"/><path d="M0,-102 L0,-6"${LINE(1.6)}/><rect x="-74" y="-28" width="40" height="28"/><polygon points="-78,-28 -54,-40 -30,-28"/>` +
      `<path d="M-34,-20 L-6,-40"${LINE(3)}/><rect x="-80" y="-4" width="160" height="4"/>`,
    spot: '<path d="M26,-4 Q50,-40 78,-4 Z"/>',
    spotInk: INKS.ice,
    acc: '<rect x="-64" y="-20" width="8" height="8"/><circle cx="0" cy="-113" r="3"/>',
  },
  silos: {
    key: [-24, 0, 24].map((x) => `<rect x="${x - 9}" y="-46" width="18" height="46"/><path d="M${x - 9},-46 a9,7 0 0,1 18,0 Z"/>`).join(''),
    spot: [-24, 0, 24].map((x) => `<path d="M${x - 9},-46 a9,7 0 0,1 18,0 Z"/><rect x="${x - 9}" y="-40" width="18" height="3"/>`).join(''),
    spotInk: INKS.ice,
  },
  // 10 Reactor: a cooling tower, its throat glowing, the reactor dome; radiator fins.
  reactor: {
    key: '<path d="M-52,0 C-38,-40 -38,-66 -44,-100 L18,-100 C12,-66 12,-40 26,0 Z"/><path d="M30,-2 A26,26 0 0,1 82,-2 Z"/><rect x="18" y="-14" width="16" height="12"/><rect x="-60" y="-4" width="146" height="4"/>',
    acc: '<rect x="-40" y="-36" width="54" height="7"/><circle cx="56" cy="-14" r="5"/>',
    spot: '<path d="M-42,-100 L16,-100 L14,-92 L-40,-92 Z"/><path d="M-36,-104 q-6,-16 10,-20 q8,-14 24,-4 q16,-6 18,12 Z" opacity="0.6"/>',
    spotInk: INKS.oxide,
  },
  radiators: {
    key:
      [-30, -15, 0, 15, 30].map((x) => `<rect x="${x - 4}" y="-40" width="8" height="40"/>`).join('') +
      '<rect x="-40" y="-4" width="80" height="4"/>',
    spot: [-22.5, -7.5, 7.5, 22.5].map((x) => `<rect x="${x - 2}" y="-36" width="4" height="32"/>`).join(''),
    spotInk: INKS.oxide,
  },
  // The Alien Artefact: a sinkhole, its crystals violet.
  sinkhole: {
    key: '<polygon points="-74,0 -66,-14 -54,-20 -46,-8 -42,0"/><polygon points="40,0 46,-12 58,-18 70,-6 76,0"/><ellipse cx="0" cy="6" rx="56" ry="8"/>',
    spot: '<polygon points="-30,-2 -26,-26 -20,-4"/><polygon points="-18,-2 -12,-36 -6,-3"/><polygon points="14,-2 20,-30 26,-3"/><polygon points="28,-2 31,-18 35,-2"/>',
    spotInk: INKS.violet,
    acc: `<ellipse cx="0" cy="6" rx="62" ry="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="7 5"/>`,
  },
  // Round any base: a landing pad and its lander, containers, a dish.
  pad: {
    key: `<path d="M-60,0 L-54,-8 L54,-8 L60,0 Z"/><rect x="-18" y="-46" width="36" height="28"/><path d="M-14,-18 L-28,-8 M14,-18 L28,-8 M-6,-18 L-10,-8 M6,-18 L10,-8"${LINE(3)}/><path d="M0,-46 L0,-62"${LINE(2)}/><path d="M-12,-56 a12,7 0 0,1 24,0 Z"/>`,
    spot: '<rect x="-14" y="-42" width="28" height="20"/>',
    spotInk: INKS.amber,
    acc: '<path d="M-54,-8 L54,-8 L52,-5 L-52,-5 Z"/>',
  },
  rocket: {
    key: `<path d="M-8,-110 Q0,-130 8,-110 L10,-20 L-10,-20 Z"/><path d="M-10,-40 L-24,-12 L-10,-22 Z M10,-40 L24,-12 L10,-22 Z"/><path d="M-10,-20 L-18,0 M10,-20 L18,0"${LINE(3)}/>`,
    acc: '<rect x="-9" y="-80" width="18" height="6"/>',
  },
  containers: {
    key: '<rect x="-60" y="-24" width="56" height="24"/><rect x="0" y="-24" width="56" height="24"/><rect x="-32" y="-48" width="56" height="24"/>',
    spot: '<rect x="-56" y="-21" width="48" height="18"/><rect x="-28" y="-45" width="48" height="18"/>',
    spotInk: INKS.ice,
    acc: [-50, -40, -30, 10, 20, 30, 40, 46].map((x) => `<path d="M${x},-21 L${x},-3"${LINE(1)}/>`).join(''),
  },
  dish: {
    key: `<path d="M-4,0 L0,-30 L4,0 Z"/><path d="M-30,-44 Q-4,-20 22,-56 L18,-60 Q-6,-30 -26,-48 Z"/><path d="M-4,-44 L8,-62"${LINE(1.6)}/>`,
    acc: '<circle cx="9" cy="-63" r="2.5"/>',
  },
  // Small things: a rover, crates, a survey beacon, an old probe and its parachute.
  rover: {
    key:
      [-26, 0, 26].map((x) => `<circle cx="${x}" cy="-7" r="7"/>`).join('') +
      `<rect x="-36" y="-26" width="72" height="14" rx="3"/><rect x="-30" y="-32" width="40" height="6"/><path d="M24,-26 L28,-46"${LINE(1.8)}/><circle cx="29" cy="-48" r="3"/>`,
    acc: '<rect x="30" y="-24" width="6" height="4"/>',
    spot: '<rect x="-28" y="-31" width="36" height="4"/>',
    spotInk: INKS.ice,
  },
  crates: {
    key: '<rect x="-22" y="-16" width="20" height="16"/><rect x="0" y="-12" width="16" height="12"/><rect x="-14" y="-30" width="16" height="14"/>',
    acc: `<path d="M-22,-16 L-2,0 M-2,-16 L-22,0"${LINE(1)}/>`,
  },
  beacon: {
    key: `<path d="M0,-6 L0,-50 M0,-10 L-10,0 M0,-10 L10,0 M0,-10 L0,0"${LINE(2.2)}/>`,
    acc: '<circle cx="0" cy="-52" r="3.6"/>',
  },
  probe: {
    key: `<path d="M-14,0 L-10,-16 L12,-16 L16,0 Z"/><path d="M-10,-16 L-28,-24 M12,-16 L26,-28"${LINE(2)}/><path d="M18,0 Q40,-6 70,0 Z"/>`,
    acc: `<path d="M16,-16 L40,-2 M16,-16 L56,-1"${LINE(0.8)}/>`,
  },
  // Battle props, after the Vocabulary board.
  bunker: {
    key: '<path fill-rule="evenodd" d="M-56,0 L-44,-30 L44,-30 L56,0 Z M-30,-20 h60 v4 h-60 Z"/><rect x="-20" y="-38" width="40" height="8"/>',
    acc: '<rect x="40" y="-14" width="10" height="14"/>',
  },
  mast: {
    key:
      `<path d="M-14,0 L-4,-110 M14,0 L4,-110 M-12,-20 L12,-20 M-10,-44 L10,-44 M-8,-68 L8,-68 M-6,-90 L6,-90 M-12,-20 L10,-44 M-10,-44 L8,-68 M-8,-68 L6,-90"${LINE(2.2)}/>` +
      `<path d="M2,-98 a20,12 -30 0,1 30,-14 Z"/><path d="M-4,-110 L-4,-128"${LINE(1.6)}/><rect x="-24" y="-4" width="48" height="4"/>`,
    acc: '<circle cx="-4" cy="-129" r="2.6"/>',
  },
  pod: {
    key: '<path d="M-16,-6 L-16,-54 Q0,-76 16,-54 L16,-6 Z"/><polygon points="-16,-14 -28,-2 -16,-4"/><polygon points="16,-14 28,-2 16,-4"/>',
    acc: '<rect x="-10" y="-46" width="20" height="6"/>',
  },
  barricade: {
    key: `<path d="M-60,-18 L-44,0 M-44,-18 L-60,0 M-26,-18 L-10,0 M-10,-18 L-26,0"${LINE(4)}/><polygon points="4,0 8,-22 30,-22 34,0"/><polygon points="38,0 42,-16 60,-16 64,0"/>`,
    acc: '<path d="M8,-22 h22 v4 h-22 Z"/>',
  },
  rocks: {
    key: '<path d="M-70,0 Q-40,-16 -6,-10 Q30,-18 70,0 Z"/><polygon points="-50,-6 -42,-26 -24,-30 -14,-12 -20,-4"/><polygon points="6,-8 14,-20 28,-18 32,-6"/><polygon points="40,-4 44,-12 52,-10 54,-3"/>',
  },
  /** A workshop: a big shed, its doors open on the dark inside, a gantry rail over the roof. */
  workshop: {
    key: '<path fill-rule="evenodd" d="M-70,0 L-70,-60 L0,-80 L70,-60 L70,0 Z M-34,0 L-34,-52 L34,-52 L34,0 Z"/><rect x="-80" y="-4" width="20" height="4"/><rect x="60" y="-4" width="20" height="4"/>',
    acc: '<path d="M-34,-56 h68 v3 h-68 Z"/><rect x="-60" y="-50" width="14" height="8"/><rect x="46" y="-50" width="14" height="8"/>',
  },
  /** A gantry: two posts and a beam, a hoist's chain hanging from it. */
  gantry: {
    key: `<rect x="-62" y="-130" width="8" height="130"/><rect x="54" y="-130" width="8" height="130"/><rect x="-68" y="-138" width="136" height="10"/><path d="M-50,-128 L-58,-120 M50,-128 L58,-120"${LINE(3)}/>`,
    acc: '<rect x="-68" y="-138" width="136" height="3"/>',
  },
  /** A mobile crane: a tracked base, a cab and a long boom. */
  crane: {
    key: `<rect x="-40" y="-14" width="80" height="14" rx="7"/><rect x="-26" y="-36" width="40" height="22"/><path d="M0,-30 L80,-120"${LINE(6)}/><path d="M-20,-36 L80,-120"${LINE(1.4)}/>`,
    acc: '<rect x="-22" y="-32" width="12" height="8"/>',
  },
  /** A wall of salvage plates, for a slogan. */
  wall: {
    key: '<rect x="-80" y="-56" width="160" height="56"/><path d="M-80,-56 L-74,-62 L-40,-60 L-36,-64 L10,-62 L14,-66 L60,-62 L80,-58 Z"/>',
  },
} satisfies Record<string, Print>;

export type PartName = keyof typeof PARTS;

/** Where and how a part prints: its ground point `x`, `y` (mm), `size` mm per unit, its plate's offset, its spot ink. */
export interface PartPlacing {
  size: number;
  flip?: boolean;
  /** The colour plate under it: the card's by default, `false` for none. */
  plate?: string | false;
  /** The spot pass's ink in place of the part's own, or `false` to print it in key. */
  spot?: string | false;
}

/** The plate's offset in mm, the same for every part on a card. */
const OFFSET = { dx: 0.55, dy: -0.35 };

/** Whether parts print their colour plate off register under them (the coloured shadow); off for now. */
const OFF_REGISTER = false;

/** A part printed in its passes at `x`, `y`. */
export function print(s: Stage, name: PartName, x: number, y: number, o: PartPlacing): string {
  const p: Print = PARTS[name];
  const t = (dx: number, dy: number) =>
    ` transform="translate(${n(x + dx)},${n(y + dy)}) scale(${n(o.flip ? -o.size : o.size)},${n(o.size)})"`;
  const pass = (body: string, ink: string, dx = 0, dy = 0) => `<g${t(dx, dy)} style="color:${ink};fill:${ink}">${body}</g>`;
  const plate = o.plate === false || !OFF_REGISTER ? '' : pass(p.key + (p.spot ?? ''), o.plate ?? s.plate, OFFSET.dx, OFFSET.dy);
  const spotInk = o.spot === false ? s.key : (o.spot ?? p.spotInk ?? s.plate);
  return plate + pass(p.key, s.key) + (p.spot ? pass(p.spot, spotInk) : '') + (p.acc ? pass(p.acc, INKS.amber) : '');
}

/** A shape (in mm, drawn in the ink it's given) printed in key, with its plate off register under it. */
export const plated = (s: Stage, body: (ink: string) => string, plate = s.plate) =>
  (OFF_REGISTER ? `<g transform="translate(${n(OFFSET.dx)},${n(OFFSET.dy)})">${body(plate)}</g>` : '') + body(s.key);

/** A mech on this stage: its ink and plate the card's unless given. */
export function mech(
  s: Stage,
  kind: MechKind,
  x: number,
  y: number,
  size: number,
  pose: Pose = {},
  o: { flip?: boolean; plate?: string | false; ink?: MechInk } = {},
): string {
  return posed(kind, {
    x,
    y,
    size,
    pose,
    flip: o.flip,
    ink: o.ink ?? s.ink,
    plate:
      o.plate === false || !OFF_REGISTER
        ? undefined
        : { colour: o.plate ?? s.plate, dx: OFFSET.dx * (size / 0.15), dy: OFFSET.dy * (size / 0.15) },
  });
}

// ---------------------------------------------------------------------------
// Crews: people in pressure suits, after the Silhouettes board's person (60 tall), posed by their limbs.

export interface Figure {
  /** Faces right (1) or left (-1). */
  facing?: 1 | -1;
  /** Arm angles from hanging straight down, degrees towards the facing side: near arm, far arm; elbow bends optional. */
  arms?: readonly [number, number];
  elbows?: readonly [number, number];
  /** Leg angles from straight down, towards the facing side: front leg, back leg; knee bends optional. */
  legs?: readonly [number, number];
  knees?: readonly [number, number];
  /** Body lean towards the facing side. */
  lean?: number;
  /** Kneeling: drops the body by a shin's length. */
  kneel?: boolean;
}

/** A crew member standing at `x`, `y` (their feet), `size` mm per unit (60 units tall), in `ink`. */
export function person(x: number, y: number, size: number, f: Figure, ink: string, light: string): string {
  const dir = f.facing ?? 1;
  const limb = (from: [number, number], len: number, a: number, bend: number, w: number) => {
    const r1 = (a * dir * Math.PI) / 180;
    const mid: [number, number] = [from[0] + Math.sin(r1) * len, from[1] + Math.cos(r1) * len];
    const r2 = ((a + bend) * dir * Math.PI) / 180;
    const end: [number, number] = [mid[0] + Math.sin(r2) * len, mid[1] + Math.cos(r2) * len];
    return { d: `M${n(from[0])},${n(from[1])} L${n(mid[0])},${n(mid[1])} L${n(end[0])},${n(end[1])}`, end, w };
  };
  const hip: [number, number] = [0, f.kneel ? -16 : -28];
  const lean = f.lean ?? 0;
  const [la, lb] = f.legs ?? [0, 0];
  const [ka, kb] = f.knees ?? [f.kneel ? -90 : 0, 0];
  const legs = [limb(hip, 14.5, la, ka, 6.5), limb(hip, 14.5, lb, kb, 6.5)];
  const shoulder: [number, number] = [0, hip[1] - 20];
  const [aa, ab] = f.arms ?? [8, -8];
  const [ea, eb] = f.elbows ?? [10, 10];
  const arms = [limb(shoulder, 12, aa, ea, 5), limb(shoulder, 12, ab, eb, 5)];
  const stroke = (l: { d: string; w: number }, c: string) =>
    `<path d="${l.d}" fill="none" stroke="${c}" stroke-width="${l.w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const torso = `<rect x="-7.5" y="${n(shoulder[1] - 2)}" width="15" height="${n(hip[1] - shoulder[1] + 4)}" rx="3"/>`;
  const pack = `<rect x="${n(-dir * 6 - 6)}" y="${n(shoulder[1] - 1)}" width="12" height="15" rx="2"/>`;
  const head = `<circle cx="${n(dir * 1)}" cy="${n(shoulder[1] - 7)}" r="7"/>`;
  const visor = `<path d="M${n(dir * 1.5)},${n(shoulder[1] - 9)} h${n(dir * 6)} v4 h${n(-dir * 6)} Z" fill="${light}"/>`;
  const body = `<g transform="rotate(${n(lean * dir)} 0 ${n(hip[1])})">${stroke(arms[1], ink)}${pack}${torso}${head}${visor}${stroke(arms[0], ink)}</g>`;
  return `<g transform="translate(${n(x)},${n(y)}) scale(${n(size)})" fill="${ink}">${stroke(legs[1], ink)}${stroke(legs[0], ink)}${body}</g>`;
}

// ---------------------------------------------------------------------------
// Effects.

/** A muzzle flash or blast: a spiky star, amber round a bone core. */
export function flash(x: number, y: number, r: number, spikes = 9, turn = 0): string {
  const pts = (outer: number, inner: number) =>
    Array.from({ length: spikes * 2 }, (_, i) => {
      const a = ((i / (spikes * 2)) * 360 + turn) * (Math.PI / 180);
      const rr = i % 2 ? inner : outer;
      return `${n(x + Math.cos(a) * rr)},${n(y + Math.sin(a) * rr)}`;
    }).join(' ');
  return `<polygon points="${pts(r, r * 0.45)}" fill="${INKS.amber}"/><polygon points="${pts(r * 0.55, r * 0.25)}" fill="${INKS.bone}"/>`;
}

/** Rays fanning out from `x`, `y`: alternate wedges in `ink`, as the Hot Loads card's. */
export function rays(x: number, y: number, count: number, ink: string, from = 0, to = 360): string {
  const R = 120;
  let d = '';
  const step = (to - from) / count;
  for (let i = 0; i < count; i += 2) {
    const a1 = ((from + i * step) * Math.PI) / 180;
    const a2 = ((from + (i + 1) * step) * Math.PI) / 180;
    d += `M${n(x)},${n(y)} L${n(x + Math.cos(a1) * R)},${n(y + Math.sin(a1) * R)} L${n(x + Math.cos(a2) * R)},${n(y + Math.sin(a2) * R)} Z `;
  }
  return `<path d="${d}" fill="${ink}"/>`;
}

/** Rings out from `x`, `y`: radio, sound, a scan; arcs between `from` and `to` degrees when given. */
export function rings(
  x: number,
  y: number,
  r0: number,
  step: number,
  count: number,
  ink: string,
  w = 0.6,
  from?: number,
  to?: number,
): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const r = r0 + i * step;
    const op = n(1 - i / (count + 1));
    if (from === undefined || to === undefined)
      out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="none" stroke="${ink}" stroke-width="${n(w)}" opacity="${op}"/>`;
    else {
      const a1 = (from * Math.PI) / 180;
      const a2 = (to * Math.PI) / 180;
      out += `<path d="M${n(x + Math.cos(a1) * r)},${n(y + Math.sin(a1) * r)} A${n(r)},${n(r)} 0 0,1 ${n(x + Math.cos(a2) * r)},${n(y + Math.sin(a2) * r)}" fill="none" stroke="${ink}" stroke-width="${n(w)}" stroke-linecap="round" opacity="${op}"/>`;
    }
  }
  return out;
}

/** Sparks flying from `x`, `y`: short amber strokes. */
export function sparks(r: Rng, x: number, y: number, count: number, reach: number, from = 0, to = 360): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = (r.range(from, to) * Math.PI) / 180;
    const d0 = r.range(0.2, 0.5) * reach;
    const d1 = d0 + r.range(0.25, 0.5) * reach;
    out += `<path d="M${n(x + Math.cos(a) * d0)},${n(y + Math.sin(a) * d0)} L${n(x + Math.cos(a) * d1)},${n(y + Math.sin(a) * d1)}" stroke="${INKS.amber}" stroke-width="${n(r.range(0.25, 0.5))}" stroke-linecap="round"/>`;
  }
  return out;
}

/** A column of smoke rising from `x`, `y`: billows in `ink`, its shade in halftone. */
export function smoke(s: Stage, x: number, y: number, h: number, ink: string): string {
  const r = s.r.fork('smoke');
  let out = '';
  let yy = y;
  let w = h * 0.12;
  while (yy > y - h) {
    const cx = x + r.range(-w * 0.4, w * 0.4) + (y - yy) * 0.25;
    out += `<circle cx="${n(cx)}" cy="${n(yy)}" r="${n(w)}" fill="${ink}"/><circle cx="${n(cx + w * 0.3)}" cy="${n(yy + w * 0.2)}" r="${n(w * 0.8)}" fill="${ht(s, 'key')}" opacity="0.5"/>`;
    yy -= w * 0.9;
    w *= 1.08;
  }
  return out;
}

/** Stencilled lettering, as painted on a wall or a hull. */
export function stencil(
  text: string,
  x: number,
  y: number,
  size: number,
  ink: string,
  o: { anchor?: 'start' | 'middle' | 'end'; rotate?: number; spacing?: number } = {},
): string {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${SP_FONTS.stencil}" font-size="${n(size)}" letter-spacing="${n((o.spacing ?? 0.04) * size)}" fill="${ink}" text-anchor="${o.anchor ?? 'middle'}"${o.rotate ? ` transform="rotate(${n(o.rotate)} ${n(x)} ${n(y)})"` : ''}>${esc(text)}</text>`;
}

/** Small type, as on a label or a readout. */
export function label(
  text: string,
  x: number,
  y: number,
  size: number,
  ink: string,
  anchor: 'start' | 'middle' | 'end' = 'middle',
): string {
  return `<text x="${n(x)}" y="${n(y)}" font-family="${SP_FONTS.mono}" font-weight="600" font-size="${n(size)}" letter-spacing="${n(size * 0.12)}" fill="${ink}" text-anchor="${anchor}">${esc(text)}</text>`;
}

/** A dust storm: bands of the ground's ink and its halftone blowing across. */
export function storm(s: Stage, top: number, bottom: number, opacity = 0.75): string {
  const r = s.r.fork('storm');
  const g = GROUND[s.world];
  let out = '';
  for (let y = top; y < bottom; y += r.range(2, 4)) {
    const h = r.range(0.8, 2.4);
    const x0 = r.range(-B - 10, s.w * 0.4);
    const w = r.range(30, 70);
    out += `<rect x="${n(x0)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${r.chance(0.5) ? g.ground : ht(s, 'shade')}" opacity="${n(opacity)}"/>`;
  }
  return out;
}
