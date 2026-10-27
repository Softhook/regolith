import { hsl } from './svg';
import { INK } from './tokens';
import { screenprintBackSvg, screenprintCardSvg } from './screenprint/card';
import { SCENES } from './screenprint/scenes';

/**
 * Advance cards, poker size (63.5 × 88.9 mm), for print and the Art Lab. See docs/GRAPHICS.md §2, Cards.
 *
 * Permanent cards (Skills) are on paper; one-shot cards (Tactics, Reinforcements) on night paper, so the two
 * read apart across the table. They are drawn in screenprint (screenprint/card.ts).
 */

export const CARD = {
  w: 63.5,
  h: 88.9,
  bleed: 3,
  /** Die-cut corner radius. */
  corner: 3,
  /** Keep text this far inside the trim. */
  safe: 3.5,
  /** Where the illustration ends and the text panel starts. */
  artBottom: 43,
} as const;

export type CardDeck = 'skill' | 'tactic' | 'expansion';

/** Everything printed on a card face. */
export interface CardFace {
  id: string;
  name: string;
  subtitle: string;
  text: string;
  deck: CardDeck;
  /** Movement, action, combat, … (CARD_CATEGORIES): sets the accent colour and icon. */
  category: string;
  /** How many copies the deck has. */
  copies?: number;
  /** Position in its deck, for the "07/34" footer. */
  index?: number;
  deckSize?: number;
}

/** Measures text width in mm, for wrapping. The browser passes a canvas-based one; tests use the estimate. */
export type Measure = (text: string, sizeMm: number, font: MeasuredFont) => number;

/** The faces cards and the player aid are set in: the aid's (title, body, bold) and the cards' (stencil, condensed, mono). */
export type MeasuredFont = 'title' | 'body' | 'bold' | 'stencil' | 'display' | 'condensed' | 'condensedBold' | 'mono';

export interface CardOptions {
  bleed?: boolean;
  /** Round the corners (on screen). */
  rounded?: boolean;
  measure?: Measure;
  /** `@font-face` rules to embed, so exported images use the same fonts as the measurements. */
  fontCss?: string;
  idPrefix?: string;
}

/** Rough widths for Orbitron and Inter, when no real measurement is available. */
export const estimateWidth: Measure = (text, size, font) => size * text.length * (font === 'title' ? 0.8 : font === 'bold' ? 0.56 : 0.52);

/** What an illustration shows, for art direction (the Art Lab prints it under the card). */
export function cardIllustration(f: CardFace): string {
  return SCENES[f.id]?.caption ?? 'no illustration yet';
}

const DECK_INFO: Record<CardDeck, { label: string; kind: string; light: boolean }> = {
  skill: { label: 'Skill', kind: 'Permanent', light: true },
  tactic: { label: 'Tactic', kind: 'One-shot', light: false },
  expansion: { label: 'Reinforcements', kind: 'One-shot', light: false },
};

export const deckInfo = (d: CardDeck) => DECK_INFO[d];

/** A card's colours on screen. Light for permanent cards, dark for one-shot ones. */
export interface CardPalette {
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
}

export function cardPalette(light: boolean, hue: number): CardPalette {
  return light
    ? { paper: hsl(225, 30, 95), ink: hsl(228, 40, 12), muted: hsl(228, 15, 42), accent: hsl(hue, 80, 52), accentInk: hsl(hue, 85, 30) }
    : { paper: INK, ink: hsl(225, 60, 94), muted: hsl(226, 22, 64), accent: hsl(hue, 90, 62), accentInk: hsl(hue, 100, 80) };
}

/** The front of a card as a standalone SVG document. */
export function cardSvg(face: CardFace, o: CardOptions = {}): string {
  return screenprintCardSvg(face, o);
}

/** The back of a deck's cards; `plain` leaves out the lettering (the game's narrow deck piles). */
export function cardBackSvg(deck: CardDeck, o: Omit<CardOptions, 'measure'> & { plain?: boolean } = {}): string {
  return screenprintBackSvg(deck, o);
}
