import { document, n, type Fragment } from '../svg';
import { FONTS } from '../tokens';
import { INKS, ON_PAPER } from './inks';
import { RIGS, type MechKind } from './mechs';
import { mech } from './pose';

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
 */
export function mechDie(value: number, cx: number, cy: number, size: number): Fragment {
  const kind = MECH_OF[value];
  const rig = RIGS[kind];
  const h = size / 2;
  // The mech stands on the face's lower edge, as tall as most of the face (the Wisp draws itself larger).
  const scale = (size * 0.74) / (rig.height * (rig.scale ?? 1));
  const feet = cy + h * 0.8;
  const number = size * 0.26;
  return {
    defs: '',
    body:
      `<rect x="${n(cx - h)}" y="${n(cy - h)}" width="${n(size)}" height="${n(size)}" rx="${n(size * 0.14)}" fill="${INKS.bone}"/>` +
      mech(kind, { x: cx + size * 0.06, y: feet, size: scale, ink: ON_PAPER }) +
      `<text x="${n(cx - h + size * 0.1)}" y="${n(cy - h + size * 0.1 + number * 0.74)}" font-family="${FONTS.title}" font-weight="900" font-size="${n(number)}" fill="${INKS.oxide}">${value}</text>`,
  };
}

/** A mech die alone, as an SVG document `size` mm square. */
export const mechDieSvg = (value: number, size = 20): string =>
  document(mechDie(value, size / 2, size / 2, size), { x: 0, y: 0, w: size, h: size });
