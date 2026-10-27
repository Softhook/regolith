import { useEffect, useMemo, useState } from 'react';
import type { CardFace } from '@regolith/art';
import { card, effectOf, isOriginalCard } from '@regolith/engine';
import { DECKS, EDITIONS, cardFontCss, faceOf, measure, tileFontCss, type Deck } from '../art/cards';

export { DECKS, EDITIONS, cardFontCss, measure, tileFontCss, type Deck };

/** A Community card that redesigns a 2013 card (its `classic` in data/cards.yaml). */
export interface Redesign {
  classic: CardFace;
  community: CardFace;
  /** Plays by the same rules in this game (shared effect): only the wording changed. */
  sameRules: boolean;
  /** A new name for the same idea: Cerebral → Composed, Eager → Industrious. */
  renamed: boolean;
}

/** Every card of one edition, in deck order. */
export const cardsOf = (edition: Deck['edition']) => DECKS.filter((d) => d.edition === edition).flatMap((d) => d.cards);

/** The cards by lineage: Community redesigns of 2013 cards, and each edition's own designs. */
export const LINEAGE = (() => {
  const community = cardsOf('community');
  const redesigns = community.flatMap((c): Redesign[] => {
    const from = card(c.id).classic;
    if (!from) return [];
    const classic = faceOf(from);
    return [{ classic, community: c, sameRules: effectOf(from) === effectOf(c.id), renamed: classic.name !== c.name }];
  });
  const redesigned = new Set(redesigns.map((r) => r.classic.id));
  return {
    redesigns,
    reworded: redesigns.filter((r) => !r.renamed && r.sameRules),
    reworked: redesigns.filter((r) => !r.renamed && !r.sameRules),
    renamed: redesigns.filter((r) => r.renamed),
    communityOnly: community.filter((c) => !card(c.id).classic),
    classicOnly: cardsOf('original').filter((c) => !redesigned.has(c.id)),
  };
})();

/** Where a card stands between the editions: what it redesigns, or what redesigned it (a classic card can have two heirs). */
export function lineageNote(face: CardFace): string {
  const how = (r: Redesign) => `${r.renamed ? 'renamed, ' : ''}${r.sameRules ? 'same rules' : 'rules changed'}`;
  const from = LINEAGE.redesigns.find((r) => r.community.id === face.id);
  if (from) return `Redesign of classic ${from.classic.name} (${how(from)})`;
  const def = card(face.id);
  if (def.from) {
    const was = faceOf(def.from).name;
    return def.status === 'community'
      ? `Copy of Community ${was}`
      : `From Community ${was} (${def.status})${def.art ? ` · art: ${def.art.title}` : ''}`;
  }
  const heirs = LINEAGE.redesigns.filter((r) => r.classic.id === face.id);
  if (heirs.length) return `Redesigned as ${heirs.map((r) => `${r.community.name} (${how(r)})`).join(' and ')}`;
  return isOriginalCard(face.id) ? 'Classic only: not in the Community Edition' : 'Community original: new in the Community Edition';
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
