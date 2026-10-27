import { useState } from 'react';
import type { Die, GameState } from '@regolith/engine';
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
}

const NONE: Staging = { late: new Map(), struck: [] };

/** The staging of the step from `before` to `game`, as it plays (useStaging), and as it is heard (game/sounds). */
export function stagingOf(before: GameState, game: GameState): Staging {
  const out: Staging = { late: new Map(), struck: [] };
  for (const e of cardEffectsOf(before, game)) {
    // When the card's effect brings the ship or cube (beats.ts): Expansion's lance lands, Nomadic's rings open,
    // a relocated cube's spark arrives.
    if (e.kind === 'expansion' && e.replaces) out.late.set(e.replaces, EXPANSION.strike);
    else if (e.kind === 'blink' && e.replaces) out.late.set(e.replaces, BLINK.open);
    else if (e.kind === 'beam' && e.replaces?.startsWith('planet:')) out.cube = { planet: Number(e.replaces.slice(7)), ms: BEAM_ARRIVES };
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
