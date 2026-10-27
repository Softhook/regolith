import { useEffect, useMemo, useState } from 'react';
import type { CardFace } from '@regolith/art';
import { card } from '@regolith/engine';
import { DECKS, cardFontCss, measure, tileFontCss, type Deck } from '../art/cards';

export { DECKS, cardFontCss, measure, tileFontCss, type Deck };

/** Where a card came from (its `from` and `status` in data/regolith.yaml), and the brief its art is drawn from. */
export function cardNote(face: CardFace): string {
  const def = card(face.id);
  const from = def.from && def.from.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const where = !from
    ? 'New in Regolith'
    : def.status === 'community'
      ? `Copy of Community ${from}`
      : `From Community ${from} (${def.status})`;
  return `${where}${def.art ? ` · art: ${def.art.title}` : ''}`;
}

/** Fonts from `cardFontCss` or `tileFontCss` for a lab page: null while loading, empty when they didn't load (retries once back online). */
export function useFontCss(load: () => Promise<string>): string | null {
  const [css, setCss] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const pull = () => void load().then((c) => live && setCss(c));
    pull();
    addEventListener('online', pull);
    return () => {
      live = false;
      removeEventListener('online', pull);
    };
  }, [load]);
  return css;
}

/** A blob URL for an SVG document (cheaper than a data URL when it carries embedded fonts), revoked when replaced. */
export function useSvgUrl(svg: string): string {
  const url = useMemo(() => (svg ? URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) : ''), [svg]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}
