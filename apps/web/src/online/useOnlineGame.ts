import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getPublicKey } from 'nostr-tools/pure';
import { actor, apply, legalActions, RuleError, say, type Action, type GameState, type PlayerId } from '@regolith/engine';
import { actBody, CHAINED, encodePost, type AskMode, type Body, type Post, type Replay, type Step } from '@regolith/online';
import { aiLevelOf, combatResponse, think } from '../game/aiClient';
import { useErrorToast, useToasts } from '../game/toasts';
import type { GameView } from '../game/view';
import { battleStage, inBattle, nextStep, resumeAt, seenPost } from './playback';
import { onlineGames } from './games';
import { identity, keepStorage, openGameLog, rememberGame, saveEvents } from './storage';
import { RelayLink, type RelayStatus } from './relays';
import { ownMove, summary, yourMoveSince } from './summary';
import { alertYourMove, attending } from './alerts';

/**
 * The browser that made the last move also moves the AI players. If it went away, the other
 * players' browsers take over one after another, this long apart (so they don't all post rival
 * moves at once); spectators come last.
 */
const AI_TAKEOVER_MS = 15000;

export interface OnlineGame {
  /** Why the game can't be opened at all (not "not found yet"), if so. */
  failure: string | null;
  /** The game so far; null until its first post has been found (locally or on a relay). */
  replay: Replay | null;
  relays: RelayStatus;
  /** The seats this browser plays. */
  mySeats: PlayerId[];
  view: GameView | null;
  /** Whether the screen shows the current position (false while catching up on others' moves). */
  live: boolean;
  claim(seat: PlayerId, name: string): void;
  setAsk(ask: AskMode): void;
}

/** A post to make, or a function that decides it from the game as it is when it goes out. */
type PostRequest = Body | ((r: Replay) => Body | null);

/** One online game: its posts, kept locally and synced through the relays, and the game they make. */
export function useOnlineGame(secret: string): OnlineGame {
  const { me, replay, relays, failure, post } = usePostLog(secret);
  const mySeats = useMemo(() => replay?.seats.filter((s) => s.owner === me).map((s) => s.id) ?? [], [replay, me]);
  const head = replay?.steps.at(-1)!.state ?? null;
  // Where the player left off last time, so the screen carries on from there.
  const resume = useMemo(() => onlineGames().find((g) => g.secret === secret)?.seen ?? null, [secret]);
  const { shown, live, toasts, ownBattle, dismissBattle, jumps } = usePlayback(replay, me, resume);
  const { error, showError } = useErrorToast();
  useAiSeats(replay, me, post, showError);
  useYourMoveAlert(secret, replay, me, mySeats, live);

  useEffect(() => {
    if (replay) rememberGame({ secret, ...summary(replay, mySeats) });
  }, [replay, mySeats, secret]);
  useEffect(() => {
    const i = shown && replay ? replay.steps.indexOf(shown) : -1;
    if (i >= 0) rememberGame({ secret, seen: seenPost(replay!.steps, i) ?? undefined });
  }, [replay, shown, secret]);

  const dispatch = useCallback(
    (a: Action): boolean => {
      if (!head || !live) return false;
      const fail = (text: string) => {
        showError(text);
        return false;
      };
      const seat = a.type === 'missile' ? a.by : actor(head);
      if (!mySeats.includes(seat)) return fail('Not your move');
      try {
        apply(head, a);
      } catch (e) {
        if (e instanceof RuleError) return fail(say(head, e.message));
        console.error('[game] apply threw', { action: a, error: e, state: JSON.stringify(head) });
        return fail(`Engine error: ${(e as Error).message}`);
      }
      // Checked again against the game as it is when the post goes out: a second click before
      // the screen caught up would otherwise follow the first move and be refused everywhere.
      post((r) => actBody(r, seat, a));
      return true;
    },
    [head, live, mySeats, post, showError],
  );

  const positions = useMemo(() => replay?.steps.map((s) => s.state) ?? [], [replay]);
  const view = useMemo((): GameView | null => {
    if (!replay || !shown) return null;
    const c = live ? replay.combat : null;
    const mustAnswer = c ? c.waitingOn.filter((s) => mySeats.includes(s) && !c.passed.includes(s)) : [];
    const undoSeat = replay.undoSeat;
    return {
      game: shown.state,
      dispatch,
      // Nothing is this screen's to play while it catches up.
      mine: (p) => live && mySeats.includes(p),
      undo: live && undoSeat !== null && mySeats.includes(undoSeat) ? () => post({ t: 'undo', seat: undoSeat }) : undefined,
      positions,
      jumps,
      toasts,
      error,
      // While catching up, a battle waits for nobody: it is being replayed.
      combat: battleStage(shown.state)
        ? {
            responders: c ? mySeats.filter((s) => !c.passed.includes(s)) : [],
            mustAnswer: mustAnswer.length > 0,
            waitingOn: c ? c.waitingOn.filter((s) => !c.passed.includes(s) && !mySeats.includes(s)) : [],
            pass: () => {
              // Having answered, the player has seen the battle: no need to dismiss it as well.
              dismissBattle();
              mustAnswer.forEach((seat) => post({ t: 'pass', seat, stage: c!.stage }));
            },
            // Only the player's own battles wait for them; others' move on after a pause.
            dismiss: ownBattle ? dismissBattle : undefined,
          }
        : undefined,
    };
  }, [replay, shown, live, mySeats, dispatch, post, positions, jumps, toasts, error, ownBattle, dismissBattle]);

  // Dev-only hook for browser tests: window.__gameOnline.{state(), view(), legal(), mySeats()}.
  const latest = useRef({ head, view, mySeats });
  latest.current = { head, view, mySeats };
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__gameOnline = {
      state: () => latest.current.head,
      view: () => latest.current.view,
      mySeats: () => latest.current.mySeats,
      legal: () => (latest.current.head ? legalActions(latest.current.head) : []),
    };
  }, []);

  return {
    failure,
    replay,
    relays,
    mySeats,
    view,
    live,
    claim: (seat, name) => {
      keepStorage();
      post({ t: 'claim', seat, name });
    },
    setAsk: (ask) => mySeats.forEach((seat) => post({ t: 'ask', seat, ask })),
  };
}

/**
 * The game's events: loaded from this browser, synced with the relays, saved back, and replayed.
 * `replay` is a new object whenever the game changes. `post` signs a post, adds it to the game at
 * once and sends it to the relays.
 */
function usePostLog(secret: string) {
  const sk = useMemo(identity, []);
  const me = useMemo(() => getPublicKey(sk), [sk]);
  // Together, so a new game (`secret`) never shares a timeline with the last one.
  const { keys, timeline, events, receive, load } = useMemo(() => openGameLog(secret), [secret]);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [relays, setRelays] = useState<RelayStatus>({ connected: 0, total: 0, unsent: 0 });
  const [failure, setFailure] = useState<string | null>(null);
  const link = useRef<RelayLink | null>(null);

  // The timeline changes in place; React gets a fresh copy, batched (a relay can send hundreds of
  // events in a burst). A timer, not an animation frame: those never fire in a background tab,
  // which would stop it from following the game and moving the AI.
  const batch = useRef<number | undefined>(undefined);
  const publish = useCallback(() => {
    if (batch.current !== undefined) return;
    batch.current = window.setTimeout(() => {
      batch.current = undefined;
      const r = timeline.replay();
      setReplay(r && { ...r, seats: r.seats.map((s) => ({ ...s })), steps: [...r.steps] });
      if (timeline.unreadable())
        setFailure('it was made with a different version of the app. Reload this page, and ask whoever made it to reload theirs.');
    }, 16);
  }, [timeline]);
  useEffect(() => () => window.clearTimeout(batch.current), []);

  // When a relay last sent everything it held: saved with the events, so the lobby can ask for only
  // what's newer. It starts as the loaded one, which holds for the loaded events and so for any set
  // they grow into, whatever other tabs save meanwhile.
  const syncedAt = useRef<number | undefined>(undefined);
  const save = useThrottled(() => saveEvents(keys.tag, [...events.values()], syncedAt.current), 400, keys.tag);

  useEffect(() => {
    let l: RelayLink | null = null;
    try {
      // Here rather than while rendering: each saved event is decrypted, and damaged ones end up below.
      syncedAt.current = load();
      publish();
      l = new RelayLink(
        keys.tag,
        () => [...events.values()],
        (e) => receive(e) && (save(), publish()),
        setRelays,
        (at) => {
          syncedAt.current = Math.max(syncedAt.current ?? 0, at);
          save();
        },
      );
      l.start();
      link.current = l;
    } catch (e) {
      console.error('[game] could not open the online game', e);
      setFailure(e instanceof Error ? e.message : String(e));
    }
    return () => {
      l?.close();
      link.current = null;
    };
  }, [keys, events, receive, load, publish, save]);

  const post = useCallback(
    (req: PostRequest) => {
      const r = timeline.replay();
      if (!r) return;
      const body = typeof req === 'function' ? req(r) : req;
      if (!body) return;
      const { event, post: p } = encodePost(keys, sk, body, CHAINED.has(body.t) ? r.tip : null);
      events.set(event.id, event);
      timeline.add(p);
      save();
      publish();
      link.current?.publish(event);
    },
    [keys, sk, timeline, events, save, publish],
  );

  return { me, replay, relays, failure, post };
}

/** Whether seat `p` is a human player on this browser (`me`). */
const humanSeat = (replay: Replay, me: string) => (p: PlayerId) => replay.seats[p]?.owner === me && !replay.seats[p].ai;

/**
 * What the screen shows: the current position, or, while catching up on moves made by others,
 * each one in turn (see `nextStep`), from post `resume` (where the player left off) when the game
 * opens. Toasts announce what each shown step changed.
 */
function usePlayback(replay: Replay | null, me: string, resume: string | null) {
  const { toasts, announce } = useToasts();
  const [shown, setShown] = useState<Step | null>(null);
  const shownAt = useRef(0);
  // How many times the screen has skipped ahead over moves rather than playing them out (GameView.jumps).
  const [jumps, setJumps] = useState(0);
  // The battle stage the player has dismissed: playback moves on from that battle once it ends.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const dismissBattle = useCallback(() => setDismissed(shown && battleStage(shown.state)), [shown]);
  const human = (p: PlayerId) => !!replay && humanSeat(replay, me)(p);
  // Once it is the player's turn, battles from earlier turns no longer wait for them: they move on
  // like anyone else's, so the player can get on with their turn.
  const head = replay?.steps.at(-1)!.state;
  const myTurn = !!head && head.phase !== 'over' && !replay!.combat && human(actor(head));
  const earlier = !!shown && !!head && shown.state.turn.number < head.turn.number;
  // Whether one of this browser's (human) seats attacks or defends in the battle on screen, and it waits for them.
  const ownBattle = !!shown && inBattle(shown.state, human) && !(myTurn && earlier);
  // Playback waits while the page is hidden, so a player who comes back sees what happened while
  // they were away; the step on screen then gets its full time again.
  const visible = useVisible(() => (shownAt.current = performance.now()));

  // A layout effect, so a step shown at once (this browser's own move) replaces the previous one
  // before the screen is painted: no frame where the game looks like it's catching up.
  useLayoutEffect(() => {
    if (!replay || !visible) return;
    if (!shown) {
      const i = resumeAt(replay.steps, resume);
      if (i >= 0) {
        shownAt.current = performance.now();
        return setShown(replay.steps[i]);
      }
    }
    const own = (p: Post) => ownMove(replay, me, p);
    const battle = { mine: ownBattle, dismissed: !!shown && dismissed === battleStage(shown.state) };
    const next = nextStep(replay.steps, shown, own, performance.now() - shownAt.current, battle);
    if (!next) return;
    const show = () => {
      if (next.announce && shown) announce(shown.state, next.step.state, humanSeat(replay, me));
      if (next.jump) setJumps((n) => n + 1);
      shownAt.current = performance.now();
      setShown(next.step);
    };
    if (next.delay === 0) return show();
    const t = window.setTimeout(show, next.delay);
    return () => window.clearTimeout(t);
  }, [replay, shown, me, announce, dismissed, ownBattle, visible, resume]);

  return { shown, live: !!shown && shown === replay?.steps.at(-1), toasts, ownBattle, dismissBattle, jumps };
}

/**
 * Moves the AI seats: the browser that made the last move does; any other takes over once the
 * game has waited `AI_TAKEOVER_MS` for it. `onError` is told when the AI fails (it then plays a
 * stand-in move, see aiClient).
 */
function useAiSeats(replay: Replay | null, me: string, post: (req: PostRequest) => void, onError: (text: string) => void) {
  const working = useRef('');
  const [recheck, setRecheck] = useState(0);

  useEffect(() => {
    const head = replay?.steps.at(-1)!.state;
    if (!replay || !head || head.phase === 'over') return;
    const work = aiWork(replay, head);
    if (!work) return;
    // Every browser ranks the others the same way, so they take over in turn.
    const others = [...new Set(replay.seats.flatMap((s) => (s.owner && s.owner !== replay.tipAuthor ? [s.owner] : [])))].sort();
    const turn = AI_TAKEOVER_MS * (1 + (others.includes(me) ? others.indexOf(me) : others.length));
    // Capped, so a poster whose clock runs ahead can't hold the game up for longer.
    const wait = replay.tipAuthor === me ? 0 : Math.min(turn, turn - (Date.now() - replay.tipAt));
    if (wait > 0) {
      const t = window.setTimeout(() => setRecheck((n) => n + 1), wait + 50);
      return () => window.clearTimeout(t);
    }
    const stage = replay.combat?.stage ?? '';
    const job = `${replay.tip}|${stage}|${work.seat}`;
    if (working.current === job) return;
    working.current = job;
    // A move worked out for a position that has moved on since is dropped.
    const current = (r: Replay) => r.tip === replay.tip && (r.combat?.stage ?? '') === stage;
    const level = aiLevelOf(head.players[work.seat]);
    if (work.combat) {
      const { action: a, error } = combatResponse(head, work.seat, level);
      if (error) onError(error);
      post((r) => (!current(r) ? null : a ? actBody(r, work.seat, a) : { t: 'pass', seat: work.seat, stage }));
    } else {
      void think(head, level).then(({ action: a, error }) => {
        if (error) onError(error);
        if (a) post((r) => (current(r) ? actBody(r, work.seat, a) : null));
      });
    }
  }, [replay, me, post, recheck, onError]);
}

/** The AI seat that has something to do now, if any. */
function aiWork(r: Replay, s: GameState): { seat: PlayerId; combat: boolean } | null {
  if (r.combat) {
    const seat = r.combat.waitingOn.find((id) => r.seats[id].ai && !r.combat!.passed.includes(id));
    return seat === undefined ? null : { seat, combat: true };
  }
  const who = actor(s);
  return r.seats[who].ai ? { seat: who, combat: false } : null;
}

/**
 * Alerts the player when it becomes their move (see `alertYourMove`). Looking at the game, only once
 * the screen has caught up to it; not looking, at once (the screen waits for them anyway).
 */
function useYourMoveAlert(secret: string, replay: Replay | null, me: string, mySeats: PlayerId[], live: boolean) {
  const was = useRef<boolean | null>(null);
  // The turn change not yet alerted, while it is still the player's move.
  const due = useRef<string | null>(null);
  useEffect(() => {
    if (!replay) return;
    const { myTurn, turn } = yourMoveSince(replay, mySeats, me, was.current);
    was.current = myTurn;
    if (!myTurn) due.current = null;
    else if (turn) due.current = turn;
    if (!due.current || (!live && attending())) return;
    alertYourMove({ secret, turn: due.current, where: 'game', battle: !!replay.combat });
    due.current = null;
  }, [secret, replay, me, mySeats, live]);
}

/** Whether the page is visible; `onShow` runs as it becomes visible again, before the re-render. */
function useVisible(onShow: () => void) {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const latest = useRef(onShow);
  latest.current = onShow;
  useEffect(() => {
    const change = () => {
      const now = document.visibilityState === 'visible';
      if (now) latest.current();
      setVisible(now);
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  return visible;
}

/** `fn` at most once per `ms`; anything still waiting runs when the page or the game (`key`) closes. */
function useThrottled(fn: () => void, ms: number, key?: string) {
  const latest = useRef(fn);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const flush = () => {
      if (timer.current === undefined) return;
      window.clearTimeout(timer.current);
      timer.current = undefined;
      latest.current();
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [key]);
  useEffect(() => {
    latest.current = fn;
  });
  return useCallback(() => {
    if (timer.current !== undefined) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      latest.current();
    }, ms);
  }, [ms]);
}
