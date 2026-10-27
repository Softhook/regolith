import { defaultMapFor, RULESETS, type GameMode, type PlayerConfig } from '@regolith/engine';
import { PROTOCOL, type Body, type Post } from '../src';

export const seat = (name: string, ai = false): PlayerConfig => ({ name, color: '#fff', ai, aiLevel: 1 });

let clock = 1_000_000;
let ids = 0;
/** A post without the crypto, for the replay tests (the codec has its own tests). */
export function post(author: string, body: Body, prev: string | null = null, at = ++clock): Post {
  return { id: `p${String(++ids).padStart(6, '0')}`, author, at, prev, body };
}

export const create = (author: string, players: PlayerConfig[], open: number[], seed = 7, mode: GameMode = 'basic') =>
  post(author, {
    t: 'create',
    protocol: PROTOCOL,
    config: { players, mapId: defaultMapFor(RULESETS[mode], players.length)!.id, mode, seed },
    creator: 0,
    open,
  });
