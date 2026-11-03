import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '@regolith/engine';
import { isPlayStep } from './steps';
import { useEffectEvent } from './useEffectEvent';
import { reducedMotion } from './useMediaQuery';

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
 * Calls `played` with the position before each step of play: not for undo (no new log entries), nor when `scene`
 * changes (a jump to another position, see Game).
 */
export function usePlaySteps(game: GameState, scene: string | undefined, played: (before: GameState) => void) {
  const onStep = useEffectEvent(played);
  const prev = useRef({ game, scene });
  useEffect(() => {
    const before = prev.current;
    prev.current = { game, scene };
    if (before.scene === scene && isPlayStep(before.game, game)) onStep(before.game);
  }, [game, scene, onStep]);
}

/**
 * The effects `effectsOf` finds in each step of play (`usePlaySteps`), each gone after `ms`: on the map (board/)
 * and the player panels (PlayerList). None under reduced motion.
 */
export function useStepEffects<T>(
  game: GameState,
  ms: number,
  effectsOf: (before: GameState, game: GameState) => T[],
  scene?: string,
): T[] {
  const [effects, show] = useTransient<T>(ms);
  usePlaySteps(game, scene, (before) => {
    if (!reducedMotion()) show(effectsOf(before, game));
  });
  return effects;
}
