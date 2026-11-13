import { useEffect, useRef, useState } from 'react';
import { drawing, type Cell, type GameState, type LogEntry, type PlayerId } from '@regolith/engine';
import { castOf } from '../game/cast';
import { reducedMotion } from '../game/useMediaQuery';
import { lastLogId } from '../game/steps';
import { mapHits, useSaid } from '../game/aim';

/**
 * A card played in a step casts as it comes up, a moment later: if it comes up later than this (another
 * card was showing), its effects are over and it doesn't.
 */
const MOUNT_MS = 300;

/** Which way a card that has hit the map steps aside: away from what it hit, on screen. */
export type Aside = 'left' | 'right';

/**
 * The side of the stage away from `cells` as they are on screen now (the map may be panned or zoomed);
 * none, if the step changes nothing on the map.
 */
function asideFrom(game: GameState, cells: Cell[]): Aside | undefined {
  if (!cells.length) return undefined;
  const board = document.querySelector('.board')?.getBoundingClientRect();
  const stage = document.querySelector('.stage')?.getBoundingClientRect();
  if (!board?.width || !stage) return 'right';
  const { cols, at } = drawing(game.board);
  const x = cells.reduce((sum, c) => sum + board.left + ((at(c).c + 0.5) * board.width) / cols, 0) / cells.length;
  return x < stage.left + stage.width / 2 ? 'right' : 'left';
}

/**
 * The shown card casting its effects: the card flashes as they play, and steps aside if they are on the map:
 * before, if its player says where it lands (an AI, see aim.ts), else as they play. A card casts:
 * - in a step that is its doing (cast.ts) while it is up: a Tactic's target chosen;
 * - as it comes up, for a step it was played or used in, if it comes up at once (not queued behind another);
 * - as it comes up, for a skill firing by itself (Exploit…).
 * `shown`: the entry of the card on screen. Returns a key that changes at each cast (for the flash), and,
 * once it has cast at the map, the side it steps aside to, out of the way of what it hit (see PlayedCard).
 */
export function useCardCasts(game: GameState, mine: (p: PlayerId) => boolean, shown: LogEntry | undefined, jumps?: number) {
  // The card that last cast, how many times, and where it stepped aside to (the first cast at the map decides).
  const [casts, setCasts] = useState<{ id: number; n: number; aside?: Aside }>();
  const prev = useRef(game);
  const jumped = useRef(jumps);
  // A step whose card is about to come up: cast once it has.
  const waiting = useRef<{ id: number; hits: Cell[]; game: GameState; at: number }>();
  const current = useRef(shown);
  current.current = shown;
  const now = useRef(game);
  now.current = game;

  const cast = (e: LogEntry, after: GameState, hits: Cell[]) => {
    const aside = asideFrom(after, hits);
    setCasts((c) => (c?.id === e.id ? { id: e.id, n: c.n + 1, aside: c.aside ?? aside } : { id: e.id, n: 1, aside }));
  };

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
    if (current.current?.id === e.id) cast(e, game, mapHits(before, game));
    else if (e.id > lastLogId(before)) waiting.current = { id: e.id, hits: mapHits(before, game), game, at: performance.now() };
  }, [game, mine, jumps]);

  const shownId = shown?.id;
  useEffect(() => {
    const e = current.current;
    if (!e || e.id !== shownId || e.player === undefined || reducedMotion()) return;
    const w = waiting.current;
    if (e.gains) cast(e, w?.game ?? prev.current, []);
    else if (w?.id === e.id && performance.now() - w.at < MOUNT_MS) cast(e, w.game, w.hits);
    if (w?.id === e.id) waiting.current = undefined;
  }, [shownId]);

  // Where it was said to land: it steps aside then, before it does.
  const said = useSaid();
  // What was said before this mounted is old news (see PlayedCard).
  const before = useRef(said);
  const aim = said?.kind === 'aim' && said !== before.current ? said : undefined;
  const [aimed, setAimed] = useState<{ id: number; aside?: Aside }>();
  useEffect(() => {
    if (aim && aim.id === shownId && aimed?.id !== aim.id) setAimed({ id: aim.id, aside: asideFrom(now.current, aim.cells) });
  }, [aim, shownId, aimed]);

  const ofShown = casts && casts.id === shownId ? casts : undefined;
  return { flash: ofShown?.n ?? 0, aside: (aimed && aimed.id === shownId ? aimed.aside : undefined) ?? ofShown?.aside };
}
