import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, LogEvent, PlayerId } from '@regolith/engine';
import { sfx } from '../sound';
import { logText } from './logText';
import { playSounds } from './sounds';

export interface Toast {
  id: number;
  text: string;
  player?: number;
  tone: 'info' | 'good' | 'bad' | 'gold';
}

/** The toast tone for each logged event (none: no toast). Sounds are in sounds.ts. */
const TONES: Record<LogEvent, Toast['tone'] | undefined> = {
  victory: 'gold',
  infamy: 'gold',
  seize: 'gold',
  conquer: 'good',
  startPlanet: undefined,
  battleWon: 'good',
  repelled: 'bad',
  missile: 'bad',
  shipDestroyed: 'bad',
  cardTaken: 'info',
  cardPlayed: 'info',
  expansion: 'info',
  discard: 'info',
  breakthrough: 'info',
};

const MAX_TOASTS = 4;
const TOAST_MS = 4200;

/** Toasts for notable log entries. `announce(prev, next, mine)` reacts to the entries `next` adds, as heard by whom the screen plays for. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((t) => window.clearTimeout(t));
      active.clear();
    };
  }, []);

  const announce = useCallback((prev: GameState, next: GameState, mine: (p: PlayerId) => boolean) => {
    const fresh = next.log.filter((e) => e.id > (prev.log.at(-1)?.id ?? 0));
    playSounds(prev, next, fresh, mine);
    const shown = fresh.flatMap((e): Toast[] => {
      const tone = e.event && TONES[e.event];
      return tone ? [{ id: e.id, text: logText(next, e), player: e.player, tone }] : [];
    });
    if (!shown.length) return;
    setToasts((t) => [...t, ...shown].slice(-MAX_TOASTS));
    for (const s of shown) {
      const id = window.setTimeout(() => {
        timers.current.delete(id);
        setToasts((t) => t.filter((x) => x.id !== s.id));
      }, TOAST_MS);
      timers.current.add(id);
    }
  }, []);

  return { toasts, announce };
}

/** The error toast: the latest error, and `showError` to show one (with the error sound). */
export function useErrorToast() {
  const [error, setError] = useState<{ id: number; text: string } | null>(null);
  const showError = useCallback((text: string) => {
    sfx.error();
    setError({ id: Date.now(), text });
  }, []);
  return { error, showError };
}
