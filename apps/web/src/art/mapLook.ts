import { useSyncExternalStore } from 'react';
import type { Board } from '@regolith/engine';
import { lookWorld, type TileLook } from '@regolith/art';
import { remember, stored } from '../storage';
import { appKey } from '../appId';

/*
 * How hex maps look: on their world's ground, Phobos's, Deimos's or Mars's (the Regolith tiles, with a building on
 * each planet's space), or in space, as the original tiles. Kept on this device; the top bar switches it
 * (WorldButton).
 */

let onGround = stored(appKey('ground')) !== 'off';
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setGroundMaps(on: boolean) {
  onGround = on;
  remember(appKey('ground'), on ? 'on' : 'off');
  listeners.forEach((l) => l());
}

/** Whether hex maps are drawn on their world's ground. */
export const useGroundMaps = () => useSyncExternalStore(subscribe, () => onGround);

/** How a map's tiles look: square, or hex on its world's ground or, with that switched off, in space. */
export function useMapLook(board: Board): TileLook {
  const ground = useGroundMaps();
  if (!board.hex) return 'square';
  return ground && board.world ? board.world : 'hex';
}

/** Whether this map is drawn on its world's ground, where the pieces cast hard shadows. */
export const useOnGround = (board: Board): boolean => !!lookWorld(useMapLook(board));
