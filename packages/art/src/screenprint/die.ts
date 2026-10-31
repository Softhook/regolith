import { document, n, type Fragment } from '../svg';
import { FONTS } from '../tokens';
import { INKS, ON_PAPER } from './inks';
import { RIGS, type MechKind } from './mechs';
import { mech, type Pose } from './pose';

/** The mech each die value is, 1 to 6 (docs/regolith/REGOLITH-WORLD.md, *The six mechs*). */
const MECH_OF: Record<number, MechKind> = {
  1: 'breacher',
  2: 'behemoth',
  3: 'tactician',
  4: 'chameleon',
  5: 'sniper',
  6: 'wisp',
};

/**
 * A die face showing its mech, printed as the cards print them: the mech in key ink on bone paper, its value
 * stencilled in the top left. `size` mm square, centred on (cx, cy). For the player aid and the manual.
 * A `portrait` is the mech alone, as tall as the face and with no number or paper, so its build can be seen.
 */
export function mechDie(value: number, cx: number, cy: number, size: number, portrait = false): Fragment {
  const kind = MECH_OF[value];
  const rig = RIGS[kind];
  const h = size / 2;
  // The mech stands on the face's lower edge, as tall as most of the face (the Wisp draws itself larger).
  const scale = (size * (portrait ? 0.98 : 0.74)) / (rig.height * (rig.scale ?? 1));
  const feet = cy + h * (portrait ? 0.98 : 0.8);
  const number = size * 0.26;
  return {
    defs: '',
    body:
      (portrait
        ? ''
        : `<rect x="${n(cx - h)}" y="${n(cy - h)}" width="${n(size)}" height="${n(size)}" rx="${n(size * 0.14)}" fill="${INKS.bone}"/>`) +
      mech(kind, { x: cx + (portrait ? 0 : size * 0.06), y: feet, size: scale, ink: ON_PAPER }) +
      (portrait
        ? ''
        : `<text x="${n(cx - h + size * 0.1)}" y="${n(cy - h + size * 0.1 + number * 0.74)}" font-family="${FONTS.title}" font-weight="900" font-size="${n(number)}" fill="${INKS.oxide}">${value}</text>`),
  };
}

/** A mech die alone, as an SVG document `size` mm square. */
export const mechDieSvg = (value: number, size = 20): string =>
  document(mechDie(value, size / 2, size / 2, size), { x: 0, y: 0, w: size, h: size });

/** How a mech stands in a battle: squared up to strike (`ready`), braced to shoot (`aim`), or knocked back, beaten (`struck`). */
type Stance = 'ready' | 'aim' | 'struck';

const STANCES: Record<Stance, Pose> = {
  ready: { yaw: -32, lean: -4, legs: { plus: [-16, 22], minus: [18, -8] }, arms: { plus: [-45, -35], minus: [16, 14] }, aim: 115 },
  aim: { yaw: -36, lean: 6, legs: { plus: [-28, 30], minus: [24, -6] }, arms: { plus: [-20, -10], minus: [-10, 0] }, aim: 122 },
  struck: { yaw: -30, lean: -22, legs: { plus: [-22, 12], minus: [26, -18] }, arms: { plus: [40, 20], minus: [-30, -10] }, aim: 30 },
};

/**
 * The mech a die value is, alone and squared up for a battle: facing right (left when `flip`), in key ink with
 * its colour plate (`plate`, the player's colour) off register under it. An SVG document `size` mm tall and half
 * as wide again (room for its arms and gun), the mech standing on its lower edge.
 */
export function mechFighterSvg(value: number, o: { stance?: Stance; flip?: boolean; plate?: string; size?: number } = {}): string {
  const kind = MECH_OF[value];
  const rig = RIGS[kind];
  const size = o.size ?? 20;
  const scale = (size * 0.8) / (rig.height * (rig.scale ?? 1));
  const w = size * 1.5;
  const body = mech(kind, {
    x: w / 2,
    y: size * 0.96,
    size: scale,
    flip: o.flip,
    pose: STANCES[o.stance ?? 'ready'],
    ink: ON_PAPER,
    plate: o.plate ? { colour: o.plate, dx: size * 0.025, dy: size * 0.02 } : undefined,
  });
  return document({ defs: '', body }, { x: 0, y: 0, w, h: size });
}
