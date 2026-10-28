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
 * After a while, a slow shuffle of the game's cards above the title, one at a time, while the opening waits for a
 * click. The cards are the ones warmed in the background (one per idle moment), so each is drawn and kept for
 * later visits as it comes up, and the next is ready, decoded, before the current one fades. Leaving the title
 * stops the warming; what's drawn stays kept.
 */
export function IntroCards() {
  const [shown, setShown] = useState<{ id: string; src: string }>();
  useEffect(() => {
    const ids = shuffled();
    const stop = warmCardImages(ids);
    let live = true;
    void (async () => {
      let next = ready(ids[0]!);
      await wait(FIRST_MS);
      for (let i = 0; live && i < ids.length; i++) {
        const src = await next;
        const due = wait(SHOWN_MS);
        if (i + 1 < ids.length) next = ready(ids[i + 1]!);
        if (live && src) setShown({ id: ids[i]!, src });
        await due;
      }
    })();
    return () => {
      live = false;
      stop();
    };
  }, []);
  return shown && <img key={shown.id} className="intro-card" src={shown.src} alt="" width={CARD.w} height={CARD.h} draggable={false} />;
}
