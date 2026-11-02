import { useEffect, useState } from 'react';
import { CARD } from '@regolith/art';
import { DECKS } from '../../art/cards';
import { cardFronts, warmCardImages } from '../../art/cardImages';

/** How long before the first card, and how long each is on screen (matches `intro-card` in styles.css). */
const FIRST_MS = 7000;
const SHOWN_MS = 13200;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Every card, in a random order. */
const shuffled = () => DECKS.flatMap((d) => d.cards.map((c) => c.id)).sort(() => Math.random() - 0.5);

/** A card's image, drawn and decoded, so showing it costs the page nothing; undefined if it can't be drawn. */
async function ready(id: string): Promise<string | undefined> {
  try {
    const src = await cardFronts.get(id);
    const img = new Image();
    img.src = src;
    await img.decode();
    return src;
  } catch {
    return undefined;
  }
}

/**
 * After a while, a slow shuffle of the game's cards, large in the middle of the screen in place of the title, one
 * at a time, while the opening waits for a click. `onCards` says whether one is up (the title gives way to it, and
 * comes back whenever a card can't follow the last, late or undrawable, so the screen is never left empty);
 * `leaving` fades them out as the title returns. The cards are the ones warmed in the background (one per idle
 * moment), so each is drawn and kept for later visits as it comes up, and the next is ready, decoded, before the
 * current one fades. The click stops the shuffle and the warming; what's drawn stays kept.
 */
export function IntroCards({ leaving, onCards }: { leaving: boolean; onCards: (up: boolean) => void }) {
  const [shown, setShown] = useState<{ id: string; src: string }>();
  useEffect(() => {
    if (leaving) return;
    const ids = shuffled();
    const stop = warmCardImages(ids);
    let live = true;
    void (async () => {
      let next = ready(ids[0]!);
      await wait(FIRST_MS);
      for (let i = 0; live && i < ids.length; i++) {
        let src = await Promise.race([next, wait(0)]);
        if (!src) {
          if (live) onCards(false);
          src = await next;
        }
        const due = wait(SHOWN_MS);
        if (i + 1 < ids.length) next = ready(ids[i + 1]!);
        if (live && src) {
          setShown({ id: ids[i]!, src });
          onCards(true);
        }
        await due;
      }
      if (live) onCards(false);
    })();
    return () => {
      live = false;
      stop();
    };
  }, [leaving, onCards]);
  return (
    shown && (
      <div className={`intro-cards${leaving ? ' gone' : ''}`}>
        <img key={shown.id} className="intro-card" src={shown.src} alt="" width={CARD.w} height={CARD.h} draggable={false} />
      </div>
    )
  );
}
