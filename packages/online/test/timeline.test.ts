import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { actor, apply, checkInvariants, legalActions, defaultMap, type Action, type GameState, type PlayerId } from '@regolith/engine';
import { chooseAction, chooseCombatResponse } from '@regolith/ai';
import {
  actBody,
  decodeEvent,
  encodePost,
  gameKeys,
  hex,
  newSecret,
  PROTOCOL,
  stateHash,
  Timeline,
  type Body,
  type Post,
  type Replay,
} from '../src';
import { seededRandom } from '../../engine/test/helpers';

import { create, post, seat } from './helpers';

const head = (r: Replay): GameState => r.steps.at(-1)!.state;

/**
 * One player's browser: its own timeline, the seats it plays, and an AI that picks its moves.
 * `driveAi` makes it also move the AI seats (any browser may).
 */
class Browser {
  timeline = new Timeline();
  sent: Post[] = [];
  private random: () => number;
  constructor(
    public key: string,
    public seats: PlayerId[],
    public driveAi: boolean,
    seed: number,
    private undoRate = 0,
  ) {
    this.random = seededRandom(seed);
  }

  send(body: Body, chained: boolean): Post {
    const r = this.timeline.replay();
    const p = post(this.key, body, chained ? r!.tip : null);
    this.timeline.add(p);
    this.sent.push(p);
    return p;
  }

  /** Makes this browser's next post, if it has one to make. */
  step(): Post | null {
    const r = this.timeline.replay();
    if (!r) return null;
    const s = head(r);
    if (s.phase === 'over') return null;
    const plays = (id: PlayerId) => this.seats.includes(id) || (this.driveAi && r.seats[id].ai);
    if (r.combat) {
      for (const id of r.combat.waitingOn) {
        if (!plays(id) || r.combat.passed.includes(id)) continue;
        const a = chooseCombatResponse(s, id, { level: 1, random: this.random });
        return this.send(a ? actBody(r, id, a)! : { t: 'pass', seat: id, stage: r.combat.stage }, !!a);
      }
      return null;
    }
    if (r.undoSeat !== null && this.seats.includes(r.undoSeat) && this.random() < this.undoRate)
      return this.send({ t: 'undo', seat: r.undoSeat }, true);
    const who = actor(s);
    if (!plays(who)) return null;
    const a = chooseAction(s, { level: 1, random: this.random, samples: 1 });
    return a ? this.send(actBody(r, who, a)!, true) : null;
  }
}

/** Plays a game between browsers over a network that delays, drops (until resent) and reorders posts. */
function playOnline(browsers: Browser[], seed: number, maxTicks = 20000) {
  const random = seededRandom(seed);
  const inFlight: { to: Browser; post: Post }[] = [];
  for (let tick = 0; tick < maxTicks; tick++) {
    for (const b of browsers) {
      const p = b.step();
      if (p) for (const o of browsers) if (o !== b) inFlight.push({ to: o, post: p });
    }
    // Deliver about half of what is in flight, in random order.
    for (let i = inFlight.length - 1; i >= 0; i--) {
      if (random() < 0.5) continue;
      const j = Math.floor(random() * (i + 1));
      const [m] = inFlight.splice(j, 1);
      m.to.timeline.add(m.post);
    }
    const done = browsers.every((b) => head(b.timeline.replay()!).phase === 'over');
    if (done && !inFlight.length) return tick;
  }
  throw new Error('game did not finish');
}

describe('online timeline', () => {
  it('says when the game was made by another version (a mode this one does not have)', () => {
    const t = new Timeline();
    expect(t.unreadable()).toBe(false);
    const g = create('alice', [seat('Alice'), seat('Bob')], [1]);
    if (g.body.t !== 'create') throw new Error('expected create post');
    t.add({ ...g, body: { ...g.body, config: { ...g.body.config, mode: 'prototyping' as never } } });
    expect(t.replay()).toBeNull();
    expect(t.unreadable()).toBe(true);
  });

  it('two browsers and an AI play a whole game and end with the same game', { timeout: 60000 }, () => {
    const a = new Browser('alice', [0], true, 1, 0.3);
    const b = new Browser('bob', [1], false, 2, 0.3);
    a.timeline.add(create('alice', [seat('Alice'), seat('Open'), seat('Nova', true)], [1], 7, 'regolith'));
    for (const p of a.timeline.all()) b.timeline.add(p);
    b.send({ t: 'claim', seat: 1, name: '  Bob the very long name  ' }, false);
    a.timeline.add(b.sent[0]);
    a.send({ t: 'ask', seat: 0, ask: 'never' }, true);
    b.timeline.add(a.sent[0]);

    playOnline([a, b], 3);
    const ra = a.timeline.replay()!;
    const rb = b.timeline.replay()!;
    expect(head(rb)).toEqual(head(ra));
    expect(rb.steps.length).toBe(ra.steps.length);
    expect(ra.seats.map((s) => s.name)).toEqual(['Alice', 'Bob the very l', 'Nova']);
    expect(ra.seats[0].ask).toBe('never');
    expect(checkInvariants(head(ra))).toEqual([]);
    // Every move carried the hash of its position, and both browsers got the same ones.
    expect(ra.desync).toBeNull();
    expect(rb.desync).toBeNull();
    // A fresh browser that only receives the posts (in any order) computes the same game.
    const c = new Timeline();
    for (const p of [...a.timeline.all()].reverse()) c.add(p);
    expect(head(c.replay()!)).toEqual(head(ra));
  });

  it('two browsers both moving the AI agree on one game', { timeout: 60000 }, () => {
    const a = new Browser('alice', [0], true, 11);
    const b = new Browser('bob', [], true, 12);
    a.timeline.add(create('alice', [seat('Alice'), seat('Nova', true)], [], 3));
    for (const p of a.timeline.all()) b.timeline.add(p);
    playOnline([a, b], 5);
    expect(head(b.timeline.replay()!)).toEqual(head(a.timeline.replay()!));
    // Both browsers moved the AI at the same time somewhere; only one of each pair counts.
    expect(a.timeline.size).toBeGreaterThan(a.timeline.replay()!.steps.length);
  });

  it('only the owner of a seat may move it', () => {
    const t = new Timeline();
    const g = create('alice', [seat('Alice'), seat('Open')], [1]);
    t.add(g);
    const roll: Action = { type: 'setupKeep' };
    expect(actor(head(t.replay()!))).toBe(0);
    t.add(post('mallory', { t: 'act', seat: 0, action: roll }, g.id));
    expect(t.replay()!.steps).toHaveLength(1);
    t.add(post('alice', { t: 'act', seat: 0, action: roll }, g.id));
    expect(t.replay()!.steps).toHaveLength(2);
    // Seat 1 is open: nobody may move it until it is claimed, then only its claimant.
    const tip = t.replay()!.tip;
    t.add(post('bob', { t: 'act', seat: 1, action: roll }, tip));
    expect(t.replay()!.steps).toHaveLength(2);
    t.add(post('bob', { t: 'claim', seat: 1, name: 'Bob' }));
    expect(t.replay()!.steps).toHaveLength(3);
    expect(head(t.replay()!).players[1].name).toBe('Bob');
  });

  it('the earliest claim of a seat nobody has played wins, even when it arrives last', () => {
    const t = new Timeline();
    t.add(create('alice', [seat('Alice'), seat('Open')], [1]));
    const late = post('carol', { t: 'claim', seat: 1, name: 'Carol' });
    const early = post('bob', { t: 'claim', seat: 1, name: 'Bob' }, null, late.at - 5);
    t.add(late);
    expect(t.replay()!.seats[1].owner).toBe('carol');
    t.add(early);
    expect(t.replay()!.seats[1].owner).toBe('bob');
    expect(head(t.replay()!).players[1].name).toBe('Bob');
  });

  describe('a seat someone has played is theirs', () => {
    /** Alice rolls; Carol claims seat 1 and rolls too. Bob's claim of seat 1 is older, but comes in late. */
    function contest() {
      const g = create('alice', [seat('Alice'), seat('Open')], [1]);
      const roll: Action = { type: 'setupKeep' };
      const alice = post('alice', { t: 'act', seat: 0, action: roll }, g.id);
      const carolClaim = post('carol', { t: 'claim', seat: 1, name: 'Carol' });
      const carol = post('carol', { t: 'act', seat: 1, action: roll }, alice.id);
      const bobClaim = post('bob', { t: 'claim', seat: 1, name: 'Bob' }, null, carolClaim.at - 5);
      return { g, roll, alice, carol, posts: [alice, carolClaim, carol, bobClaim] };
    }
    /** Every order the posts may arrive in, after the create post. */
    const orders = (xs: Post[]): Post[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));

    it('a late claim can’t take it, however the posts arrive', () => {
      const { g, alice, carol, posts } = contest();
      for (const order of orders(posts)) {
        const t = new Timeline();
        t.add(g);
        for (const p of order) t.add(p);
        const r = t.replay()!;
        expect(r.seats[1].owner).toBe('carol');
        expect(head(r).players[1].name).toBe('Carol');
        expect(r.steps.map((s) => s.post?.id)).toEqual([undefined, alice.id, carol.id]);
      }
    });

    it('when both claimants have played it, the earliest claim wins', () => {
      const { g, roll, alice, posts } = contest();
      const bob = post('bob', { t: 'act', seat: 1, action: roll }, alice.id);
      const t = new Timeline();
      for (const p of [g, ...posts, bob]) t.add(p);
      expect(t.replay()!.seats[1].owner).toBe('bob');
      expect(t.replay()!.steps.map((s) => s.post?.id)).toEqual([undefined, alice.id, bob.id]);
    });
  });

  it('of two rival moves, the earlier wins even when it arrives later', () => {
    const t = new Timeline();
    const g = create('alice', [seat('Alice'), seat('Nova', true)], []);
    t.add(g);
    const late = post('alice', { t: 'act', seat: 0, action: { type: 'setupReroll' } }, g.id);
    const early = post('alice', { t: 'act', seat: 0, action: { type: 'setupKeep' } }, g.id, late.at - 1);
    const s1 = apply(head(t.replay()!), late.body.t === 'act' ? late.body.action : { type: 'endTurn' });
    const after = post('alice', { t: 'act', seat: actor(s1), action: legalActions(s1)[0] }, late.id);
    t.add(late);
    t.add(after);
    expect(t.replay()!.tip).toBe(after.id);
    t.add(early);
    expect(t.replay()!.tip).toBe(early.id);
    expect(t.replay()!.steps.map((s) => s.post?.id)).toEqual([undefined, early.id]);
  });

  it('a battle setting changed at the same moment as a move never displaces the move', () => {
    const t = new Timeline();
    const g = create('alice', [seat('Alice'), seat('Open')], [1]);
    t.add(g);
    t.add(post('bob', { t: 'claim', seat: 1, name: 'Bob' }));
    const move = post('alice', { t: 'act', seat: 0, action: { type: 'setupKeep' } }, g.id);
    t.add(move);
    t.add(post('bob', { t: 'ask', seat: 1, ask: 'never' }, g.id, move.at - 1));
    expect(t.replay()!.tip).toBe(move.id);
    expect(t.replay()!.steps).toHaveLength(2);
  });

  it('a missile and a pass racing for one battle give the same game in either order', () => {
    // Two browsers both moving an AI seat in a battle it is losing: one fires its missile, the other
    // passes. Whichever arrives first, every browser must end up with the same game.
    const t = new Timeline();
    const all: Post[] = [create('alice', [seat('Alice'), seat('Nova', true), seat('Orion', true)], [], 1, 'regolith')];
    for (const p of all) t.add(p);
    const add = (p: Post) => (t.add(p), all.push(p));
    const random = seededRandom(1);
    for (let n = 0; n < 3000; n++) {
      const r = t.replay()!;
      const s = head(r);
      expect(s.phase).not.toBe('over');
      const c = r.combat;
      const missile = c ? legalActions(s).find((a) => a.type === 'missile' && r.seats[a.by].ai && c.waitingOn.includes(a.by)) : undefined;
      if (missile?.type === 'missile') {
        const fire = post('alice', actBody(r, missile.by, missile)!, r.tip);
        const passes = c!.waitingOn.map((w) => post('bob', { t: 'pass', seat: w, stage: c!.stage }));
        const browser = (order: Post[]) => {
          const b = new Timeline();
          for (const p of all) b.add(p);
          b.replay();
          for (const p of order) b.add(p);
          return b.replay()!;
        };
        const missileFirst = browser([fire, ...passes]);
        const passesFirst = browser([...passes, fire]);
        // Every seat the battle waited for passed, so it was decided there: the missile came too late.
        expect(missileFirst.steps.length).toBe(passesFirst.steps.length);
        expect(head(missileFirst)).toEqual(head(passesFirst));
        expect(head(passesFirst).players[missile.by].missiles).toBe(s.players[missile.by].missiles);
        expect(missileFirst.desync).toBeNull();
        return;
      }
      if (c) {
        for (const w of c.waitingOn) add(post('alice', { t: 'pass', seat: w, stage: c.stage }));
        continue;
      }
      const who = actor(s);
      add(post('alice', actBody(r, who, chooseAction(s, { level: 1, random, samples: 1 })!)!, r.tip));
    }
    throw new Error('no battle in which an AI could fire');
  });

  it('notices a browser that disagrees about the game', () => {
    const g = create('alice', [seat('Alice'), seat('Open')], [1]);
    const claim = post('bob', { t: 'claim', seat: 1, name: 'Bob' });
    const fresh = () => {
      const t = new Timeline();
      t.add(g);
      t.add(claim);
      return t;
    };
    const s0 = head(fresh().replay()!);
    const keep: Action = { type: 'setupKeep' };

    // Alice's browser took a move this one refuses (here: one the engine doesn't know).
    const t1 = fresh();
    t1.add(post('alice', { t: 'act', seat: 0, action: { type: 'warpDrive' } as unknown as Action }, g.id));
    expect(t1.replay()!.steps).toHaveLength(1);
    expect(t1.replay()!.desync).toEqual({ seat: 0, author: 'alice', why: 'rejected' });
    // Once Alice's browser plays a move this one agrees on (she reloaded), the warning goes.
    t1.add(post('alice', { t: 'act', seat: 0, action: keep, h: stateHash(apply(s0, keep)) }, g.id));
    expect(t1.replay()!.steps).toHaveLength(2);
    expect(t1.replay()!.desync).toBeNull();

    // Alice's browser got a different position from the move: it still counts, but is flagged.
    const t2 = fresh();
    t2.add(post('alice', { t: 'act', seat: 0, action: keep, h: 'deadbeef' }, g.id));
    expect(t2.replay()!.steps).toHaveLength(2);
    expect(t2.replay()!.desync?.why).toBe('differs');

    // The same move with the right hash, or none (older browsers), is fine.
    const t3 = fresh();
    t3.add(post('alice', { t: 'act', seat: 0, action: keep, h: stateHash(apply(s0, keep)) }, g.id));
    expect(t3.replay()!.desync).toBeNull();
    // A browser that hasn't got Bob's claim yet (so calls him "Open") still agrees on the position.
    const early = new Timeline();
    early.add(g);
    const h = actBody(early.replay()!, 0, keep)!;
    const t5 = fresh();
    t5.add(post('alice', h, g.id));
    expect(t5.replay()!.desync).toBeNull();
    const t4 = fresh();
    t4.add(post('mallory', { t: 'act', seat: 0, action: { type: 'warpDrive' } as unknown as Action }, g.id));
    expect(t4.replay()!.desync).toBeNull();
  });

  it('builds a move for the game as it is now, or none if it no longer fits', () => {
    const t = new Timeline();
    const g = create('alice', [seat('Alice'), seat('Bob')], [1]);
    t.add(g);
    const keep: Action = { type: 'setupKeep' };
    const body = actBody(t.replay()!, 0, keep)!;
    expect(body).toMatchObject({ t: 'act', seat: 0, action: keep, h: stateHash(apply(head(t.replay()!), keep)) });
    t.add(post('alice', body, g.id));
    // A second click on the same button, sent after the first went out: not Alice's move any more.
    expect(actBody(t.replay()!, 0, keep)).toBeNull();
    expect(actBody(t.replay()!, 1, { type: 'warpDrive' } as unknown as Action)).toBeNull();
  });

  it('rejects malformed posts and actions', () => {
    const t = new Timeline();
    const g = create('alice', [seat('Alice'), seat('Nova', true)], []);
    t.add(g);
    for (const action of [{ type: 'constructor' }, { type: 'toString' }, { type: 'move', die: 5 }, { type: 'resolveCombat' }]) {
      t.add(post('alice', { t: 'act', seat: 0, action: action as Action }, g.id));
    }
    t.add(post('alice', { t: 'ask', seat: 0, ask: 'sometimes' as never }, g.id));
    t.add({ id: 'x', author: 'alice', at: 1, prev: null, body: { t: 'act', seat: 0, action: { type: 'setupKeep' } } });
    t.add({ id: 'y', author: 'alice', at: NaN, prev: g.id, body: { t: 'act', seat: 0, action: { type: 'setupKeep' } } });
    expect(t.replay()!.steps).toHaveLength(1);
    expect(t.replay()!.tip).toBe(g.id);
  });

  it('reads the old "all battles" setting as "my battles", keeping the moves after it', () => {
    const t = new Timeline();
    const g = create('alice', [seat('Alice'), seat('Nova', true)], []);
    t.add(g);
    const ask = post('alice', { t: 'ask', seat: 0, ask: 'always' as never }, g.id);
    t.add(ask);
    const s = head(t.replay()!);
    t.add(post('alice', actBody(t.replay()!, actor(s), legalActions(s)[0])!, ask.id));
    expect(t.replay()!.seats[0].ask).toBe('own');
    expect(t.replay()!.steps).toHaveLength(2);
  });

  it('ignores a create post for another protocol or with seats nobody can play', () => {
    const t = new Timeline();
    t.add(
      post('alice', {
        t: 'create',
        protocol: PROTOCOL + 1,
        config: { players: [seat('A'), seat('B')], mapId: defaultMap(2)!.id, mode: 'basic', seed: 1 },
        creator: 0,
        open: [1],
      }),
    );
    t.add(create('alice', [seat('A'), seat('B')], []));
    t.add(create('alice', [seat('A'), seat('B'), seat('C')], [1, 1]));
    expect(t.replay()).toBeNull();
  });
});

describe('codec', () => {
  it('round-trips a post and rejects other games and tampering', () => {
    const keys = gameKeys(newSecret());
    const other = gameKeys(newSecret());
    const sk = generateSecretKey();
    const body: Body = { t: 'claim', seat: 1, name: 'Bob' };
    const { event, post: p } = encodePost(keys, sk, body, null, 1234);
    expect(p.author).toBe(getPublicKey(sk));
    expect(event.content).not.toContain('Bob');
    expect(decodeEvent(keys, event)).toEqual(p);
    expect(decodeEvent(other, event)).toBeNull();
    // As received from a relay: plain JSON (nostr-tools caches a successful check on the object).
    const wire = () => JSON.parse(JSON.stringify(event)) as typeof event;
    // Change one character mid-ciphertext, always to a different one. (Overwriting the tail with a fixed
    // string was a no-op 1 time in 256: the last base64 character of this content holds only 2 bits.)
    const i = event.content.length >> 1;
    const tampered = event.content.slice(0, i) + (event.content[i] === 'A' ? 'B' : 'A') + event.content.slice(i + 1);
    expect(decodeEvent(keys, { ...wire(), content: tampered })).toBeNull();
    expect(decodeEvent(keys, { ...wire(), pubkey: getPublicKey(generateSecretKey()) })).toBeNull();
  });

  it('derives the same tag and key as ever (games in progress depend on it)', () => {
    const keys = gameKeys('gq_wKfjFrFzGQCE2WHmazg');
    expect(keys.tag).toBe('f0521fea6bf6fb50689d9a83896e3712');
    expect(hex(keys.key)).toBe('d8f8ea43095be6112d8c8890257f37486c60fc83870e0b6bd6b32b32d3f537f6');
  });
});
