import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';

/** A CSS anchor name that is unique on the page (React's ids, like ":r3:", aren't valid in CSS). */
export function useAnchorName(): string {
  return `--a${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * A small info bubble next to the element whose CSS `anchor-name` is `anchor`. Open while mounted.
 * It sits in the top layer (Popover API), so no panel or dialog clips it. A tap elsewhere, a tap on
 * the bubble or Escape closes it (`onClose`). Browsers without CSS anchor positioning show it at the
 * bottom of the screen instead (styles.css).
 */
export function InfoPop({ anchor, onClose, children }: { anchor: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const el = ref.current!;
    if (!el.showPopover) return;
    el.popover = 'auto';
    el.showPopover();
    const onToggle = (e: Event) => (e as ToggleEvent).newState === 'closed' && close.current();
    el.addEventListener('toggle', onToggle);
    return () => {
      el.removeEventListener('toggle', onToggle);
      if (el.matches(':popover-open')) el.hidePopover();
    };
  }, []);
  return (
    <div
      ref={ref}
      className="info-pop"
      role="tooltip"
      style={{ '--anchor': anchor } as CSSProperties}
      // A tap on the bubble closes it (it may cover something you want to tap next).
      onClick={(e) => (e.stopPropagation(), close.current())}
    >
      {children}
    </div>
  );
}

/** How long the mouse rests on a tip before it opens, like a native tooltip. */
const HOVER_MS = 350;

/**
 * Text that explains something which isn't a control (a stat, a track, a badge). Opens on hover with a
 * mouse and on tap with a finger; replaces `title=`, which touch screens never show. `onClick` may
 * claim the tap by returning true (e.g. a scrapyard die you can deploy right now).
 */
export function Tip({
  tip,
  as: Tag = 'span',
  className = '',
  style,
  onClick,
  children,
  'data-fx': fx,
}: {
  tip: ReactNode;
  as?: 'span' | 'div' | 'em';
  className?: string;
  style?: CSSProperties;
  onClick?: () => boolean;
  children: ReactNode;
  /** The spot a moment's effect marks (see CardCasts). */
  'data-fx'?: string;
}) {
  const anchor = useAnchorName();
  const [open, setOpen] = useState(false);
  const hover = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(hover.current), []);
  const toggle = (e: { stopPropagation(): void }) => {
    e.stopPropagation(); // a tip inside another tip opens only itself
    clearTimeout(hover.current);
    if (!onClick?.()) setOpen((o) => !o);
  };
  return (
    <>
      <Tag
        className={`has-tip ${className}`}
        data-fx={fx}
        style={{ ...style, '--anchor': anchor } as CSSProperties}
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(e))}
        onPointerEnter={(e) => e.pointerType === 'mouse' && (hover.current = setTimeout(() => setOpen(true), HOVER_MS))}
        onPointerLeave={(e) => e.pointerType === 'mouse' && (clearTimeout(hover.current), setOpen(false))}
      >
        {children}
      </Tag>
      {open && (
        <InfoPop anchor={anchor} onClose={() => setOpen(false)}>
          {typeof tip === 'string' ? tip : tip}
        </InfoPop>
      )}
    </>
  );
}
