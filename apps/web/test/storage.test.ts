/** Online games share storage with the game on this device; finished ones make way for it. */
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame } from '@regolith/engine';
import { forget, remember, stored } from '../src/storage';
import { loadSavedGame } from '../src/game/savedGame';
import { forgetFinishedGames, onlineGames } from '../src/online/games';
import { generateSecretKey } from 'nostr-tools/pure';
import { encodePost, gameKeys, newSecret, PROTOCOL } from '@regolith/online';
import { openGameLog, rememberGame, saveEvents } from '../src/online/storage';
import { appKey } from '../src/appId';

/** localStorage holding at most `quota` characters (keys and values), like a browser's. */
class FakeStorage {
  data = new Map<string, string>();
  constructor(public quota: number) {}
  private used(except?: string) {
    let n = 0;
    for (const [k, v] of this.data) if (k !== except) n += k.length + v.length;
    return n;
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.used(k) + k.length + v.length > this.quota) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let store: FakeStorage;
const setQuota = (quota: number) => {
  store = new FakeStorage(quota);
  (globalThis as { localStorage?: unknown }).localStorage = store;
};

/** A secret per game, valid in form; the games' events are `size` characters each. */
const secret = (i: number) => `game${i}`.padEnd(22, 'x');
function addGame(i: number, over: boolean, size = 1000) {
  rememberGame({ secret: secret(i), over });
  const tag = onlineGames().find((g) => g.secret === secret(i))!.tag;
  saveEvents(tag, [{ content: 'e'.repeat(size) } as never]);
}

describe('online games in storage', () => {
  beforeEach(() => setQuota(1_000_000));

  it('discards saved games with a removed mode id', () => {
    const players = [
      { name: 'A', color: '#fff', ai: false, aiLevel: 1 },
      { name: 'B', color: '#000', ai: true, aiLevel: 1 },
    ];
    const state = createGame({ players, mode: 'basic', seed: 1 });
    store.setItem(appKey('savedGame'), JSON.stringify({ ...state, mode: 'prototyping' }));

    expect(loadSavedGame()).toBeNull();
    expect(stored(appKey('savedGame'))).toBeNull();
  });

  it(`keeps only the most recently seen finished games`, () => {
    for (let i = 0; i < 8; i++) addGame(i, true);
    addGame(8, false);
    const games = onlineGames();
    expect(games.filter((g) => g.over).map((g) => g.secret)).toEqual([7, 6, 5, 4, 3].map(secret));
    expect(games.some((g) => g.secret === secret(8))).toBe(true);
    // The dropped games' events are gone too.
    expect([...store.data.keys()].filter((k) => k.startsWith(appKey('online.events.'))).length).toBe(6);
  });

  it('frees room for the saved game by dropping finished games, oldest first', () => {
    addGame(0, true);
    addGame(1, false);
    addGame(2, true);
    // Room for the save once one game's events are gone, not before.
    store.quota = [...store.data].reduce((n, [k, v]) => n + k.length + v.length, 0) + 800;
    expect(remember(appKey('savedGame'), 's'.repeat(1400))).toBe(true);
    const left = onlineGames().map((g) => g.secret);
    expect(left).toContain(secret(1));
    expect(left).toContain(secret(2));
    expect(left).not.toContain(secret(0));
  });

  it('never drops a game in progress, and gives up when nothing more can go', () => {
    addGame(0, false);
    addGame(1, true);
    expect(remember(appKey('savedGame'), 's'.repeat(2_000_000))).toBe(false);
    expect(onlineGames().map((g) => g.secret)).toEqual([secret(0)]);
    expect(stored(appKey('savedGame'))).toBeNull();
  });

  it('lets the lobby forget every finished game and its events', () => {
    addGame(0, true);
    addGame(1, false);
    addGame(2, true);
    expect(forgetFinishedGames().map((g) => g.secret)).toEqual([secret(1)]);
    expect(onlineGames().map((g) => g.secret)).toEqual([secret(1)]);
    expect([...store.data.keys()].filter((k) => k.startsWith(appKey('online.events.'))).length).toBe(1);
  });

  it('ends when storage refuses every write', () => {
    addGame(0, true);
    store.setItem = () => {
      throw new Error('SecurityError');
    };
    expect(remember(appKey('mode'), 'basic')).toBe(false);
    forget(appKey('mode'));
  });

  describe('when the saved events were last whole (syncedAt)', () => {
    const game = newSecret();
    const { tag } = gameKeys(game);
    const players = [
      { name: 'A', color: '#fff', ai: false, aiLevel: 1 },
      { name: 'B', color: '#000', ai: true, aiLevel: 1 },
    ];
    const { event } = encodePost(
      gameKeys(game),
      generateSecretKey(),
      { t: 'create', protocol: PROTOCOL, config: { players, mapId: 'alpha-hex', mode: 'regolith', seed: 1 }, creator: 0, open: [] },
      null,
    );

    it('is saved with the events, and only once a relay has sent everything', () => {
      saveEvents(tag, [event]);
      expect(openGameLog(game).load()).toBeUndefined();
      saveEvents(tag, [event], 1234);
      const log = openGameLog(game);
      expect(log.load()).toBe(1234);
      expect(log.events.has(event.id)).toBe(true);
    });

    it('carries over to a later save with more events (what a game does before it next syncs)', () => {
      saveEvents(tag, [event], 1234);
      const log = openGameLog(game);
      const loaded = log.load();
      const { event: claim } = encodePost(gameKeys(game), generateSecretKey(), { t: 'claim', seat: 1, name: 'B' }, null);
      log.receive(claim);
      saveEvents(tag, [...log.events.values()], loaded);
      const again = openGameLog(game);
      expect(again.load()).toBe(1234);
      expect(again.events.size).toBe(2);
    });

    it('is not trusted when a saved event cannot be read', () => {
      saveEvents(tag, [event, { ...event, id: 'other', content: 'damaged' }], 1234);
      expect(openGameLog(game).load()).toBeUndefined();
      store.setItem(appKey(`online.events.${tag}`), JSON.stringify({ events: [event, 42], syncedAt: 1234 }));
      expect(openGameLog(game).load()).toBeUndefined();
      // Valid encryption, malformed post body: rejected from both timeline and events.
      const { event: bad } = encodePost(gameKeys(game), generateSecretKey(), { t: 'nope' } as never, null);
      saveEvents(tag, [event, bad], 1234);
      const log = openGameLog(game);
      expect(log.load()).toBeUndefined();
      expect(log.events.has(bad.id)).toBe(false);
    });

    it('reads the older saves, a bare array of events, as never synced', () => {
      store.setItem(appKey(`online.events.${tag}`), JSON.stringify([event]));
      const log = openGameLog(game);
      expect(log.load()).toBeUndefined();
      expect(log.events.has(event.id)).toBe(true);
    });
  });
});
