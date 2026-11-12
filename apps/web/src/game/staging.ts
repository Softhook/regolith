import { useState } from 'react';
import { cellOf, drawing, movePath, same, type Cell, type Die, type GameState } from '@regolith/engine';
import { boomAt, REINFORCEMENT } from '../beats';
import { cardEffectsOf, type CardEffect } from './cardEffects';
import { mechSpots, touching } from './mechSpots';
import { isPlayStep } from './steps';
import { destroyedOf, strikeOf } from './strike';
import { reducedMotion } from './useMediaQuery';

/** How a step's results wait on its card's effect, so the effect comes first. */
export interface Staging {
  /** Mechs that appear only once their card's effect gets there (ms in), without gliding there. */
  late: Map<string, number>;
  /** Mechs a card destroyed, as they were, still shown where they were until its blow lands (ms in). */
  struck: { die: Die; r: number; c: number; ms: number }[];
  /** Mechs that fly the spaces they cross, not straight there: each one's way (flightOf), ending where it's shown (Board, glideAlong). */
  paths: Map<string, Waypoint[]>;
}

/** A space on a mech's way: where it's drawn, and how far into its glide (0 to 1) the mech gets there. */
export interface Waypoint {
  cell: Cell;
  r: number;
  c: number;
  at: number;
}

export const NO_STAGING: Staging = { late: new Map(), struck: [], paths: new Map() };

/**
 * The way mech `id` flew in the step from `before` to `game`, its old space first (engine movePath), when it
 * crossed more than one: a straight glide shows a one-space move as well. Empty for one a card moved another way.
 * It flies at an even speed, and jumps across a joined edge or through an Ice Tunnel: both ends of that come at once.
 */
function flightOf(before: GameState, game: GameState, id: string): Waypoint[] {
  const was = before.dice.find((d) => d.id === id);
  const now = game.dice.find((d) => d.id === id);
  const from = was && cellOf(was);
  const to = now && cellOf(now);
  if (!from || !to || same(from, to)) return [];
  const path = movePath(before, id, to);
  if (path.length <= 2 || !same(path[0], from)) return [];
  const { at } = drawing(game.board);
  const spots = path.map(at);
  const hops = spots.slice(1).map((p, i) => (touching(spots[i], p) ? Math.hypot(p.r - spots[i].r, p.c - spots[i].c) : 0));
  const total = hops.reduce((a, b) => a + b, 0) || 1;
  let gone = 0;
  return path.map((cell, i) => {
    if (i) gone += hops[i - 1];
    return { cell, ...spots[i], at: gone / total };
  });
}

/** The staging of the step from `before` to `game`, as it plays (useStep), and as it is heard (sounds). `cards`: its card effects. */
export function stagingOf(before: GameState, game: GameState, cards = cardEffectsOf(before, game)): Staging {
  const out: Staging = { late: new Map(), struck: [], paths: new Map() };
  for (const e of cards) {
    // When the card's effect brings the mech (beats.ts): Reinforcements's lance lands.
    if (e.kind === 'reinforcement' && e.replaces) out.late.set(e.replaces, REINFORCEMENT.strike);
  }
  const now = mechSpots(game);
  for (const d of game.dice) {
    const way = out.late.has(d.id) ? [] : flightOf(before, game, d.id);
    if (!way.length) continue;
    // It ends where it's shown: partway into the target's space, for an attack.
    const last = way[way.length - 1];
    out.paths.set(d.id, [...way.slice(0, -1), { ...last, ...now.get(d.id)! }]);
  }
  const ms = strikeOf(before);
  if (ms) {
    // Each stays until it blows up, one after another (Explosions).
    const spots = mechSpots(before);
    destroyedOf(before, game).forEach((d, i) => {
      const at = spots.get(d.id);
      if (at) out.struck.push({ die: d, ...at, ms: ms + boomAt(i) });
    });
  }
  return out;
}

/**
 * A step of play as the map shows it: the position before and after, its card effects (cardEffectsOf) and its
 * staging. Worked out once, for the map's layers to share (the staging, and the effects of the moves, cards, shots
 * and blasts), so they all see the same step and none works it out again.
 */
export interface Step {
  before: GameState;
  game: GameState;
  cards: CardEffect[];
  staging: Staging;
}

/**
 * The step that brought `game`, until the next one; a new object for each. Worked out as it renders (derived
 * state), so the very first frame of the new position is already staged. Null for undo, a jump to another
 * position (`scene`), or under reduced motion: nothing is staged and no effect plays.
 */
export function useStep(game: GameState, scene?: string): Step | null {
  const [st, setSt] = useState<{ game: GameState; scene?: string; step: Step | null }>({ game, scene, step: null });
  if (st.game !== game || st.scene !== scene) {
    const play = st.scene === scene && isPlayStep(st.game, game) && !reducedMotion();
    const before = st.game;
    const cards = play ? cardEffectsOf(before, game) : [];
    const step = play ? { before, game, cards, staging: stagingOf(before, game, cards) } : null;
    setSt({ game, scene, step });
    return step;
  }
  return st.step;
}
