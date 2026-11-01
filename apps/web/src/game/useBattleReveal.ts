import { useEffect, useState } from 'react';

/** How long the dice tumble before the totals show. */
const REVEAL_MS = 1250;

/** Whether a battle's dice have landed, so its totals and result can show; starts over with each battle (`id`). */
export function useBattleReveal(id: number): boolean {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
    const t = window.setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [id]);
  return revealed;
}
