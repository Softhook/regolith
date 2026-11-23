import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { actor, cellAtPoint, die, drawing, key, same, type GameState } from '@regolith/engine';
import { REGOLITH_SHADOW, TILE } from '@regolith/art';
import type { Controller } from '../game/controller';
import { mechSpots } from '../game/mechSpots';
import { NO_STAGING, useStep } from '../game/staging';
import { ActionEffects } from './board/ActionEffects';
import { BoardArt } from './board/BoardArt';
import { BoardInfo, inspectKey, objectiveLabel, type Inspect } from './board/BoardInfo';
import { CardEffects } from './board/CardEffects';
import { Cubes, cubeSpots } from './board/Cubes';
import { Explosions } from './board/Explosions';
import { placement } from './board/geometry';
import { DIE_SIZE, glideAlong, MechShadows, Mechs, oddsTone, percent, yoursOf } from './board/Mechs';
import { Reach } from './board/Reach';
import { Routes } from './board/Routes';
import { Shots } from './board/Shots';
import { useBoardZoom } from './board/useBoardZoom';
import { OffscreenHints, ZoomControls, useFollowMoves, useFollowTurn, useZoomIntro } from './board/ZoomUi';
import { Zones } from './board/Zones';

/**
 * The map: artwork underneath (SVG), then clickable layers for highlighted spaces, objectives and mechs, then the
 * effects of each move, explosions and the effects of cards. What is clickable comes from the controller's
 * highlights; a tap on a mech or objective that isn't shows its info instead. It fits its box, and zooms and pans
 * (useBoardZoom). `children` float over the map (positioned in percent of its size). `introduce` (the start of a
 * game) shows that it zooms. `scene` changes when the map jumps to another position instead of following a move
 * (looking back at the game, and back again): mechs glide to where they are then, but don't roll, blow up or bring
 * the map to them.
 */
export function Board({
  game,
  ctl,
  introduce,
  scene,
  children,
}: {
  game: GameState;
  ctl: Controller;
  introduce?: boolean;
  scene?: string;
  children?: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const { objectives } = game.board;
  const { rows, cols } = drawing(game.board);
  const zoom = useBoardZoom(wrap, boardRef, rows, cols);
  const { cell } = zoom;
  const { box } = placement(game.board, cell);
  // On the ground the dice cast hard shadows, as its buildings do: blurred as much, in pixels.
  const cast = REGOLITH_SHADOW.blur * (cell / TILE.cell);
  const spots = mechSpots(game);
  const cubes = cubeSpots(game, cell);
  const step = useStep(game, scene);
  const staging = step?.staging ?? NO_STAGING;
  useLayoutEffect(() => glideAlong(boardRef.current, staging.paths), [staging]);
  const tip = useZoomIntro(game, ctl, zoom, !!introduce);
  useFollowMoves(game, ctl, spots, zoom, scene);
  useFollowTurn(game, ctl, spots, zoom, scene);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  if (inspect && 'mech' in inspect && !spots.has(inspect.mech)) setInspect(null);
  // The info closes itself on a tap elsewhere; a tap on the same thing again closes it too.
  const show = (what: Inspect) => setInspect((cur) => (cur && inspectKey(cur) === inspectKey(what) ? null : what));
  // Another player's mech shows how far it can move: while a finger is on it, or while a mouse click's info is open.
  const [held, setHeld] = useState<string | null>(null);
  const viaMouse = useRef(false);
  useEffect(() => {
    if (!held) return;
    const off = () => setHeld(null);
    window.addEventListener('pointerup', off);
    window.addEventListener('pointercancel', off);
    return () => {
      window.removeEventListener('pointerup', off);
      window.removeEventListener('pointercancel', off);
    };
  }, [held]);
  const reachOf =
    held ?? (inspect && 'mech' in inspect && viaMouse.current && !yoursOf(game, ctl)(die(game, inspect.mech).owner) ? inspect.mech : null);

  // A click on empty board (no highlight there) still reaches the controller, to clear a selection.
  const onBoardClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = cellAtPoint(game.board, (e.clientY - rect.top) / cell, (e.clientX - rect.left) / cell);
    if (p) ctl.onCell(p);
  };

  return (
    <div className={`board-wrap ${zoom.zoomed ? 'zoomed' : ''}`} ref={wrap}>
      <div
        ref={boardRef}
        className="board"
        style={{ left: zoom.x, top: zoom.y, width: cols * cell, height: rows * cell, '--cell': `${cell}px` } as CSSProperties}
      >
        <BoardArt game={game} cell={cell} />

        {/* The player acting: their colour marks the spaces they can pick and the ways their mechs would fly. */}
        <div className="board-layer" style={{ '--pc': game.players[actor(game)].color } as CSSProperties} onClick={onBoardClick}>
          {ctl.highlights.zones.length > 0 && <Zones board={game.board} cells={ctl.highlights.zones} cell={cell} />}
          {[...ctl.highlights.cells.values()].map(({ cell: c, tone }) => {
            const route = ctl.routes.find((r) => same(r.from, c));
            const odds = route?.odds;
            return (
              <button
                key={key(c)}
                className={`hl hl-${tone}${route?.cells.length ? ' routed' : ''}`}
                data-r={c.r}
                data-c={c.c}
                style={box(c)}
                onClick={() => ctl.onCell(c)}
                aria-label={`${tone} ${c.r},${c.c}${odds === undefined ? '' : `, ${percent(odds)} chance to win`}`}
              >
                <span />
                {odds !== undefined && <b className={`hl-odds ${oddsTone(odds)}`}>{percent(odds)}</b>}
              </button>
            );
          })}

          <Routes
            board={game.board}
            routes={ctl.routes}
            cell={cell}
            color={ctl.sel.kind === 'attackFrom' ? game.players[die(game, ctl.sel.die).owner].color : ''}
            onPick={ctl.onCell}
          />

          {objectives.map((p) => {
            const hl = ctl.highlights.objectives.get(p.id);
            const free = p.capacity - p.cubes.length;
            return (
              <button
                key={p.id}
                className={`objective-hit ${hl ? `objective-${hl.tone}` : ''}`}
                data-r={p.r}
                data-c={p.c}
                style={box(p)}
                onClick={() => ctl.onObjective(p.id) === false && show({ objective: p.id })}
                title={`${objectiveLabel(game, p.id)} · ${free} of ${p.capacity} cube location${p.capacity > 1 ? 's' : ''} free`}
              />
            );
          })}

          {reachOf && <Reach game={game} id={reachOf} cell={cell} spots={spots} />}

          <MechShadows game={game} scene={scene} staging={staging} spots={spots} cubes={cubes} cell={cell} blur={cast} />
          <Cubes
            game={game}
            cubes={cubes}
            cell={cell}
            dice={game.dice.flatMap((d) => {
              const at = spots.get(d.id);
              if (!at || staging.late.has(d.id)) return [];
              const size = cell * DIE_SIZE;
              return [{ x: (at.c + 0.5) * cell - size / 2, y: (at.r + 0.5) * cell - size / 2, size, color: game.players[d.owner].color }];
            })}
          />
          {/* Mouse users also get `title=` on mechs and objectives; touch screens get the tap. */}
          <Mechs
            game={game}
            scene={scene}
            staging={staging}
            ctl={ctl}
            zoomed={zoom.zoomed}
            spots={spots}
            cell={cell}
            shadowless
            onInfo={(id) => show({ mech: id })}
            onPress={(id, touch) => {
              viaMouse.current = !touch;
              if (touch) setHeld(id);
            }}
            onReveal={zoom.reveal}
          />
          {/* An objective's label, over the mechs in its perimeter. */}
          {objectives.map((p) => {
            const hl = ctl.highlights.objectives.get(p.id);
            return (
              hl && (
                <span key={p.id} className={`objective-tag ${hl.tone}`} style={box(p)}>
                  <span className="objective-label">{hl.label}</span>
                </span>
              )
            );
          })}
          {/* One step for them all (useStep); remounted for a jump to another position (`key`), so none is left showing. */}
          <ActionEffects key={`fx:${scene}`} step={step} board={game.board} cell={cell} />
          <Explosions key={scene} step={step} cell={cell} />
          <CardEffects key={`cfx:${scene}`} step={step} board={game.board} cell={cell} />
          <Shots key={`shot:${scene}`} step={step} board={game.board} cell={cell} />
          {inspect && (
            <BoardInfo key={inspectKey(inspect)} game={game} spots={spots} what={inspect} cell={cell} onClose={() => setInspect(null)} />
          )}
        </div>
        {children}
      </div>
      {zoom.canZoom && <ZoomControls zoom={zoom} />}
      {zoom.zoomed && <OffscreenHints game={game} ctl={ctl} spots={spots} zoom={zoom} />}
      {tip && (
        <div className="zoom-tip" role="status">
          {tip}
        </div>
      )}
    </div>
  );
}
