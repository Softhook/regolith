import type { GameState } from '@regolith/engine';

/**
 * Shuffles the unseen cards of both decks in `s`, in place: the AI plays on a shuffle of its own and
 * never on the real order. A card the player is peeking at stays on top, since they have seen it.
 */
export function shuffleUnseen(s: GameState, random: () => number) {
  const peek = s.pending[0]?.kind === 'peek' ? s.pending[0].deck : null;
  shuffle(s.market.skillDeck, peek === 'skill' ? 1 : 0, random);
  shuffle(s.market.tacticDeck, peek === 'tactic' ? 1 : 0, random);
}

/** Shuffles `xs` in place, leaving the first `keep` cards (known to the player) in place. */
function shuffle(xs: string[], keep: number, random: () => number) {
  for (let i = xs.length - 1; i > keep; i--) {
    const j = keep + Math.floor(random() * (i - keep + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
}
