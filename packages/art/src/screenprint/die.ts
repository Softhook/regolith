import { document, n, type Fragment } from '../svg';
import { FONTS } from '../tokens';
import { INKS, ON_PAPER } from './inks';
import { RIGS, type MechKind } from './mechs';
import { mech, muzzle, type Pose } from './pose';

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

/** How a mech stands in a battle: squared up to strike (`ready`), braced to shoot (`aim`, the Sniper's), or knocked back, beaten (`struck`). */
export type FighterStance = 'ready' | 'aim' | 'struck';

/** Side on enough that what reaches forward reads, its far side leading: the far foot ahead, the near one behind. */
const SQUARED_UP: Pose = { yaw: -48, plant: { crouch: 0.1, plus: 0.3, minus: -0.28 } };
/** Rocked back on its rear foot, the front one still down. */
const ROCKED: Pose = { yaw: -48, plant: { crouch: 0.16, plus: 0.42, minus: -0.1 } };
const arms = (plus: readonly number[], minus: readonly number[]) => ({ arms: { plus, minus } });
/** Beaten, the arms fly apart: out to the sides as well as the far one forward, the near one back, clear of the hull. */
const flung = { plus: [-16], minus: [16] };

/** Each mech's stances: their arms differ, and the Breacher's spikes, the Chameleon's gun, must be where they count. */
const STANCES: Record<MechKind, Record<'ready' | 'struck', Pose> & { aim?: Pose }> = {
  // Guard up on the far arm, the spiked near fist drawn back to swing.
  breacher: {
    ready: { ...SQUARED_UP, tilt: 6, swing: arms([66, 44], [-38, 112]) },
    struck: { ...ROCKED, tilt: -16, arms: flung, swing: arms([72, 14], [-52, 44]) },
  },
  // The cranes out in front, clamps open.
  behemoth: {
    ready: { ...SQUARED_UP, tilt: 4, swing: arms([58, 30], [36, 48]) },
    struck: { ...ROCKED, tilt: -12, arms: flung, swing: arms([66, 12], [-36, 18]) },
  },
  tactician: {
    ready: { ...SQUARED_UP, tilt: 8, swing: arms([50, 40], [-18, 74]) },
    struck: { ...ROCKED, tilt: -20, arms: flung, swing: arms([72, 14], [-44, 22]) },
  },
  // The long gun levelled on the far arm.
  chameleon: {
    ready: { ...SQUARED_UP, tilt: 4, swing: arms([30, 60], [-12, 58]) },
    struck: { ...ROCKED, tilt: -20, arms: flung, swing: arms([76, 14], [-44, 22]) },
  },
  // The rifle in both hands: at the ready, levelled to shoot, its muzzle dropping when beaten.
  sniper: {
    ready: { ...SQUARED_UP, tilt: 4, aim: 108, shoulder: 48 },
    aim: { ...SQUARED_UP, plant: { crouch: 0.14, plus: 0.36, minus: -0.34 }, tilt: 8, aim: 122, shoulder: 48 },
    struck: { ...ROCKED, tilt: -18, aim: 172, shoulder: 40 },
  },
  // Spindly and four-legged, turned less so its legs don't line up: only the dome moves, ducking and rocking.
  wisp: {
    ready: { yaw: -30, tilt: 8 },
    struck: { yaw: -30, tilt: -18 },
  },
};

/** A fighter's frame: half as wide again as `size` is tall (room for its arms and gun). */
const FIGHTER_WIDTH = 1.5;

/**
 * A fighter posed and placed in its frame. Sized and placed so every mech fits in every stance: a pose swings the
 * feet below the mech's origin, and the arms and gun out to the frame's edges.
 */
function fighter(value: number, stance: FighterStance, flip: boolean | undefined, size: number) {
  const kind = MECH_OF[value];
  const rig = RIGS[kind];
  const stances = STANCES[kind];
  return {
    kind,
    place: {
      x: (size * FIGHTER_WIDTH) / 2,
      y: size * 0.86,
      size: (size * 0.72) / (rig.height * (rig.scale ?? 1)),
      flip,
      pose: stances[stance] ?? stances.ready,
    },
  };
}

/**
 * The mech a die value is, alone and squared up for a battle: facing right (left when `flip`), in key ink with
 * its colour plate (`plate`, the player's colour) off register under it. An SVG document `size` mm tall.
 */
export function mechFighterSvg(value: number, o: { stance?: FighterStance; flip?: boolean; plate?: string; size?: number } = {}): string {
  const size = o.size ?? 20;
  const { kind, place } = fighter(value, o.stance ?? 'ready', o.flip, size);
  const body = mech(kind, {
    ...place,
    ink: ON_PAPER,
    plate: o.plate ? { colour: o.plate, dx: size * 0.025, dy: size * 0.02 } : undefined,
  });
  return document({ defs: '', body }, { x: 0, y: 0, w: size * FIGHTER_WIDTH, h: size });
}

/** Where a fighter facing right fires from, as fractions of its picture's width and height; undefined for a mech with no gun in its hands. */
export function fighterMuzzle(value: number, stance: FighterStance): { x: number; y: number } | undefined {
  const { kind, place } = fighter(value, stance, false, 1);
  const at = muzzle(kind, place);
  return at && { x: at[0] / FIGHTER_WIDTH, y: at[1] };
}
