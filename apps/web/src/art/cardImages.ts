import { CARD, cardBackSvg, cardSvg, dataUrl, hash, type CardDeck } from '@regolith/art';
import { rasterise } from '../files';
import { cardFontCss, cardFontsReady, faceOf, measure } from './cards';
import { idle, storeImage, storedImage } from './imageStore';

/**
 * Printed card artwork as ready-drawn images, for the card pop-ups and the market. Each card's SVG (with its
 * illustration's filters) is drawn once to a bitmap, so a pop-up of a whole deck doesn't redraw live
 * filters on every repaint, and kept in IndexedDB (imageStore), so later visits show it at once. The
 * stored image carries a hash of the SVG, so changing the artwork redraws it automatically.
 */

/** Pixel width of a drawn card: the largest pop-up card (300 px) at 2× device pixels. */
const WIDTH = 600;
const HEIGHT = Math.round((WIDTH * CARD.h) / CARD.w);

/** Images drawn once a visit, by key: the drawing under way, and its URL once done (for showing it at once). */
export interface Drawn<K> {
  get(key: K): Promise<string>;
  now(key: K): string | undefined;
  subscribe(key: K, cb: () => void): () => void;
}

function drawnOnce<K>(draw: (key: K) => Promise<string>) {
  const pending = new Map<K, Promise<string>>();
  const done = new Map<K, string>();
  const subs = new Map<K, Set<() => void>>();
  const notify = (key: K) => subs.get(key)?.forEach((cb) => cb());
  return {
    get(key: K) {
      let image = pending.get(key);
      if (!image) {
        image = draw(key).then(
          (url) => {
            const old = done.get(key);
            done.set(key, url);
            if (old && old !== url) {
              notify(key);
              if (old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 1000);
            }
            return url;
          },
          (e) => {
            pending.delete(key);
            throw e;
          },
        );
        pending.set(key, image);
      }
      return image;
    },
    now: (key: K) => done.get(key),
    has: (key: K) => pending.has(key),
    subscribe(key: K, cb: () => void) {
      let set = subs.get(key);
      if (!set) subs.set(key, (set = new Set()));
      set.add(cb);
      return () => {
        set.delete(cb);
        if (!set.size) subs.delete(key);
      };
    },
    /** Draws `key` again when next asked for (the old image stays shown till then). */
    forget(key: K) {
      pending.delete(key);
      notify(key);
    },
  };
}

/**
 * Cards are drawn a few at a time, in the order asked for, so a deck's pop-up fills in from its first
 * card instead of showing them all at the end.
 */
const AT_ONCE = 2;
let drawing = 0;
const waiting: (() => void)[] = [];
const slot = () => (drawing < AT_ONCE ? (drawing++, Promise.resolve()) : new Promise<void>((resolve) => waiting.push(resolve)));
const release = () => {
  const next = waiting.shift();
  if (next) next();
  else drawing--;
};

/**
 * Image `id`'s URL: the one kept in IndexedDB if it was drawn from the same `key`, else `svg` drawn (in turn, see
 * `slot`) at `width` × `height` and kept, unless `keep` is false. If drawing fails, falls back to the SVG itself
 * (slower to show, same look).
 */
async function drawKept(
  id: string,
  key: string | number,
  width: number,
  height: number,
  svg: () => Promise<{ svg: string; keep: boolean }>,
): Promise<{ url: string; kept: boolean }> {
  const stored = await storedImage('cards', id, `${key}:${width}`).catch(() => undefined);
  if (stored) return { url: URL.createObjectURL(stored), kept: true };
  const art = await svg();
  await slot();
  try {
    const blob = await rasterise(art.svg, width, height, 'image/webp', 0.92);
    if (art.keep) storeImage('cards', id, `${key}:${width}`, blob).catch(() => {});
    return { url: URL.createObjectURL(blob), kept: art.keep };
  } catch {
    return { url: dataUrl(art.svg), kept: art.keep };
  } finally {
    release();
  }
}

const fronts = drawnOnce(async (id: string) => {
  const face = faceOf(id);
  // The layout is measured with the page's fonts; the key leaves out the embedded font files.
  await cardFontsReady();
  const bare = cardSvg(face, { rounded: true, measure });
  const { url, kept } = await drawKept(id, hash(bare), WIDTH, HEIGHT, async () => {
    const fontCss = await cardFontCss();
    // Without its fonts (offline) a card falls back to system lettering: shown, but not kept.
    const svg = fontCss ? bare.replace('<defs>', `<defs><style>${fontCss}</style>`) : bare;
    return { svg, keep: !!fontCss };
  });
  // Drawn without its fonts: drawn again when next asked for, once back online.
  if (!kept) addEventListener('online', () => fronts.forget(id), { once: true });
  return url;
});

/** Pixel size of a drawn back: a deck pile shows it at its full height (about 200 px), cropped to its middle, at 2×. */
const BACK_WIDTH = 286;
const BACK_HEIGHT = Math.round((BACK_WIDTH * CARD.h) / CARD.w);

/** A back by its deck. */
const backKey = (id: string): CardDeck => faceOf(id).deck;

const backs = drawnOnce(async (deck: CardDeck) => {
  const svg = cardBackSvg(deck, { plain: true });
  const { url } = await drawKept(`back:${deck}`, hash(svg), BACK_WIDTH, BACK_HEIGHT, async () => ({ svg, keep: true }));
  return url;
});

/** Card fronts by card id, drawn the first time they're asked for. */
export const cardFronts: Drawn<string> = fronts;

/**
 * The plain backs (without lettering: the market's deck piles are too narrow for it) of the deck each card id
 * belongs to.
 */
export const cardBacks: Drawn<string> = {
  get: (id) => backs.get(backKey(id)),
  now: (id) => backs.now(backKey(id)),
  subscribe: (id, cb) => backs.subscribe(backKey(id), cb),
};

/** The cards still to prepare in the background, first first. */
let toWarm: string[] = [];
let warming = false;

/**
 * Prepares cards in the background (one per idle moment), so their pop-ups open at once. A new list
 * replaces the one being worked through, so only one loop ever runs. Fetches the card fonts straight
 * away: the first card drawn would otherwise wait for them. Returns a function that stops it.
 */
export function warmCardImages(ids: Iterable<string>): () => void {
  void cardFontCss();
  const list = [...new Set(ids)].filter((id) => !fronts.has(id));
  toWarm = list;
  if (!warming) {
    warming = true;
    void (async () => {
      for (let id; (id = toWarm.shift());) {
        if (fronts.has(id)) continue; // opened meanwhile
        await idle(2000);
        await fronts.get(id).catch(() => {});
      }
      warming = false;
    })();
  }
  return () => {
    if (toWarm === list) toWarm = [];
  };
}
