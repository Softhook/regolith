import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '@regolith/engine';
import { reducedMotion } from './useMediaQuery';

/** The id of the game's last log entry, 0 before there is one. */
export const lastLogId = (game: GameState) => game.log.at(-1)?.id ?? 0;

/** Whether the step from `before` to `game` was play: undo moves ships and takes cubes away too, but never adds log entries. */
export const isPlayStep = (before: GameState, game: GameState) => lastLogId(game) > lastLogId(before);

/**
 * Things shown for a moment (an effect, an explosion, a flying card): `show` adds some (after `delay` ms,
 * if given), and each batch goes again `ms` later. Nothing is left waiting once the component has gone.
 */
export function useTransient<T>(ms: number): [items: T[], show: (fresh: T[], delay?: number) => void] {
  const [items, setItems] = useState<T[]>([]);
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);
  const show = useCallback(
    (fresh: T[], delay = 0) => {
      if (!fresh.length) return;
      const later = (wait: number, then: () => void) => {
        const t = window.setTimeout(() => {
          timers.current.delete(t);
          then();
        }, wait);
        timers.current.add(t);
      };
      const add = () => {
        setItems((x) => [...x, ...fresh]);
        later(ms, () => setItems((x) => x.filter((i) => !fresh.includes(i))));
      };
      if (delay) later(delay, add);
      else add();
    },
    [ms],
  );
  return [items, show];
}

/**
 * The effects `effectsOf` finds in each step of play, each gone after `ms`: on the map (board/) and the
 * player panels (PlayerList). None under reduced motion, none for undo (no new log entries), and none when
 * `scene` changes (a jump to another position, see Game).
 */
export function useStepEffects<T>(
  game: GameState,
  ms: number,
  effectsOf: (before: GameState, game: GameState) => T[],
  scene?: string,
): T[] {
  const [effects, show] = useTransient<T>(ms);
  const prev = useRef({ game, scene });
  useEffect(() => {
    const before = prev.current;
    prev.current = { game, scene };
    if (before.scene === scene && isPlayStep(before.game, game) && !reducedMotion()) show(effectsOf(before.game, game));
  }, [game, scene, show, effectsOf]);
  return effects;
}
