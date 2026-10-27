import { Relay } from 'nostr-tools/relay';
import { KIND, type NostrEvent } from '@regolith/online';

/** Six relays that accepted and returned a burst of 40 events from a new key in 2026-10. */
export const RELAYS = [
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.snort.social',
  'wss://relay.nostr.net',
  'wss://nostr-pub.wellorder.net',
  'wss://nostr.data.haus',
];

const RETRY_MS = [2000, 5000, 15000, 30000];
/** A relay that doesn't answer within this long counts as down (and is retried later). */
const CONNECT_TIMEOUT_MS = 8000;
/** How long a relay may take to send what it has stored (a whole game is a few hundred events). */
const EOSE_TIMEOUT_MS = 20000;
/** Gap between two events sent to the same relay, so a burst of moves doesn't trip rate limits. */
const SEND_GAP_MS = 150;
/** Pause after a relay says we are sending too fast. */
const RATE_LIMIT_PAUSE_MS = 30000;
/** Waits before sending an event again after a relay didn't confirm it (a timeout, a hiccup). */
const SEND_RETRY_MS = [2000, 8000, 30000];
/** After the quick retries, keep trying at a low rate while the connection remains open. */
const SEND_SLOW_RETRY_MS = 60000;
/** Refusals that won't change by trying again: stop writing to that relay. */
const REFUSED_FOR_GOOD = /blocked|restricted|web of trust|pay|auth-required|nip-05|whitelist|not allowed/i;
const RATE_LIMITED = /rate.?limit|too (many|fast)|slow down/i;
/** Failures worth trying again (no answer, or the relay's own trouble); any other refusal is about the event. */
const TRANSIENT = /timed out|timeout|closed|connection|^error:/i;
/** Relays answer a query with at most a few hundred events; older ones are fetched page by page. */
const PAGE = 500;
/**
 * After a reconnect, only events from this long before the last sync are fetched again. Generous,
 * because an event's time is its poster's clock, which may run behind.
 */
const SINCE_MARGIN_S = 3600;

export interface RelayStatus {
  connected: number;
  total: number;
  /** Events this browser posted that no relay has confirmed yet. */
  unsent: number;
}

/**
 * One game's connection to the relays: receives every event filed under the game's tag (the
 * stored ones, then new ones as they are posted), publishes this browser's events, and re-sends
 * known events a relay doesn't have.
 *
 * Every relay sends the whole game on connecting (or what's new since `since`). The relay library still parses and verifies
 * already-known events before this client skips their decryption and replay.
 */
export class RelayLink {
  private relays = new Map<string, Relay>();
  /** Relays with a connection attempt under way; a second one would leak a socket. */
  private connecting = new Set<string>();
  /** Per relay: the events it is known to hold. */
  private seen = new Map<string, Set<string>>();
  /** Per relay: when (unix seconds) it last sent us everything it had. */
  private synced = new Map<string, number>();
  /** Events waiting to be sent, per relay, oldest first. */
  private outbox = new Map<string, NostrEvent[]>();
  private sending = new Set<string>();
  /** Per relay and event: how many transient publish failures it has had. */
  private tries = new Map<string, Map<string, number>>();
  /** Relays that refused our events for good; still read from. */
  private readOnly = new Set<string>();
  /** This browser's events that no relay has confirmed yet. */
  private unsent = new Set<string>();
  private closed = false;
  private timers = new Set<number>();

  constructor(
    private tag: string,
    /** The events this browser holds for the game. */
    private known: () => NostrEvent[],
    private onEvent: (e: NostrEvent) => void,
    private onStatus: (s: RelayStatus) => void,
    /**
     * Told each time a relay has sent everything it held for the game, with when (unix seconds)
     * it was asked: every event posted before then is known from then on.
     */
    private onSynced: (at: number) => void = () => {},
    /**
     * When (unix seconds) this browser last had every event of the game, to ask only for those
     * from about then on. `known` should then be empty: what a relay holds from before isn't known.
     */
    private since?: number,
  ) {}

  start() {
    for (const url of RELAYS) void this.connect(url, 0);
    // A phone that slept drops its sockets; reconnect as soon as the page is visible again.
    document.addEventListener('visibilitychange', this.wake);
  }

  close() {
    this.closed = true;
    document.removeEventListener('visibilitychange', this.wake);
    for (const t of this.timers) window.clearTimeout(t);
    const relays = [...this.relays.values()];
    this.relays.clear();
    // End the subscriptions first and close the sockets a moment later: nostr-tools sends a
    // subscription's CLOSE message asynchronously, after a socket closed at once has gone, and
    // the browser logs an error for each.
    for (const r of relays) for (const sub of [...r.openSubs.values()]) sub.close();
    window.setTimeout(() => relays.forEach((r) => r.close()), 0);
  }

  publish(e: NostrEvent) {
    this.unsent.add(e.id);
    this.status();
    for (const url of RELAYS) this.enqueue(url, [e]);
  }

  private wake = () => {
    if (document.visibilityState !== 'visible') return;
    for (const url of RELAYS) if (!this.relays.get(url)?.connected) void this.connect(url, 0);
  };

  private status() {
    const writable = [...this.relays].filter(([url, r]) => r.connected && !this.readOnly.has(url)).length;
    this.onStatus({ connected: writable, total: RELAYS.length, unsent: this.unsent.size });
  }

  private later(fn: () => void, ms: number) {
    const t = window.setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** The relay holds this event. */
  private holds(url: string, id: string) {
    this.seen.get(url)!.add(id);
    this.tries.get(url)?.delete(id);
    if (this.unsent.delete(id)) this.status();
  }

  private async connect(url: string, attempt: number) {
    if (this.closed || this.connecting.has(url)) return;
    const old = this.relays.get(url);
    if (old?.connected) return;
    old?.close();
    this.relays.delete(url);
    this.connecting.add(url);
    let r: Relay;
    try {
      // Pings notice a connection that died quietly (a phone changing network), so it is reopened.
      r = await Relay.connect(url, { enablePing: true, timeout: CONNECT_TIMEOUT_MS });
    } catch {
      this.later(() => void this.connect(url, attempt + 1), RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]);
      return;
    } finally {
      this.connecting.delete(url);
    }
    if (this.closed) return r.close();
    this.relays.set(url, r);
    if (!this.seen.has(url)) this.seen.set(url, new Set());
    this.status();
    this.drain(url);
    r.onclose = () => {
      if (this.relays.get(url) !== r) return;
      this.relays.delete(url);
      this.status();
      this.later(() => void this.connect(url, 1), RETRY_MS[0]);
    };
    this.subscribe(url, r);
  }

  /**
   * The relay's events for the game (all of them the first time, those since the last sync after
   * that), then every new one as it is posted. Once it has sent what it has, it gets what it lacks.
   */
  private subscribe(url: string, r: Relay) {
    const last = this.synced.get(url) ?? this.since;
    const since = last === undefined ? undefined : last - SINCE_MARGIN_S;
    const startedAt = Math.floor(Date.now() / 1000);
    const page = { count: 0, oldest: Infinity };
    r.subscribe([{ kinds: [KIND], '#t': [this.tag], limit: PAGE, since }], {
      eoseTimeout: EOSE_TIMEOUT_MS,
      onevent: this.receive(url, page),
      oneose: () =>
        void this.backfill(url, r, page, since).then(() => {
          this.synced.set(url, startedAt);
          this.resend(url);
          this.onSynced(startedAt);
        }),
      // The relay ended the subscription (some do after a while); ask again unless we're leaving.
      onclose: (reason) => {
        if (this.closed || this.relays.get(url) !== r || !r.connected || reason === 'closed by caller') return;
        this.later(() => this.relays.get(url) === r && r.connected && this.subscribe(url, r), RETRY_MS[1]);
      },
    });
  }

  /** A subscription's `onevent`: records what the relay holds, counts the page, and passes the event on. */
  private receive(url: string, page: { count: number; oldest: number }) {
    return (e: NostrEvent) => {
      page.count++;
      page.oldest = Math.min(page.oldest, e.created_at);
      this.holds(url, e.id);
      this.onEvent(e);
    };
  }

  /** Fetches older pages until one brings nothing new. */
  private async backfill(url: string, r: Relay, first: { count: number; oldest: number }, since: number | undefined) {
    const seen = this.seen.get(url)!;
    let { count, oldest } = first;
    while (count >= 50 && Number.isFinite(oldest) && !this.closed && r.connected) {
      const before = seen.size;
      const page = { count: 0, oldest: Infinity };
      await new Promise<void>((done) => {
        const sub = r.subscribe([{ kinds: [KIND], '#t': [this.tag], until: oldest, since, limit: PAGE }], {
          eoseTimeout: EOSE_TIMEOUT_MS,
          onevent: this.receive(url, page),
          oneose: () => {
            sub.close();
            done();
          },
          onclose: () => done(),
        });
      });
      if (seen.size === before) break;
      ({ count, oldest } = page);
    }
  }

  /** Queues every event the relay didn't return. */
  private resend(url: string) {
    const seen = this.seen.get(url)!;
    this.enqueue(
      url,
      this.known().filter((e) => !seen.has(e.id)),
    );
  }

  private enqueue(url: string, events: NostrEvent[]) {
    if (this.readOnly.has(url) || !events.length) return;
    const q = this.outbox.get(url) ?? [];
    const queued = new Set(q.map((e) => e.id));
    q.push(...events.filter((e) => !queued.has(e.id) && !this.seen.get(url)?.has(e.id)));
    this.outbox.set(url, q);
    this.drain(url);
  }

  /** Sends a relay its queued events one at a time, pausing when it asks us to slow down. */
  private drain(url: string) {
    const r = this.relays.get(url);
    const q = this.outbox.get(url);
    if (this.closed || !r?.connected || !q?.length || this.sending.has(url) || this.readOnly.has(url)) return;
    this.sending.add(url);
    const e = q[0];
    const next = (ms: number) => {
      this.sending.delete(url);
      this.later(() => this.drain(url), ms);
    };
    const done = () => {
      q.shift();
      this.tries.get(url)?.delete(e.id);
      next(SEND_GAP_MS);
    };
    r.publish(e).then(
      () => {
        this.holds(url, e.id);
        done();
      },
      (err: unknown) => {
        const why = String((err as Error)?.message ?? err);
        const tries = this.tries.get(url)?.get(e.id) ?? 0;
        if (REFUSED_FOR_GOOD.test(why)) {
          console.warn(`[game] ${url} refuses our events (${why}); reading from it only`);
          this.readOnly.add(url);
          this.outbox.delete(url);
          this.sending.delete(url);
          this.status();
        } else if (RATE_LIMITED.test(why)) {
          next(RATE_LIMIT_PAUSE_MS);
        } else if (TRANSIENT.test(why)) {
          if (tries === SEND_RETRY_MS.length) console.warn(`[game] ${url} still has not confirmed event ${e.id}; retrying once a minute`);
          // Back of the queue, after a pause: the events behind it go first.
          q.shift();
          this.tries.set(url, (this.tries.get(url) ?? new Map()).set(e.id, tries + 1));
          this.later(() => this.enqueue(url, [e]), SEND_RETRY_MS[tries] ?? SEND_SLOW_RETRY_MS);
          next(SEND_GAP_MS);
        } else {
          // The relay won't take this event (or keeps failing): skip it; the next sync tries again.
          done();
        }
      },
    );
  }
}
