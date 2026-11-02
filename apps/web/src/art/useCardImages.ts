import { useEffect, useState } from 'react';
import { cardBacks, cardFronts, warmCardImages, type Drawn } from './cardImages';

/**
 * A card image drawn on demand (cardImages.ts): at once if it's drawn already, else undefined till it is. A failed
 * drawing leaves it undefined, so the caller's placeholder stays.
 */
function useDrawn(images: Drawn<string>, id: string): string | undefined {
  const [src, setSrc] = useState(() => images.now(id));
  useEffect(() => {
    let live = true;
    const load = () => {
      setSrc(images.now(id));
      images.get(id).then(
        (url) => live && setSrc(url),
        () => {},
      );
    };
    load();
    const off = images.subscribe(id, load);
    return () => {
      live = false;
      off();
    };
  }, [images, id]);
  return src;
}

/** Card `id`'s printed front. */
export const useCardImage = (id: string) => useDrawn(cardFronts, id);

/** The printed back of the deck card `id` belongs to. */
export const useCardBack = (id: string) => useDrawn(cardBacks, id);

/** Warms cards `ids` (cardImages.ts) while they're the ones wanted. Joined so it reruns only when the cards change, not on every new array. */
export function useWarmCardImages(ids: readonly string[]) {
  const sig = ids.join();
  useEffect(() => warmCardImages(sig ? sig.split(',') : []), [sig]);
}
