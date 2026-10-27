/** Shared test helpers: players, a finished setup, and seeded AI-vs-AI games. */
import { chooseAction, chooseCombatResponse, type AiLevel } from '../../ai/src';
import { DEFAULT_MODE, actor, apply, createGame, legalActions, type Action, type GameMode, type GameState } from '../src';

export const players = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: '#fff', ai: true }));

/** Finishes setup, taking the first legal choice for every setup decision. */
export function finishSetup(s: GameState): GameState {
  while (s.phase === 'setup') s = apply(s, legalActions(s)[0]);
  return s;
}

/** A game with setup done (see `finishSetup`); `mapId` defaults to the mode's map for `n` players. */
export function quickStart(n = 2, seed = 1, mode: GameMode = DEFAULT_MODE, mapId?: string): GameState {
  return finishSetup(createGame({ players: players(n), seed, mode, mapId }));
}

/** Empties the map and places dice at given cells, as [row, col, value], for focused rule tests. */
export function arrange(s: GameState, placements: Record<string, [number, number, number]>): GameState {
  const t = structuredClone(s);
  for (const d of t.dice) if (d.loc.zone === 'board') d.loc = { zone: 'scrapyard' };
  for (const [id, [r, c, value]] of Object.entries(placements)) {
    const d = t.dice.find((x) => x.id === id)!;
    d.loc = { zone: 'board', r, c };
    d.value = value;
    t.turn.seen[id] = [value];
  }
  return t;
}

/** A seeded random number generator in [0, 1), independent of the game's own RNG. */
export function seededRandom(seed: number): () => number {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
}

export interface AiGame {
  mode: GameMode;
  players: number;
  /** Seed of the game itself. */
  seed: number;
  /** Seed of the AI's own randomness. */
  aiSeed: number;
  /** Defaults to the mode's map for the player count. */
  mapId?: string;
  /** AI level of each player (default 1, the level the golden tests replay). */
  levels?: AiLevel[];
  /** Called with the state before each action, and the action about to be applied. */
  before?: (s: GameState, step: number) => void;
  /** Called with the state after each action. */
  after?: (s: GameState, action: Action, step: number) => void;
}

/**
 * The next AI action in `s`: in a combat, any player's re-roll or missile first (as the web app does),
 * otherwise the acting player's choice. `levels` gives each player's AI level (default 1).
 */
export function aiAction(s: GameState, levels: readonly AiLevel[] | undefined, random: () => number, samples?: number): Action | null {
  const level = (p: number) => levels?.[p] ?? 1;
  let action: Action | null = null;
  if (s.pending[0]?.kind === 'combat') for (const p of s.players) action ??= chooseCombatResponse(s, p.id, { level: level(p.id), random });
  return action ?? chooseAction(s, { samples, random, level: level(actor(s)) });
}

/** Plays AI against AI to the end, or throws if it gets stuck. */
export function playAiGame(game: AiGame): { state: GameState; actions: Action[] } {
  let s = createGame({ players: players(game.players), seed: game.seed, mode: game.mode, mapId: game.mapId });
  const random = seededRandom(game.aiSeed);
  const actions: Action[] = [];
  while (s.phase !== 'over') {
    const step = actions.length;
    if (step >= 3000) throw new Error('no winner after 3000 actions');
    game.before?.(s, step);
    const action = aiAction(s, game.levels, random, 1);
    if (!action) throw new Error(`no action at step ${step}`);
    actions.push(action);
    s = apply(s, action);
    game.after?.(s, action, step);
  }
  return { state: s, actions };
}
