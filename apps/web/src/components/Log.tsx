import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GameState } from '@regolith/engine';
import { logText } from '../game/logText';
import { remember, stored } from '../storage';
import { appKey } from '../appId';

const STORAGE_KEY = appKey('logOpen');
/** Until the player chooses, the log starts open where the sidebar has room for it (a desktop monitor). */
const ROOMY = '(min-width: 1600px) and (min-height: 900px)';
const AUTO_SCROLL_THRESHOLD = 12;

/** Whether a list is at its bottom: within `slack` px of it (the newest entry's height: it is at least partly in view), and never less than AUTO_SCROLL_THRESHOLD. */
export function shouldAutoScroll(scrollTop: number, clientHeight: number, scrollHeight: number, slack = 0) {
  return scrollHeight - scrollTop - clientHeight <= Math.max(AUTO_SCROLL_THRESHOLD, slack);
}

/** The height of a list's newest entry, px. */
const newestHeight = (list: HTMLElement) => (list.lastElementChild as HTMLElement | null)?.offsetHeight ?? 0;

/**
 * The game's log: each turn's start a heading, everything else (battles too) small and indented under it.
 * Collapsed (the default, remembered, except on a big screen) it is just its title; the whole row toggles it.
 * An entry `review.can` show is a button: it shows the map as it was just after it (`review.pick`), and
 * the list keeps it, with the rest of its `move`, lit and in view. One it can't (from before the game was opened here) says why on hover.
 */
export function Log({
  game,
  review,
}: {
  game: GameState;
  review?: { can(id: number): boolean; pick(id: number): void; picked?: number; move?: ReadonlySet<number> };
}) {
  const ref = useRef<HTMLOListElement>(null);
  const [open, setOpen] = useState(() => (stored(STORAGE_KEY) ?? (matchMedia(ROOMY).matches ? '1' : '0')) === '1');
  const picked = review?.picked;
  const wasPicked = useRef(picked);
  // Whether the list follows the newest entry: it does until the player scrolls away from the bottom,
  // and again once they scroll back. Known from scrolling, and when an entry comes from where the player
  // left the list against its size before the entry (the entry is in it by then, and the list may have
  // grown or shrunk with the sidebar), as their scroll's event may not have come yet.
  const following = useRef(true);
  const before = useRef({ scroll: 0, client: 0 });
  // Whether the player has a hand on the list (a wheel, touch, pointer or key on it since it last scrolled
  // itself to the newest entry): only their scrolling says whether it follows, never its own, however
  // long its smooth scroll takes.
  const byPlayer = useRef(false);
  const byHand = () => (byPlayer.current = true);
  const onScroll = () => {
    const list = ref.current;
    if (!list || !byPlayer.current) return;
    following.current = shouldAutoScroll(list.scrollTop, list.clientHeight, list.scrollHeight, newestHeight(list));
  };
  useEffect(() => {
    const list = ref.current;
    const ended = wasPicked.current !== undefined && picked === undefined;
    wasPicked.current = picked;
    const wasAtBottom = !!list && shouldAutoScroll(list.scrollTop, before.current.client, before.current.scroll, newestHeight(list));
    if (list) before.current = { scroll: list.scrollHeight, client: list.clientHeight };
    // While looking back, the log stays on the move shown (below), not on the newest; after, it is
    // back on the newest.
    if (!open || !list || picked !== undefined) return;
    if (byPlayer.current) following.current = wasAtBottom;
    if (!ended && !following.current) return;
    following.current = true;
    byPlayer.current = false;
    // Back from looking back it jumps: a smooth scroll that far would drag. Not if the player took hold
    // of the list in the meantime.
    requestAnimationFrame(() => {
      if (!byPlayer.current || ended) list.scrollTo({ top: list.scrollHeight, behavior: ended ? 'instant' : 'smooth' });
    });
  }, [game.log.length, game.logCounter, open, picked]);
  // The move being looked back at stays in view as the review steps through the log (its start, if
  // it is taller than the list). Only the list scrolls (not the sidebar or the page, as scrollIntoView would).
  useEffect(() => {
    const list = ref.current;
    const lis = list?.querySelectorAll<HTMLElement>('li.picked');
    if (!list || !lis?.length) return;
    const offset = (li: HTMLElement) => li.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const top = offset(lis[0]);
    const last = lis[lis.length - 1];
    const bottom = offset(last) + last.offsetHeight;
    if (top < list.scrollTop || bottom - top > list.clientHeight) list.scrollTo({ top, behavior: 'smooth' });
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTo({ top: bottom - list.clientHeight, behavior: 'smooth' });
  }, [picked, open]);
  const toggle = () => {
    setOpen(!open);
    remember(STORAGE_KEY, open ? '0' : '1');
  };
  const colour = (player?: number) => ({ '--pc': player !== undefined ? game.players[player].color : 'var(--muted)' }) as CSSProperties;
  return (
    <section className={`panel log ${open ? '' : 'collapsed'}`}>
      <button type="button" className="log-toggle" aria-expanded={open} onClick={toggle}>
        <span className="log-title">Field log</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ol ref={ref} onScroll={onScroll} onWheel={byHand} onTouchStart={byHand} onPointerDown={byHand} onKeyDown={byHand}>
          {game.log.map((e) => (
            <li
              key={e.id}
              style={colour(e.player)}
              className={
                [!e.turn && 'minor', (review?.move?.has(e.id) ?? review?.picked === e.id) && 'picked'].filter(Boolean).join(' ') ||
                undefined
              }
              title={review && !review.can(e.id) ? 'Only moves made since the game was opened here can be shown' : undefined}
            >
              {review?.can(e.id) ? (
                <button
                  type="button"
                  aria-pressed={review.picked === e.id}
                  title="Show the map as it was then"
                  onClick={() => review.pick(e.id)}
                >
                  {logText(game, e)}
                </button>
              ) : (
                logText(game, e)
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
