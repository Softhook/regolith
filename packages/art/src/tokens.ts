import type { Hsl } from './svg';

/** Physical sizes (mm) and colours shared by the game and print. See docs/GRAPHICS.md §2a. */

export const TILE = {
  /** One space; fits a 19 mm die with 6.5 mm around it. */
  cell: 32,
  /** Tile trim size: 3 × 3 spaces. */
  size: 96,
  bleed: 3,
  /** Die-cut corner radius. */
  corner: 4,
  /** The rounded square marking where a die sits. */
  pad: 24,
} as const;

/**
 * Printed objective diameter per objective number: bigger numbers hold more cubes. Steps are large so the
 * number reads from size alone. Limits: 9 and 10 need > 33.2 mm for their cube pads. Under 45 mm an
 * objective clears a die in the next space; the 10, at 46.2 mm, reaches 0.6 mm under it (docs/GRAPHICS.md §2a).
 */
export const OBJECTIVE_DIAMETER: Record<number, number> = { 7: 24.2, 8: 30.8, 9: 38.5, 10: 46.2, 11: 46.2, 12: 46.2 };

/** Cubes each objective holds (the engine's `CAPACITY`): the 11 and 12, which only the number and the claim make hard, hold two and three. */
export const OBJECTIVE_CAPACITY: Record<number, number> = { 7: 1, 8: 2, 9: 3, 10: 4, 11: 2, 12: 3, 13: 1 };

/** Cube pads printed on objectives (physical cubes up to 10 mm). The on-screen cubes are smaller. */
export const CUBE_PAD = { size: 11, gap: 1.5, corner: 1.6 } as const;

/** How a well is sunk into the tile: opacities of its black fill, its shaded top-left and lit bottom-right edges, and the edges' widths (mm). */
export interface WellStyle {
  fill: number;
  shade: number;
  shadeWidth: number;
  lit: number;
  litWidth: number;
}

const SPACE_WELL: WellStyle = { fill: 0.055, shade: 0.55, shadeWidth: 0.7, lit: 0.16, litWidth: 0.35 };

/**
 * A hex space's outline (tile/markings.ts `hexEdge`): a plain line along its edge, its opacity and width (mm), the
 * same as the seams between a hex map's tiles. The lines are drawn solid and faded as a group, so a side two spaces
 * (or a space and a seam) share is no darker than the rest.
 */
export const HEX_EDGE = { opacity: 0.35, width: 0.015 * TILE.cell } as const;

/**
 * The wells printed for the spaces and the cube pads (tile/markings.ts `well`). The space wells are barely
 * filled, so the nebula shows through, and carried by their edges; the four beside an objective (where
 * dice claim it) are a shade darker. The cube wells are gentler, so the objective's surface shows
 * through; the game draws its empty cube slots with the same function.
 */
export const WELL: Record<'space' | 'claim' | 'cube', WellStyle> = {
  space: SPACE_WELL,
  claim: { ...SPACE_WELL, fill: 0.06 },
  cube: { fill: 0.24, shade: 0.3, shadeWidth: 0.45, lit: 0.09, litWidth: 0.25 },
};

/**
 * The shared base colour every tile's background fades to at its edge, so any two tiles sit together;
 * also the game's background behind them.
 */
export const SPACE_BASE: [number, number, number] = [228, 52, 9];
export type ObjectiveType = 'gas' | 'rocky' | 'ice' | 'lava' | 'ocean';

export interface ObjectiveFamily {
  /** Signature hue: atmosphere, glow and the number's outline. Each objective varies it a little. */
  hue: number;
  /** The back light on the far edge: a contrasting colour, cool behind the warm worlds and warm behind the cool ones. */
  backLight: Hsl;
  /** Objective types this number comes in; a full set cycles through them. */
  types: ObjectiveType[];
}

/** Back lights: warm behind the cool worlds (7, 9), cool behind the warm ones (8, 10). */
const WARM_BACK_LIGHT: Hsl = [28, 95, 66];
const COOL_BACK_LIGHT: Hsl = [196, 90, 70];

/**
 * Objective number → look. The objective carries the number's identity, so each number has its own kind of
 * world and its own colours, far apart in hue *and* lightness so they also differ for colour-blind
 * players: 7 small green-and-blue Earth-like worlds, 8 golden banded gas giants, 9 white ice worlds and
 * pale ice giants (the lightest), 10 big black-and-red molten worlds (the darkest). These are
 * the base hues: objectives vary around them and sometimes take an off-type colour (objective.ts).
 */
export const OBJECTIVE_FAMILY: Record<number, ObjectiveFamily> = {
  7: { hue: 150, backLight: WARM_BACK_LIGHT, types: ['ocean'] },
  8: { hue: 38, backLight: COOL_BACK_LIGHT, types: ['gas'] },
  9: { hue: 195, backLight: WARM_BACK_LIGHT, types: ['ice', 'gas'] },
  10: { hue: 6, backLight: COOL_BACK_LIGHT, types: ['lava'] },
  // The Mass Driver, the Deep Space Array and the Citadel: never drawn as objectives, but they carry a name, a number's outline and a hue.
  11: { hue: 215, backLight: WARM_BACK_LIGHT, types: ['rocky'] },
  12: { hue: 28, backLight: COOL_BACK_LIGHT, types: ['rocky'] },
  13: { hue: 275, backLight: WARM_BACK_LIGHT, types: ['rocky'] },
};

/** Nebula hues stay between blue and pink-purple, so every tile's sky belongs to one set. */
export const NEBULA_HUES: [number, number] = [215, 330];

/** The printed objective number (font size, mm), drawn where the spaces meet at the objective's bottom right. */
export const NUMBER_TEXT = { size: 14, sizeTwoDigits: 12.5 } as const;

/** The text face of the printed pieces: Inter, which at weight 900 is also the cards' names (SP_FONTS.display). */
export const FONTS = {
  body: "Inter, 'Helvetica Neue', Arial, sans-serif",
} as const;

/** Near-black ink: dark card paper, outlines behind big numerals, glyphs on lit chips. */
export const INK = 'hsl(228 45% 8%)';

/**
 * Hue of the research cards: purple. It sits at 290°
 * rather than a bluer violet: CMYK can't reach saturated violet, and at 268° it printed barely apart
 * from the mech blue (218°); towards magenta, ink holds more of the gap.
 */
const RESEARCH = 290;

/** The same two tracks as flat inks (the game's --power and --res): Regolith oxide for Power, ice for Research. */
export const TRACK_INK = { power: '#E0703A', research: '#A9C9D3' } as const;

/** The two combat dice, in print and in the game: black for the attacker, white for the defender. */
export const COMBAT_DICE = {
  attacker: { color: '#1b1f2e', pip: '#ff6b81' },
  defender: { color: '#f4f6fb', pip: '#14192b' },
} as const;

/** Player hues for mechs in the card illustrations, close to the game's default player colours (Lobby). */
export const PLAYER_HUES = [208, 3, 43, 93, 259];

/**
 * Card categories (data/cards.yaml `category`): accent hue and label, in the game and in print. Hues are
 * far apart so cards sort by colour at a glance. Each has an icon of the same name (icons.ts).
 */
export const CARD_CATEGORIES: Record<string, { hue: number; label: string }> = {
  movement: { hue: 192, label: 'Movement' },
  action: { hue: 42, label: 'Action' },
  combat: { hue: 352, label: 'Combat' },
  claim: { hue: 138, label: 'Claim' },
  power: { hue: 22, label: 'Power' },
  research: { hue: RESEARCH, label: 'Research' },
  mech: { hue: 218, label: 'Mechs' },
  card: { hue: 24, label: 'Cards' },
  reinforcement: { hue: 172, label: 'Reinforcements' },
};

/** Actions are always a yellow hexagon with a bolt (the action category's hue), on every card and the player aid. */
export const ACTION_HUE = CARD_CATEGORIES.action.hue;

/** Atomics are always drawn in the combat red, whatever the card's colour. */
export const ATOMIC_HUE = CARD_CATEGORIES.combat.hue;
