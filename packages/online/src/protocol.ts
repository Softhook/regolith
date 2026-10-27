import type { Action, CombatPending, GameMode, GameState, PlayerConfig, PlayerId } from '@regolith/engine';

/**
 * An online game is a log of posts that every player's browser keeps and replays with the engine.
 * Bump when a change to the posts or to how they are replayed would make old games replay
 * differently.
 */
export const PROTOCOL = 2;

/** Whether `s` has the form of a game secret (codec's `newSecret`), as an invite link carries it. */
export function isSecret(s: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(s);
}

/**
 * Whether a player's battles wait for them to respond (fire a missile) before they resolve.
 * Only the attacker and defender may respond, so a player is only ever asked about their own battles.
 */
export type AskMode = 'own' | 'never';

export interface GameConfig {
  players: PlayerConfig[];
  mapId: string;
  mode: GameMode;
  /** The game's RNG seed. Every player holds it (see MULTIPLAYER.md: players are trusted). */
  seed: number;
}

export type Body =
  /** The first post: the game and its seats. The creator plays `creator`; `open` seats are for friends. */
  | { t: 'create'; protocol: number; config: GameConfig; creator: PlayerId; open: PlayerId[] }
  /** Take an open seat. The earliest claim of a seat wins, but a claimant who has played the seat keeps it. */
  | { t: 'claim'; seat: PlayerId; name: string }
  /**
   * `h`: the hash of the position the move leads to (`stateHash`), as the poster's browser computed
   * it. A browser that gets a different one is out of sync (most often: a different app version).
   */
  | { t: 'act'; seat: PlayerId; action: Action; h?: string }
  /** Take back the seat's last move, if the engine allows it (isUndoable). */
  | { t: 'undo'; seat: PlayerId }
  | { t: 'ask'; seat: PlayerId; ask: AskMode }
  /** Nothing to add at this stage of a battle (see `combatStage`). */
  | { t: 'pass'; seat: PlayerId; stage: string };

/**
 * A post, decoded. `act`, `undo` and `ask` posts form a chain: each names the post it follows
 * (`prev`), so every browser applies them in the same order. `create`, `claim` and `pass` posts
 * stand on their own (`prev` is null) because their order doesn't matter.
 */
export interface Post {
  id: string;
  /** Public key of the browser that signed it. */
  author: string;
  /** When it was posted (ms, the poster's clock). Breaks ties between rival posts. */
  at: number;
  prev: string | null;
  body: Body;
}

export const CHAINED: ReadonlySet<Body['t']> = new Set(['act', 'undo', 'ask']);

/**
 * Identifies one stage of a battle: it changes whenever a missile changes the battle, so a pass only
 * counts for the stage it was given in.
 */
export function combatStage(c: CombatPending): string {
  return `${c.id}.${+c.attacker.missile}${+c.defender.missile}`;
}

/** Earlier posts win; equal times are broken by id, so every browser picks the same one. */
export function byTime(a: Post, b: Post): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * A short fingerprint of a position (FNV-1a over its JSON). Two browsers running the same engine on
 * the same posts build their states the same way, so their fingerprints match.
 *
 * Leaves out player names and the log (which quotes them): names come from claims, and a browser
 * may not have every claim yet when it posts a move. Leaves out the players' stats too: they are
 * history, not position, so a browser whose engine keeps none (or counts them differently) stays in sync.
 */
export function stateHash(state: GameState): string {
  const json = JSON.stringify(state, (k, v) => {
    if (k === 'name' || k === 'stats' || (k === 'log' && Array.isArray(v))) return undefined;
    return v;
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
