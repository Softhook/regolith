import type { PlayerConfig } from '@regolith/engine';
import { PLAYER_COLORS } from '../theme';

const AI_NAMES = ['Nova', 'Vex', 'Orion', 'Lyra', 'Kepler'];

/** The default seat `i`: Commander first, then the named AI opponents, each in its seat colour. */
export function defaultSeat(i: number, ai: boolean, aiLevel: number): PlayerConfig {
  return { name: i === 0 ? 'Commander' : AI_NAMES[i], color: PLAYER_COLORS[i], ai, aiLevel };
}
