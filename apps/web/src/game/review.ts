import { useMemo, useState } from 'react';
import type { GameState, LogEntry } from '@regolith/engine';
import { useShortcut } from './useShortcut';

/**
 * For each log entry, the position just after it was written: what the map looked like then. `states`
 * is every position of the game, oldest first; entries up to `after` were written before the first,
 * and have none. An undo goes back to an earlier position, whose next entries reuse the undone ones'
 * ids; the later position wins, as it is the one the log shows.
 */
export function logPositions(states: readonly GameState[], after = 0): Map<number, GameState> {
  const out = new Map<number, GameState>();
  let last = after;
  for (const s of states) {
    for (let i = s.log.length - 1; i >= 0 && s.log[i].id > last; i--) out.set(s.log[i].id, s);
    last = s.logCounter;
  }
  return out;
}

/**
 * The positions `logPositions` still needs to show `states.at(-1)`'s log: the earliest ones go once all
 * they could show has left the log (it keeps only its last entries).
 */
export function keepReviewable(states: readonly GameState[]): readonly GameState[] {
  const oldest = states.at(-1)?.log[0]?.id;
  if (oldest === undefined) return states;
  let from = 0;
  // Without states[from], what states[from + 1] wrote down to is no longer shown: drop it if that is gone already.
  while (from + 1 < states.length && states[from + 1].logCounter < oldest) from++;
  return from ? states.slice(from) : states;
}

/**
 * The move `entries[i]` belongs to, as the entries `from` to `to` (exclusive), and where the review of it
 * steps to. One move often writes several entries that all show the same position, so a step goes to
 * the first entry of the next or previous move that changes it.
 */
export function reviewSteps(entries: readonly LogEntry[], at: ReadonlyMap<number, GameState>, i: number) {
  const starts = entries.flatMap((e, j) => (j === 0 || at.get(e.id) !== at.get(entries[j - 1].id) ? [j] : []));
  let k = 0;
  while (starts[k + 1] <= i) k++;
  const next: number | undefined = starts[k + 1];
  return { from: starts[k], to: next ?? entries.length, prev: k > 0 ? starts[k - 1] : undefined, next };
}

export interface Review {
  /** The log entry being looked back at, and the position just after it. */
  entry: LogEntry;
  state: GameState;
  /** The ids of the entries the same move wrote, which all show this position. */
  move: ReadonlySet<number>;
  /** The previous move that can be looked back at, if any. */
  prev?: () => void;
  /** The next move, or after the last one (`last`), the game. */
  next(): void;
  last: boolean;
  close(): void;
}

/**
 * Looking back at the game from its log: `pick` an entry to show the map as it was just after it.
 * `game` is the game as it is now, whose log is on screen. ←/→ step through the moves, Esc goes back.
 */
export function useReview(game: GameState, positions: readonly GameState[], after = 0) {
  const [picked, setPicked] = useState<number | null>(null);
  const at = useMemo(() => logPositions(positions, after), [positions, after]);
  const entries = useMemo(() => game.log.filter((e) => at.has(e.id)), [game.log, at]);
  const i = entries.findIndex((e) => e.id === picked);
  // An entry that is gone (taken back by an undo, or too old for the log) ends the review, for good:
  // the next entry written after an undo takes its id, and must not open it again.
  if (picked !== null && i < 0) setPicked(null);
  const close = () => setPicked(null);
  const go = (j: number | undefined) => (j === undefined ? undefined : () => setPicked(entries[j].id));
  const steps = i < 0 ? null : reviewSteps(entries, at, i);
  const review: Review | null = !steps
    ? null
    : {
        entry: entries[i],
        state: at.get(entries[i].id)!,
        move: new Set(entries.slice(steps.from, steps.to).map((e) => e.id)),
        prev: go(steps.prev),
        next: go(steps.next) ?? close,
        last: steps.next === undefined,
        close,
      };

  useShortcut(
    (e) =>
      !!review &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      ['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key) &&
      // Escape shuts the phone's bottom sheet first, if it is open (BottomSheet).
      !(e.key === 'Escape' && document.querySelector('.sheet.open')),
    (e) => {
      e.preventDefault();
      if (e.key === 'Escape') close();
      else (e.key === 'ArrowLeft' ? review?.prev : review?.next)?.();
    },
  );

  /** Whether an entry can be looked back at. */
  const can = (id: number) => at.has(id);
  /** Looks back at an entry; picking the one already shown goes back to the game. */
  const pick = (id: number) => setPicked((cur) => (cur === id ? null : id));
  return { review, can, pick };
}
