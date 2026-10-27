import { FONTS, SP_FONTS, type CardDeck, type CardFace, type Measure } from '@regolith/art';
import { MODES, type CardDef } from '@regolith/engine';
import { blobToDataUrl } from '../files';

/** Every printed card, by deck, from the game's card data, and the fonts cards and tiles are set in. */

export interface Deck {
  id: CardDeck;
  name: string;
  cards: CardFace[];
}

const faces = (deck: CardDeck, defs: CardDef[]): CardFace[] =>
  defs.map((c, i) => ({
    id: c.id,
    name: c.name,
    subtitle: c.subtitle,
    text: c.text,
    category: c.category,
    deck,
    copies: c.count,
    index: i + 1,
    deckSize: defs.length,
  }));

/** Regolith's decks, read from the rule set that deals them (Basic deals none). */
export const DECKS: Deck[] = MODES.flatMap((m): Deck[] => {
  const c = m.cards;
  if (!c) return [];
  return [
    { id: 'skill', name: c.terms.skillDeck, cards: faces('skill', c.skills) },
    { id: 'tactic', name: c.terms.tacticDeck, cards: faces('tactic', c.tactics) },
    { id: 'expansion', name: c.expansion.name, cards: faces('expansion', [c.expansion]) },
  ];
});

const byId = new Map(DECKS.flatMap((d) => d.cards.map((c) => [c.id, c])));

/** A card's printed face, by card id. */
export function faceOf(id: string): CardFace {
  const face = byId.get(id);
  if (!face) throw new Error(`Unknown card ${id}`);
  return face;
}

/** The fonts cards and the player aid are set in, as the page loads them (index.html). */
const FAMILIES = {
  title: ['900', 'Orbitron'],
  body: ['400', 'Inter'],
  bold: ['700', 'Inter'],
  stencil: ['400', "'Saira Stencil One'"],
  display: ['900', 'Inter'],
  condensed: ['500', "'Barlow Condensed'"],
  condensedBold: ['700', "'Barlow Condensed'"],
  mono: ['600', "'JetBrains Mono'"],
} as const;

/** Each font's fallback, measured when it hasn't loaded. */
const FALLBACK: Record<keyof typeof FAMILIES, string> = {
  title: FONTS.title,
  body: FONTS.body,
  bold: FONTS.body,
  stencil: SP_FONTS.stencil,
  display: SP_FONTS.display,
  condensed: SP_FONTS.condensed,
  condensedBold: SP_FONTS.condensed,
  mono: SP_FONTS.mono,
};

let ctx: CanvasRenderingContext2D | null = null;

/** Text width in mm, measured with the page's web fonts: the same ones embedded in the card images. */
export const measure: Measure = (text, size, font) => {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  const [weight, family] = FAMILIES[font];
  ctx.font = `${weight} 100px ${family}, ${FALLBACK[font]}`;
  return (ctx.measureText(text).width / 100) * size;
};

let fontsReady: Promise<void> | null = null;

/** Resolves once the page has the card fonts, so `measure` measures with them (never rejects). */
export function cardFontsReady(): Promise<void> {
  fontsReady ??= Promise.all(Object.values(FAMILIES).map(([w, f]) => document.fonts.load(`${w} 10px ${f}`))).then(
    () => {},
    () => {
      fontsReady = null;
    },
  );
  return fontsReady;
}

/**
 * Fonts as `@font-face` rules with the font files inlined, from a Google Fonts query. An SVG drawn as
 * an image can't reach the page's fonts, so exports carry their own. Empty when offline: the art then
 * falls back to system fonts (print exports refuse to run), and a later call tries again.
 */
function embeddedFonts(query: string, ready: () => Promise<void>): () => Promise<string> {
  let css: Promise<string> | null = null;
  return () => {
    css ??= (async () => {
      try {
        await ready();
        const res = await fetch(`https://fonts.googleapis.com/css2?${query}&display=block`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const sheet = await res.text();
        // Latin only when Google Fonts labels its subsets (each subset is another file), else every rule.
        const latin = [...sheet.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]*\})/g)].map((m) => m[1]);
        const blocks = latin.length ? latin : [...sheet.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
        if (!blocks.length) throw new Error('no @font-face rules');
        const files = new Map<string, Promise<string>>();
        const inline = (url: string) => {
          if (!files.has(url))
            files.set(
              url,
              fetch(url)
                .then((r) => {
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  return r.blob();
                })
                .then(blobToDataUrl),
            );
          return files.get(url)!;
        };
        const out = await Promise.all(
          blocks.map(async (b) => {
            const url = /url\(([^)]+)\)/.exec(b)?.[1];
            return url ? b.replace(url, await inline(url)) : b;
          }),
        );
        return out.join('');
      } catch {
        css = null;
        return '';
      }
    })();
    return css;
  };
}

/** The card fonts, for card and player aid images. */
export const cardFontCss = embeddedFonts(
  'family=Inter:ital,wght@0,400;0,700;0,900;1,400&family=Orbitron:wght@900&family=Saira+Stencil+One&family=Barlow+Condensed:wght@500;700&family=JetBrains+Mono:wght@600',
  cardFontsReady,
);

/** The tile fonts: Inter ExtraBold for the planet number, JetBrains Mono for the flavour label. */
export const tileFontCss = embeddedFonts('family=Inter:wght@800&family=JetBrains+Mono:wght@400;700', async () => {});
