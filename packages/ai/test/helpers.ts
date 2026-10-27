import { apply, type Action, type GameState } from '@regolith/engine';
import { seededRandom } from '../../engine/test/helpers';
import { chooseAction, type AiLevel } from '../src';

/** Lets the AI play player 0's whole turn. */
export function playTurn(state: GameState, level: AiLevel): { s: GameState; actions: Action[] } {
  const random = seededRandom(7);
  const actions: Action[] = [];
  let s = state;
  while (s.phase === 'play' && s.turn.player === 0 && actions.length < 30) {
    const a = chooseAction(s, { level, random })!;
    actions.push(a);
    s = apply(s, a);
  }
  return { s, actions };
}
