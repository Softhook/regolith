import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { drawing, effectOf, same, type Cell, type GameState, type LogEntry, type PlayerId } from '@regolith/engine';
import { castOf, landing } from '../game/cast';
import { reducedMotion } from '../game/useMediaQuery';
import { lastLogId, useTransient } from '../game/useTransient';
import { cardEffectsOf } from './board/CardEffects';
import { panelEffectsOf } from './panelEffects';

/** Where a beam ends on screen, `size` across; `edge`: the spot is out of view, and this is the view's edge nearest it. */
interface Point {
  x: number;
  y: number;
  size: number;
  edge?: boolean;
}

/**
 * A spot a card marks, looked up afresh at each frame of its beam: the map may pan meanwhile (to the
 * target, see useFollowMoves), and a phone's sheet may move. `map`: on the map, which the card may cover
 * (so it fades back after casting).
 */
interface Target {
  id: string;
  locate: () => Point | undefined;
  map?: boolean;
}

/** A beam from the card's box `from` to a target, in a player's colour. */
interface Beam {
  key: string;
  from: DOMRect;
  target: Target;
  color: string;
}

/** Over by the time the effects it casts are. */
const BEAM_MS = 900;
/** A Tactic that lands everywhere (Sabotage on every opponent) needs no more beams than this. */
const MAX_BEAMS = 6;
/**
 * A card played in a step casts as it comes up, a moment later: if it comes up later than this (another
 * card was showing), its effects are over and it doesn't.
 */
const MOUNT_MS = 300;
/** How far inside the view's edge a beam to a spot out of view ends. */
const EDGE_INSET = 10;

const onScreen = (r: DOMRect) => r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
const middle = (r: DOMRect, size = Math.min(r.width, r.height, 48)): Point => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, size });

/** The point of `view` nearest (`x`, `y`), a little inside its edge. */
const clampTo = (view: DOMRect, x: number, y: number, size: number): Point => ({
  x: Math.min(Math.max(x, view.left + EDGE_INSET), view.right - EDGE_INSET),
  y: Math.min(Math.max(y, view.top + EDGE_INSET), view.bottom - EDGE_INSET),
  size: size / 2,
  edge: true,
});

/** A space of the map: where it is now, or, out of view (zoomed in), the edge of the view towards it. */
function cellTarget(game: GameState, c: Cell): Target {
  return {
    id: `cell:${c.r},${c.c}`,
    map: true,
    locate: () => {
      const board = document.querySelector('.board')?.getBoundingClientRect();
      const view = document.querySelector('.board-wrap')?.getBoundingClientRect();
      if (!board || !view || !board.width) return undefined;
      const { cols, at } = drawing(game.board);
      const size = board.width / cols;
      const x = board.left + (at(c).c + 0.5) * size;
      const y = board.top + (at(c).r + 0.5) * size;
      const inside = x > view.left && x < view.right && y > view.top && y < view.bottom;
      return inside ? { x, y, size } : clampTo(view, x, y, size);
    },
  };
}

/**
 * An element of the panels: where it is, or, under a phone's closed sheet, the top of the sheet's peek
 * (the panels are in the sheet).
 */
function elementTarget(id: string, find: () => Element | null | undefined, size?: number): Target {
  return {
    id,
    locate: () => {
      const r = find()?.getBoundingClientRect();
      if (r && onScreen(r)) return middle(r, size);
      const peek = document.querySelector('.sheet')?.getBoundingClientRect();
      return peek && onScreen(peek) ? { x: peek.left + peek.width / 2, y: peek.top + EDGE_INSET, size: 24, edge: true } : undefined;
    },
  };
}

const row = (player: number) => document.querySelector(`.player[data-player="${player}"]`);

/** A spot of a player's panel (`data-fx`, see PlayerList), or their whole row. */
const panelTarget = (player: number, spot?: string) =>
  elementTarget(
    `panel:${player}:${spot ?? ''}`,
    () => (spot && row(player)?.querySelector(`[data-fx="${CSS.escape(spot)}"]`)) || row(player),
    spot ? undefined : 40,
  );

/** Actions gained: the turn panel's actions, while the player is the one to act; else their row. */
const actionsTarget = (game: GameState, player: number) =>
  game.turn.player === player
    ? elementTarget(`actions:${player}`, () => document.querySelector('.turn-panel [data-fx="actions"]') ?? row(player))
    : panelTarget(player);

/** What a skill firing by itself gave (its `gains`): its tracks, its actions. */
function gainTargets(game: GameState, e: LogEntry): Target[] {
  const { research, dominance, actions } = e.gains ?? {};
  const p = e.player!;
  return [research && panelTarget(p, 'research'), dominance && panelTarget(p, 'dominance'), actions && actionsTarget(game, p)].filter(
    (t): t is Target => !!t,
  );
}

/**
 * What the step from `before` to `game` marks: the spaces of its map effects (CardEffects) and new Warp
 * Gates, and the spots of its panel effects, less what skills firing by themselves in it gave (they cast
 * for themselves). With none, the card's player's row (Momentum's extra turn), unless the card is yet to
 * land (Show of Force before its target is chosen) or has just finished landing (unveilDone).
 */
function stepTargets(before: GameState, game: GameState, player: number): Target[] {
  const last = lastLogId(before);
  const cells = cardEffectsOf(before, game).flatMap((e) => (e.to ? [e.at, e.to] : [e.at]));
  cells.push(...game.gates.filter((g) => !before.gates.some((x) => same(x, g))));
  const out = cells.map((c) => cellTarget(game, c));
  // What the step's skill bonuses account for, by player and track.
  const claimed = new Map<string, number>();
  for (const e of game.log)
    if (e.id > last && e.gains)
      for (const [k, n] of Object.entries(e.gains)) claimed.set(`${e.player}:${k}`, (claimed.get(`${e.player}:${k}`) ?? 0) + (n ?? 0));
  for (const e of panelEffectsOf(before, game)) {
    // Another player's research changing when the turn moves on is their start-of-turn gain (Brilliant, Void), not the card's.
    if (e.spot === 'research' && e.player !== player) continue;
    // A gain the bonuses fully account for isn't the card's (Plundering's research after Show of Force).
    if ('from' in e && e.to > e.from && e.to - e.from <= (claimed.get(`${e.player}:${e.spot}`) ?? 0)) continue;
    out.push(panelTarget(e.player, e.spot === 'skills' ? undefined : e.spot));
  }
  // Sabotage played at the end of a turn: the next player's penalty is already taken from their new turn's actions.
  if (
    game.turn.number !== before.turn.number &&
    game.turn.player !== player &&
    game.log.some((e) => e.id > last && e.card && ['sabotage', 'sabotage-double'].includes(effectOf(e.card)))
  ) {
    out.push(actionsTarget(game, game.turn.player));
  }
  if (!out.length && !landing(before) && !landing(game)) out.push(panelTarget(player));
  return out;
}

/**
 * Beams from the card's box to each target that can be found, one per place: a beam's two ends are often
 * one space, and every panel under a phone's closed sheet ends at its edge.
 */
function aim(from: DOMRect, targets: Target[], color: string, key: string): Beam[] {
  const placed: { target: Target; at: Point }[] = [];
  for (const target of targets) {
    const at = target.locate();
    if (at && !placed.some((p) => p.target.id === target.id || Math.hypot(p.at.x - at.x, p.at.y - at.y) < 4)) placed.push({ target, at });
  }
  return placed.slice(0, MAX_BEAMS).map(({ target }, i) => ({ key: `${key}:${i}`, from, target, color }));
}

/**
 * One beam: from where the line to its target leaves the card (not across the art) to the target, followed
 * at every frame while it lasts. A target gone from the screen hides it.
 */
function CastBeam({ beam }: { beam: Beam }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const { from, target } = beam;
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    const end = performance.now() + BEAM_MS;
    let frame = 0;
    const place = () => {
      const el = ref.current;
      const p = target.locate();
      if (el) {
        const dx = p ? p.x - cx : 0;
        const dy = p ? p.y - cy : 0;
        const t = Math.min(from.width / 2 / Math.abs(dx || 1e-9), from.height / 2 / Math.abs(dy || 1e-9), 1);
        const len = Math.hypot(dx * (1 - t), dy * (1 - t));
        el.hidden = !p || len < 8;
        el.classList.toggle('edge', !!p?.edge);
        el.style.left = `${cx + dx * t}px`;
        el.style.top = `${cy + dy * t}px`;
        el.style.setProperty('--len', `${len}px`);
        el.style.setProperty('--angle', `${Math.atan2(dy, dx)}rad`);
        el.style.setProperty('--size', `${p?.size ?? 0}px`);
      }
      if (performance.now() < end) frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [beam]);
  return (
    <div ref={ref} className="cast-beam" aria-hidden style={{ '--pc': beam.color } as CSSProperties}>
      <span className="cast-line" />
      <span className="cast-head" />
      <span className="cast-hit" />
    </div>
  );
}

/**
 * The shown card casting its effects: the card flashes and a beam reaches from it to each spot it changes,
 * as the effect there plays. A card casts:
 * - in a step that is its doing (cast.ts) while it is up: a Tactic's target chosen;
 * - as it comes up, for a step it was played or used in, if it comes up at once (not queued behind another);
 * - as it comes up, for a skill firing by itself (Plundering…), at what its log entry says it gave.
 * `shown`: the entry of the card on screen; `art`: its box. Returns the beams (portalled), a key that changes
 * at each cast (for the flash), and whether the card has cast at the map (and so fades back, see CSS).
 */
export function useCardCasts(
  game: GameState,
  mine: (p: PlayerId) => boolean,
  shown: LogEntry | undefined,
  art: RefObject<HTMLElement | null>,
  jumps?: number,
) {
  const [beams, show] = useTransient<Beam>(BEAM_MS);
  // The card that last cast, how many times, and whether at the map.
  const [casts, setCasts] = useState<{ id: number; n: number; map: boolean }>();
  const prev = useRef(game);
  const jumped = useRef(jumps);
  // A step whose card is about to come up: cast once it has.
  const waiting = useRef<{ id: number; before: GameState; game: GameState; at: number }>();
  const current = useRef(shown);
  current.current = shown;
  const now = useRef(game);
  now.current = game;

  const cast = (e: LogEntry, targets: Target[], key: string) => {
    const box = art.current?.getBoundingClientRect();
    if (!box) return;
    const aimed = aim(box, targets, game.players[e.player!].color, key);
    const map = aimed.some((b) => b.target.map);
    setCasts((c) => (c?.id === e.id ? { id: e.id, n: c.n + 1, map: c.map || map } : { id: e.id, n: 1, map }));
    show(aimed);
  };
  const castRef = useRef(cast);
  castRef.current = cast;

  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    if (jumped.current !== jumps) {
      jumped.current = jumps;
      return;
    }
    if (lastLogId(game) <= lastLogId(before) || reducedMotion()) return;
    const e = castOf(before, game);
    if (!e || e.player === undefined || e.gains || mine(e.player)) return;
    if (current.current?.id === e.id) castRef.current(e, stepTargets(before, game, e.player), `${lastLogId(game)}`);
    else if (e.id > lastLogId(before)) waiting.current = { id: e.id, before, game, at: performance.now() };
  }, [game, mine, jumps]);

  const shownId = shown?.id;
  useEffect(() => {
    const e = current.current;
    if (!e || e.id !== shownId || e.player === undefined || reducedMotion()) return;
    const w = waiting.current;
    if (e.gains) castRef.current(e, gainTargets(now.current, e), `gain${e.id}`);
    else if (w?.id === e.id && performance.now() - w.at < MOUNT_MS) castRef.current(e, stepTargets(w.before, w.game, e.player), `${e.id}`);
    if (w?.id === e.id) waiting.current = undefined;
  }, [shownId]);

  const portal =
    beams.length > 0 &&
    createPortal(
      beams.map((b) => <CastBeam key={b.key} beam={b} />),
      document.body,
    );
  const ofShown = casts && casts.id === shownId ? casts : undefined;
  return { beams: portal, flash: ofShown?.n ?? 0, spent: !!ofShown?.map };
}
