import { generateSecretKey } from 'nostr-tools/pure';
import { decodeEvent, gameKeys, hex, Timeline, type NostrEvent } from '@regolith/online';
import { forget, remember, stored, storedJson } from '../storage';
import { eventsKey, onlineGames, saveOnlineGames, type OnlineGameEntry } from './games';
import { appKey } from '../appId';

/**
 * What a browser keeps of its online games, in localStorage: its identity, every game's events
 * (the whole game, so it can be replayed and re-sent to relays that lost it) and the list of games
 * for the lobby (games.ts).
 */
const KEY = appKey('online.key');

/** This browser's Nostr secret key: it signs its posts and so identifies its seats. */
export function identity(): Uint8Array {
  const kept = stored(KEY);
  if (kept && /^[0-9a-f]{64}$/.test(kept)) return Uint8Array.from(kept.match(/../g)!, (b) => parseInt(b, 16));
  // None yet, or storage unavailable: then this identity lasts only for this visit.
  const sk = generateSecretKey();
  remember(KEY, hex(sk));
  return sk;
}

/**
 * Asks the browser not to clear this site's storage when space runs low: it holds this browser's
 * identity, and with it its seats. (Safari may still clear it after weeks without a visit.)
 */
export function keepStorage() {
  void navigator.storage?.persist?.().catch(() => {});
}

/**
 * What a game saves of itself: its events and, if a relay had sent it everything it held as of
 * them, when (unix seconds) that relay was asked. Kept in one entry, so a tab that saves fewer
 * events (another tab on the same game) never leaves a later tab's `syncedAt` with them.
 */
interface SavedLog {
  events: NostrEvent[];
  syncedAt?: number;
}

/** The saved log, and how many of its entries were damaged (left out). Older saves are a bare array of events. */
function loadLog(tag: string): SavedLog & { damaged: number } {
  const saved = storedJson<unknown>(eventsKey(tag));
  if (saved === null) return { events: [], damaged: 0 };
  const log: Partial<SavedLog> = Array.isArray(saved) ? { events: saved } : (saved as Partial<SavedLog>);
  // Not a log at all: one damaged entry.
  if (!Array.isArray(log.events)) return { events: [], damaged: 1 };
  const events = log.events.filter((e): e is NostrEvent => typeof (e as NostrEvent | null)?.id === 'string');
  const syncedAt = typeof log.syncedAt === 'number' ? log.syncedAt : undefined;
  return { events, syncedAt, damaged: log.events.length - events.length };
}

/** Whether they were saved. `syncedAt`: see SavedLog; left out until a relay has sent everything. */
export function saveEvents(tag: string, events: NostrEvent[], syncedAt?: number): boolean {
  const saved = remember(eventsKey(tag), JSON.stringify({ events, syncedAt } satisfies SavedLog));
  if (!saved) console.warn('[game] could not save the online game locally');
  return saved;
}

/**
 * A game's events and the timeline they make. `load` adds those this browser saved (decrypting
 * each, so not while rendering) and returns when they were last whole (`syncedAt`), or undefined
 * if they weren't known to be, or some could not be read; `receive` adds one (a relay's): true if
 * it was new and valid.
 */
export function openGameLog(secret: string) {
  const keys = gameKeys(secret);
  const timeline = new Timeline();
  const events = new Map<string, NostrEvent>();
  const receive = (e: NostrEvent, trusted = false) => {
    if (events.has(e.id)) return false;
    const p = decodeEvent(keys, e, trusted);
    if (!p || !timeline.add(p)) return false;
    events.set(e.id, e);
    return true;
  };
  const load = (): number | undefined => {
    const saved = loadLog(keys.tag);
    for (const e of saved.events) receive(e, true);
    // One that didn't decode (damaged, or another game's) never made it in.
    const damaged = saved.damaged + saved.events.filter((e) => !events.has(e.id)).length;
    if (damaged) console.warn(`[game] ${damaged} saved event(s) of an online game could not be read`);
    return damaged ? undefined : saved.syncedAt;
  };
  return { keys, timeline, events, receive, load };
}

/** Finished games kept in this browser (the most recently seen); older ones are let go. */
const KEEP_FINISHED = 5;

export function rememberGame(entry: Partial<OnlineGameEntry> & { secret: string }) {
  const list = onlineGames();
  const old = list.find((g) => g.secret === entry.secret);
  const next: OnlineGameEntry = { addedAt: Date.now(), tag: gameKeys(entry.secret).tag, ...old, ...entry, seenAt: Date.now() };
  const games = [next, ...list.filter((g) => g.secret !== entry.secret)];
  // Each game's events take room in storage it shares with the game on this device.
  const stale = games.filter((g) => g.over).slice(KEEP_FINISHED);
  for (const g of stale) forget(eventsKey(g.tag));
  saveOnlineGames(games.filter((g) => !stale.includes(g)));
}
