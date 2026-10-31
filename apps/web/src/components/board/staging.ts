import { useState } from 'react';
import { cellOf, drawing, movePath, same, type Cell, type Die, type GameState } from '@regolith/engine';
import { BEAM_ARRIVES, BLINK, boomAt, EXPANSION } from '../../beats';
import { isPlayStep } from '../../game/useTransient';
import { reducedMotion } from '../../game/useMediaQuery';
import { destroyedOf, strikeOf } from '../../game/strike';
import { cardEffectsOf } from './CardEffects';
import { shipSpots } from './geometry';

/** How a step's results wait on its card's effect, so the effect comes first. */
export interface Staging {
  /** Ships that appear only once their card's effect gets there (ms in); Nomadic's don't glide there either. */
  late: Map<string, number>;
  /** Ships a card destroyed, as they were, still shown where they were until its blow lands (ms in). */
  struck: { die: Die; r: number; c: number; ms: number }[];
  /** The planet whose new cube drops in late (a relocated one, once the beam brings it), and when. */
  cube?: { planet: number; ms: number };
  /** Ships that fly the spaces they cross, not straight there: each one's drawn spots, its old one first (Board, glideAlong). */
  paths: Map<string, { r: number; c: number }[]>;
}

const NONE: Staging = { late: new Map(), struck: [], paths: new Map() };

/**
 * The spaces ship `id` flew over in the step from `before` to `game`, its old one first (engine movePath), when it
 * crossed more than one: a straight glide shows a one-space move as well. Empty for one a card moved another way.
 */
export function glidePath(before: GameState, game: GameState, id: string): Cell[] {
  const was = before.dice.find((d) => d.id === id);
  const now = game.dice.find((d) => d.id === id);
  const from = was && cellOf(was);
  const to = now && cellOf(now);
  if (!from || !to || same(from, to)) return [];
  const path = movePath(before, id, to);
  return path.length > 2 && same(path[0], from) ? path : [];
}

/** The staging of the step from `before` to `game`, as it plays (useStaging), and as it is heard (game/sounds). */
export function stagingOf(before: GameState, game: GameState): Staging {
  const out: Staging = { late: new Map(), struck: [], paths: new Map() };
  for (const e of cardEffectsOf(before, game)) {
    // When the card's effect brings the ship or cube (beats.ts): Expansion's lance lands, Nomadic's rings open,
    // a relocated cube's spark arrives.
    if (e.kind === 'expansion' && e.replaces) out.late.set(e.replaces, EXPANSION.strike);
    else if (e.kind === 'blink' && e.replaces) out.late.set(e.replaces, BLINK.open);
    else if (e.kind === 'beam' && e.replaces?.startsWith('planet:')) out.cube = { planet: Number(e.replaces.slice(7)), ms: BEAM_ARRIVES };
  }
  const { at } = drawing(game.board);
  const now = shipSpots(game);
  for (const d of game.dice) {
    const path = out.late.has(d.id) ? [] : glidePath(before, game, d.id);
    if (!path.length) continue;
    // It ends where it's shown: partway into the target's space, for an attack.
    out.paths.set(d.id, [...path.slice(0, -1).map(at), now.get(d.id)!]);
  }
  const ms = strikeOf(before);
  if (ms) {
    // Each stays until it blows up, one after another (Explosions).
    const spots = shipSpots(before);
    destroyedOf(before, game).forEach((d, i) => {
      const at = spots.get(d.id);
      if (at) out.struck.push({ die: d, ...at, ms: ms + boomAt(i) });
    });
  }
  return out;
}

/**
 * The staging of the step that brought `game`, until the next one. Worked out as it renders (derived
 * state), so the very first frame of the new position is already staged. None for undo, a jump to
 * another position (`scene`) or under reduced motion.
 */
export function useStaging(game: GameState, scene?: string): Staging {
  const [st, setSt] = useState({ game, scene, staging: NONE });
  if (st.game !== game || st.scene !== scene) {
    const play = st.scene === scene && isPlayStep(st.game, game) && !reducedMotion();
    const staging = play ? stagingOf(st.game, game) : NONE;
    setSt({ game, scene, staging });
    return staging;
  }
  return st.staging;
}
