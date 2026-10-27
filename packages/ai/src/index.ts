import { actor, type Action, type GameState, type PlayerId } from '@regolith/engine';
import * as greedy from './greedy';
import { Search, type SearchParams } from './search';

/**
 * AI players, in levels from 1 (weakest) to 5. All of them choose among
 * `legalActions(state)` and never see the game's real RNG or the order of the decks.
 *
 *   1 Cadet      greedy, one action at a time, a few noisy samples (greedy.ts)
 *   2 Captain    one action at a time, but exact odds and an evaluation that knows
 *                whose turn is next and what the enemy can reach (evaluate.ts, chance.ts)
 *   3 Commodore  plans the whole turn: searches combinations of actions (search.ts)
 *   4 Admiral    wider turn search, Flagship transports, and its best plans checked
 *                against the opponent's actual reply
 *   5 Fleet Admiral  deeper and wider turn search, and each checked plan played against
 *                several replies (different dice, the same for every plan), averaged
 */

export type AiLevel = 1 | 2 | 3 | 4 | 5;

export interface AiLevelInfo {
  level: AiLevel;
  name: string;
  summary: string;
}

export const AI_LEVELS: AiLevelInfo[] = [
  { level: 1, name: 'Cadet', summary: 'Takes the move that looks best right now.' },
  { level: 2, name: 'Captain', summary: 'Weighs the odds and watches your ships.' },
  { level: 3, name: 'Commodore', summary: 'Plans its whole turn.' },
  { level: 4, name: 'Admiral', summary: 'Plans its turn and anticipates yours.' },
  { level: 5, name: 'Fleet Admiral', summary: 'Plans deeper and weighs how your reply could go.' },
];

export const DEFAULT_AI_LEVEL: AiLevel = 3;

const SEARCH: Record<Exclude<AiLevel, 1>, SearchParams> = {
  2: { depth: 1, width: 0, innerWidth: 0, samples: 4, carry: false, replies: 0, budget: Infinity },
  3: { depth: 3, width: 4, innerWidth: 2, samples: 4, carry: false, replies: 0, budget: 2500 },
  4: { depth: 3, width: 6, innerWidth: 3, samples: 6, carry: true, replies: 3, budget: 6000 },
  5: { depth: 4, width: 8, innerWidth: 3, samples: 8, carry: true, replies: 4, replySamples: 3, budget: 15000 },
};

export interface AiOptions {
  /** Defaults to 1, the original AI (which the golden tests replay). */
  level?: AiLevel;
  /** The AI's own randomness; never the game's. */
  random?: () => number;
  /** Level 1 only: samples per random action. */
  samples?: number;
  /** Level 1 only: 0 = always best move, higher = more random. */
  noise?: number;
}

export function chooseAction(state: GameState, opts: AiOptions = {}): Action | null {
  const level = opts.level ?? 1;
  if (level === 1) return greedy.chooseAction(state, opts);
  return new Search(actor(state), SEARCH[level], opts.random ?? Math.random).choose(state);
}

/** Should `player` fire a missile in the current combat? */
export function chooseCombatResponse(state: GameState, player: PlayerId, opts: AiOptions = {}): Action | null {
  const level = opts.level ?? 1;
  if (level === 1) return greedy.chooseMissile(state, player);
  return new Search(player, SEARCH[level], opts.random ?? Math.random).missile(state, player);
}
