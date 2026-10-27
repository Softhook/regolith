import type { Board } from '@regolith/engine';
import { lookWorld, type TileLook } from '@regolith/art';

/** How a map's tiles look: hex maps on their world's ground, Phobos's, Deimos's or Mars's (the Regolith tiles). */
export function useMapLook(board: Board): TileLook {
  if (!board.hex) return 'square';
  return board.world ?? 'hex';
}

/** Whether this map is drawn on its world's ground, where the pieces cast hard shadows. */
export const useOnGround = (board: Board): boolean => !!lookWorld(useMapLook(board));
