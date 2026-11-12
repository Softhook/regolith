import { useSyncExternalStore } from 'react';
import { apply, cellOf, same, type Action, type Cell, type GameState, type LogEntry } from '@regolith/engine';
import { castOf } from './cast';
import { cardEffectsOf } from './cardEffects';
import { lastLogId } from './steps';

/**
 * A card said before it does what it does on the map, so it is read and out of the way first (useAiDriver):
 * an AI tells the screen (PlayedCard) the card it is about to play or use, if it is new (`fresh`: shown
 * before it is played, as it will be logged), then where it lands, and the card steps aside before the
 * effect plays there.
 */
export interface Herald {
  /** The card's log entry: one already logged (a Tactic waiting to land), or the one the action will log. */
  entry: LogEntry;
  fresh: boolean;
  cells: Cell[];
}

/** How long a card shown ahead stays up before stepping aside: long enough to read. */
export const READ_MS = 1300;
/** How long the card takes to step aside (CSS .played-card's transition, its delay included). */
export const ASIDE_MS = 750;

/** The spaces the step from `before` to `game` changes on the map: its card effects (CardEffects), and new Ice Tunnels. */
export function mapHits(before: GameState, game: GameState): Cell[] {
  const cells = cardEffectsOf(before, game).flatMap((e) => (e.to ? [e.at, e.to] : [e.at]));
  cells.push(...game.tunnels.filter((g) => !before.tunnels.some((x) => same(x, g))));
  return cells;
}

/** The spaces `a` aims at in `game`: its spaces, and the spaces of the mechs it names. */
function cellsOf(game: GameState, a: Action): Cell[] {
  const out: Cell[] = [];
  for (const v of Object.values(a)) {
    if (v && typeof v === 'object' && 'r' in v && 'c' in v) out.push(v as Cell);
    else if (typeof v === 'string') {
      const d = game.dice.find((x) => x.id === v);
      const at = d && cellOf(d);
      if (at) out.push(at);
    }
  }
  return out;
}

/** The card `a` plays, uses or lands in `game`, if what it does is on the map. */
export function heraldOf(game: GameState, a: Action): Herald | undefined {
  let next: GameState;
  try {
    next = apply(game, a);
  } catch {
    return undefined;
  }
  const entry = castOf(game, next);
  if (!entry?.card || entry.player === undefined || entry.gains) return undefined;
  const cells = [...cellsOf(game, a), ...mapHits(game, next)];
  return cells.length ? { entry, fresh: entry.id > lastLogId(game), cells } : undefined;
}

/** A card announced ahead (`show`), or where it lands (`aim`). */
type Said = { kind: 'show'; entry: LogEntry } | { kind: 'aim'; id: number; cells: Cell[] };

let current: Said | undefined;
const listeners = new Set<() => void>();
// What has been said already, by game and entry: each card is shown ahead and steps aside once.
const said = new Set<string>();

function say(game: GameState, s: Said): boolean {
  const key = `${game.seed}:${s.kind}:${s.kind === 'show' ? s.entry.id : s.id}`;
  if (said.has(key)) return false;
  said.add(key);
  current = s;
  listeners.forEach((l) => l());
  return true;
}

/** Shows the card `h` will log, before it does; false if it already has been. */
export const showCard = (game: GameState, h: Herald) => say(game, { kind: 'show', entry: h.entry });
/** Says where `h` lands, so its card steps aside; false if it already has. */
export const aimCard = (game: GameState, h: Herald) => say(game, { kind: 'aim', id: h.entry.id, cells: h.cells });

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The last thing said. */
export const useSaid = () => useSyncExternalStore(subscribe, () => current);
