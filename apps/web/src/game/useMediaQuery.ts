import { useSyncExternalStore } from 'react';

type Store = { subscribe: (onChange: () => void) => () => void; get: () => boolean };
const stores = new Map<string, Store>();

/** One MediaQueryList per query, so the subscription stays put across renders. */
function store(query: string): Store {
  let s = stores.get(query);
  if (!s) {
    const mq = matchMedia(query);
    s = {
      subscribe: (onChange) => {
        mq.addEventListener('change', onChange);
        return () => mq.removeEventListener('change', onChange);
      },
      get: () => mq.matches,
    };
    stores.set(query, s);
  }
  return s;
}

/** Whether a CSS media query matches now; re-renders when it changes (e.g. the phone is turned). */
export function useMediaQuery(query: string): boolean {
  const s = store(query);
  return useSyncExternalStore(s.subscribe, s.get);
}

/** Phone-sized screens, portrait or landscape; the same query styles.css uses to shrink popups. */
export const PHONE = '(max-width: 600px), (max-height: 500px)';

/** Where the game's battle is compact (its `compact` class in styles.css): phones, and windows too short for the full one (a laptop's, under its browser's bars). */
export const COMPACT_BATTLE = '(max-width: 600px), (max-height: 720px)';

/** Short screens (phones on their side): the popups' dice shrink, as in styles.css. */
export const SHORT = '(max-height: 500px)';

/**
 * Where the market starts collapsed, until the player chooses: phones, where the open market is taller than the
 * space under the map, and screens with the sidebar that are short (an iPad or a laptop on its side), where it
 * would take a quarter of the map's height.
 */
export const FOLD_MARKET = `${PHONE}, (min-width: 981px) and (max-height: 820px)`;

/** A finger, not a mouse: phones and tablets. */
export const COARSE = '(pointer: coarse)';

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** Whether motion is reduced now: for a one-off check, where a re-render on change isn't needed. */
export const reducedMotion = () => matchMedia(REDUCED_MOTION).matches;

/** Phones held upright: the map above a bottom sheet (GameScreen, which marks it `.sheet-layout` for styles.css). */
export const SHEET = '(max-width: 699px) and (orientation: portrait)';
