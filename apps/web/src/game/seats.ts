import type { PlayerConfig } from '@regolith/engine';
import { PLAYER_COLORS } from '../theme';

/** The sides' short names, in seat order (REGOLITH-WORLD.md *The sides*): Yuropa Commune, Zhong Combine, and so on. */
const SIDE_NAMES = ['Yuropa', 'Zhong', 'Merika', 'Austral', 'Bharat'];

/** The default seat `i`: named for its side, in its seat colour. */
export function defaultSeat(i: number, ai: boolean, aiLevel: number): PlayerConfig {
  return { name: SIDE_NAMES[i], color: PLAYER_COLORS[i], ai, aiLevel };
}
