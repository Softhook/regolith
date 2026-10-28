import { useEffect, useRef, useState } from 'react';
import { drawing, type GameState } from '@regolith/engine';
import { COARSE, reducedMotion } from '../../game/useMediaQuery';
import { useEffectEvent } from '../../game/useEffectEvent';
import { shotOf } from '../../game/strike';
import { castOf } from '../../game/cast';
import { cardEffectsOf } from './CardEffects';
import type { Controller } from '../../game/controller';
import type { ShipSpots } from './geometry';
import type { BoardZoom } from './useBoardZoom';

/** What goes over the map for its zoom (useBoardZoom): the buttons, the edge arrows and the start-of-game demo. */

/**
 * Zoom in and out, and back to the whole map. On touch screens (where you pinch) only the last, and only
 * while zoomed, so the buttons don't cover the corner space of the whole map.
 */
export function ZoomControls({ zoom }: { zoom: BoardZoom }) {
  return (
    <div className="zoom-controls">
      <button type="button" className="zoom-step" title="Zoom in" aria-label="Zoom in" onClick={() => zoom.zoomBy(1.5)}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        type="button"
        className="zoom-step"
        title="Zoom out"
        aria-label="Zoom out"
        disabled={!zoom.zoomed}
        onClick={() => zoom.zoomBy(1 / 1.5)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      {zoom.zoomed && (
        <button type="button" title="Whole map" aria-label="Whole map" onClick={zoom.fit}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** How long the "pinch to zoom" tip shows, from the start of the demo. */
const TIP_MS = 4200;

/**
 * At the start of every game (as a reminder), the first time `introduce` holds and zooming does something
 * here: zooms in on a glowing planet (or the middle of the map) and back out, under a tip saying how to
 * zoom. With reduced motion, only the tip. Returns the tip's text while it shows.
 */
export function useZoomIntro(game: GameState, ctl: Controller, zoom: BoardZoom, introduce: boolean): string | null {
  const [tip, setTip] = useState<string | null>(null);
  const done = useRef(false);
  if (game.phase !== 'setup') done.current = false; // ready for the next game's setup
  const start = useEffectEvent(() => {
    if (done.current || !introduce || !zoom.canZoom) return;
    done.current = true;
    const glowing = game.board.planets.find((p) => ctl.highlights.planets.has(p.id));
    const { rows, cols, at } = drawing(game.board);
    const spot = glowing ? at(glowing) : { r: (rows - 1) / 2, c: (cols - 1) / 2 };
    setTip(matchMedia(COARSE).matches ? 'Pinch to zoom the map' : 'Scroll or press + to zoom the map');
    if (!reducedMotion()) zoom.demo(spot.r, spot.c);
  });
  // `introduce` holds only during setup, and `done` is reset only outside it.
  useEffect(() => start(), [introduce, zoom.canZoom, start]);
  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => setTip(null), TIP_MS);
    return () => clearTimeout(t);
  }, [tip]);
  return tip;
}

/**
 * Zoomed in, a ship this screen doesn't play for (an opponent's, the AI's) that moves or arrives off screen
 * brings the map to it, so their moves aren't missed (their shots too: to the target). Your own moves never move the map; skipping ahead into a battle does.
 */
export function useFollowMoves(game: GameState, ctl: Controller, spots: ShipSpots, zoom: BoardZoom, scene?: string) {
  const seen = useRef<{ map: string; scene?: string; spots: ShipSpots; game: GameState } | null>(null);
  const follow = useEffectEvent(() => {
    const before = seen.current;
    const map = game.board.mapId;
    seen.current = { map, scene, spots, game };
    if (before?.map !== map) return;
    // A jump to another position (see Board's `scene`) moves no ship, but skipping ahead online
    // (`live:` to `live:`) into a battle brings the map to it, whoever fights it: catching up stops at
    // each result, so it is seen. Looking back (`review:`) leaves the map where the player put it.
    if (before.scene !== scene) {
      const head = game.pending[0];
      const skipped = before.scene?.startsWith('live:') && scene?.startsWith('live:');
      if (skipped && head?.kind === 'combat') {
        const at = drawing(game.board).at(head.at);
        zoom.reveal(at.r, at.c);
      }
      return;
    }
    let moved: { r: number; c: number } | undefined;
    for (const d of game.dice) {
      const now = spots.get(d.id);
      const was = before.spots.get(d.id);
      if (now && !ctl.mine(d.owner) && (!was || was.r !== now.r || was.c !== now.c)) moved = now;
    }
    // Spots are where ships are drawn; a shot's or card's target is a board space, drawn where `drawn` puts it.
    const { at: drawn } = drawing(game.board);
    const shot = shotOf(before.game, game);
    if (!moved && shot && !ctl.mine(shot.attacker.player)) moved = drawn(shot.at);
    // Another player's card striking the map (Show of Force's target, a relocated cube): its card beams there.
    const card = moved ? undefined : castOf(before.game, game);
    const target = card?.player !== undefined && !ctl.mine(card.player) ? cardEffectsOf(before.game, game)[0]?.at : undefined;
    if (target) moved = drawn(target);
    if (moved) zoom.reveal(Math.round(moved.r), Math.round(moved.c));
  });
  // Only a new game state can move a ship.
  useEffect(() => follow(), [game, follow]);
}

/**
 * Zoomed in, when the turn becomes one this screen plays (yours, or the next hot-seat player's), the map glides
 * to the most of that player's mechs one screen holds, at the same zoom (some in view, if not all). Looking back through a game (`review:`) leaves it alone.
 */
export function useFollowTurn(game: GameState, ctl: Controller, spots: ShipSpots, zoom: BoardZoom, scene?: string) {
  const last = useRef<{ map: string; turn: number } | null>(null);
  const follow = useEffectEvent(() => {
    const before = last.current;
    const key = { map: game.board.mapId, turn: game.turn.number };
    last.current = key;
    if (before?.map === key.map && before.turn === key.turn) return;
    if (game.phase !== 'play' || scene?.startsWith('review:') || !ctl.mine(game.turn.player)) return;
    const own = game.dice.flatMap((d) => (d.owner === game.turn.player ? (spots.get(d.id) ?? []) : []));
    if (!own.length) return;
    // The most mechs one screen holds, centred, so some are in view even when they're spread across the map.
    const halfR = zoom.h / zoom.cell / 2;
    const halfC = zoom.w / zoom.cell / 2;
    let best = [own[0]];
    for (const p of own) {
      const group = own.filter((q) => Math.abs(q.r - p.r) <= halfR && Math.abs(q.c - p.c) <= halfC);
      if (group.length > best.length) best = group;
    }
    const mid = (v: number[]) => (Math.min(...v) + Math.max(...v)) / 2;
    zoom.centreOn(mid(best.map((p) => p.r)), mid(best.map((p) => p.c)));
  });
  useEffect(() => follow(), [game.turn.number, game.turn.player, game.board.mapId, follow]);
}

type Side = 'left' | 'right' | 'top' | 'bottom';
const ARROWS: Record<Side, string> = { left: 'm15 6-6 6 6 6', right: 'm9 6 6 6-6 6', top: 'm6 15 6-6 6 6', bottom: 'm6 9 6 6 6-6' };

/**
 * Zoomed in: an arrow at each edge beyond which something is highlighted (a space, planet or ship you
 * can pick), with how many; a tap brings the nearest into view.
 */
export function OffscreenHints({ game, ctl, spots, zoom }: { game: GameState; ctl: Controller; spots: ShipSpots; zoom: BoardZoom }) {
  const { at } = drawing(game.board);
  const targets = [
    ...[...ctl.highlights.cells.values()].map((h) => at(h.cell)),
    ...game.board.planets.filter((p) => ctl.highlights.planets.has(p.id)).map(at),
    ...[...ctl.highlights.dice.keys()].flatMap((id) => spots.get(id) ?? []),
  ];
  // What's on screen, in spaces.
  const left = -zoom.x / zoom.cell,
    right = (zoom.w - zoom.x) / zoom.cell;
  const top = -zoom.y / zoom.cell,
    bottom = (zoom.h - zoom.y) / zoom.cell;
  const midR = (top + bottom) / 2,
    midC = (left + right) / 2;
  const beyond = new Map<Side, { r: number; c: number; d: number }[]>();
  for (const { r, c } of targets) {
    const over: [Side, number][] = [
      ['left', left - (c + 0.5)],
      ['right', c + 0.5 - right],
      ['top', top - (r + 0.5)],
      ['bottom', r + 0.5 - bottom],
    ];
    const [side, by] = over.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (by <= 0) continue;
    beyond.set(side, [...(beyond.get(side) ?? []), { r, c, d: Math.hypot(r + 0.5 - midR, c + 0.5 - midC) }]);
  }
  return [...beyond].map(([side, list]) => {
    const near = list.reduce((a, b) => (b.d < a.d ? b : a));
    return (
      <button
        key={side}
        type="button"
        className={`zoom-hint zoom-hint-${side}`}
        aria-label={`${list.length} more ${side === 'top' ? 'above' : side === 'bottom' ? 'below' : `to the ${side}`}`}
        onClick={() => zoom.centreOn(near.r, near.c)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={ARROWS[side]} />
        </svg>
        {list.length > 1 && <span>{list.length}</span>}
      </button>
    );
  });
}
