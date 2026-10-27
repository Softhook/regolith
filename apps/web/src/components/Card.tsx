import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { CARD_CATEGORIES, ICONS, cardPalette, missile } from '@regolith/art';
import { cardName, card, cardKind } from '@regolith/engine';
import { useCardImage } from '../art/useCardImages';

/** A card category's icon (the same drawing as on the printed cards). */
export function CategoryIcon({ category, size = 14 }: { category: string; size?: number }) {
  const markup = ICONS[category];
  if (!markup) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/**
 * One action: a hexagon with the action bolt, as drawn on the cards and the player aid (`chip`). Takes
 * `currentColor`: the player's colour in the game, the cards' yellow in the manual. `off` is an outline.
 */
export function ActionHex({ size = 20, off = false }: { size?: number; off?: boolean }) {
  return (
    <svg className={off ? 'action-hex' : 'action-hex on'} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 1.5 21.1 6.75v10.5L12 22.5 2.9 17.25V6.75z"
        fill={off ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <g
        transform="translate(5.4 5.4) scale(.55)"
        fill="none"
        stroke={off ? 'currentColor' : '#0b1020'}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: ICONS.action }}
      />
    </svg>
  );
}

/** A missile: the same drawing as on the cards, pointing up and to the right. */
export function MissileIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="missile-icon"
      width={size}
      height={size}
      viewBox="-3.6 -3.6 7.2 7.2"
      aria-hidden
      dangerouslySetInnerHTML={{ __html: missile(0.5, -0.5, -45) }}
    />
  );
}

/**
 * Sets `--cat` to a category's accent colour, as printed on a light (permanent) or dark (one-shot) card, and
 * `--cat-ink` to its text colour on that card (on a light card, darker than the accent, to be readable).
 */
export const categoryStyle = (category: string, light: boolean) => {
  const p = cardPalette(light, CARD_CATEGORIES[category]?.hue ?? CARD_CATEGORIES.action.hue);
  return { '--cat': p.accent, '--cat-ink': light ? p.accentInk : p.accent } as CSSProperties;
};

export interface CardViewProps {
  id: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  inactive?: boolean;
  className?: string;
  /** Its place in a row of cards (the market's), told apart from other copies of it there. */
  index?: number;
  /** A band of the printed card's illustration across the top (the market's cards). */
  art?: boolean;
}

export function CardView({ id, size = 'md', onClick, disabled, badge, inactive, className = '', index, art }: CardViewProps) {
  const def = card(id);
  const kind = cardKind(id);
  const category = CARD_CATEGORIES[def.category]?.label ?? def.category;
  // One-shot cards name their deck too, where it isn't their category already (Expansion).
  const kindLabel = kind === 'skill' ? undefined : kind === 'expansion' ? cardName('expansion') : 'Tactic';
  const clickable = !!onClick && !disabled;
  const name = def.name;
  const text = useRef<HTMLDivElement>(null);
  const cut = useClipped(text, def.text);
  return (
    <button
      type="button"
      className={`qcard qcard-${kind} qcard-${size} ${art ? 'has-art' : ''} ${def.text.length > 110 ? 'long' : ''} ${clickable ? 'clickable' : ''} ${inactive ? 'inactive' : ''} ${className}`}
      style={categoryStyle(def.category, kind === 'skill')}
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      title={`${def.name} — ${def.text}`}
      data-card={id}
      data-index={index}
    >
      {art && (
        <ArtBand id={id}>
          <CategoryIcon category={def.category} size={12} />
          {name}
        </ArtBand>
      )}
      <div className="qcard-top">
        <span className="qcard-cat">
          <CategoryIcon category={def.category} size={size === 'sm' ? 11 : 13} />
          {category}
        </span>
        {kindLabel && kindLabel !== category && <span className="qcard-kind">{kindLabel}</span>}
      </div>
      <div className="qcard-name">{name}</div>
      <div className="qcard-sub">{def.subtitle}</div>
      <div className={`qcard-text ${cut ? 'cut' : ''}`} ref={text}>
        {def.text}
      </div>
      {/* At the foot, so a badge never pushes the name down out of line with its neighbours'. */}
      {badge && <span className="qcard-badge">{badge}</span>}
    </button>
  );
}

/**
 * The middle of the printed card's illustration, once drawn (a plain band of the card's colour till then), with
 * the card's name on it in place of its category, so the rules text below gets the name's room.
 */
function ArtBand({ id, children }: { id: string; children: ReactNode }) {
  const src = useCardImage(id);
  return (
    <div className="qcard-art" style={src ? { backgroundImage: `url("${src}")` } : undefined}>
      <span className="qcard-art-name">{children}</span>
    </div>
  );
}

/**
 * Every card's text box, and what to do when it resizes: one observer and one font listener for all of them, not
 * one each (a game shows dozens of cards).
 */
const watched = new Map<Element, () => void>();
let observer: ResizeObserver | undefined;
const recheckAll = () => watched.forEach((check) => check());

function watch(el: Element, check: () => void) {
  if (!observer) {
    observer = new ResizeObserver((entries) => entries.forEach((e) => watched.get(e.target)?.()));
    document.fonts.addEventListener('loadingdone', recheckAll);
  }
  watched.set(el, check);
  observer.observe(el);
  return () => {
    watched.delete(el);
    observer?.unobserve(el);
  };
}

/**
 * Whether `el`'s text is cut short (it holds more than it shows), kept up to date as it resizes, when its `text`
 * changes, and when fonts arrive (a late font rewraps the text without resizing its box).
 */
function useClipped(el: RefObject<HTMLElement>, text: string) {
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const box = el.current;
    if (!box) return;
    const check = () => setClipped(box.scrollHeight > box.clientHeight + 1);
    check();
    return watch(box, check);
  }, [el, text]);
  return clipped;
}
