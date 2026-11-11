import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import {
  actor,
  cellAtPoint,
  cellOf,
  die,
  dieAt,
  drawing,
  key,
  moveOptions,
  perimeterSpaces,
  same,
  mechOf,
  type GameState,
} from '@regolith/engine';
import type { Controller } from '../game/controller';
import { BoardArt, tileArtOf } from './board/BoardArt';
import { ActionEffects } from './board/ActionEffects';
import { CardEffects } from './board/CardEffects';
import { CubeShadows, Cubes, cubeSpots, type CubeSpot } from './board/Cubes';
import { Explosions } from './board/Explosions';
import { Routes } from './board/Routes';
import { Shots } from './board/Shots';
import { Zones } from './board/Zones';
import { mechSpots, type MechSpots } from '../game/mechSpots';
import { useStaging, type Staging } from '../game/staging';
import { hexMapPath, placement, spotBox } from './board/geometry';
import { useBoardZoom } from './board/useBoardZoom';
import { OffscreenHints, ZoomControls, useFollowMoves, useFollowTurn, useZoomIntro } from './board/ZoomUi';
import { Die3D, DieShadow } from './Die3D';
import { pieceShadowOpacity } from './board/shadows';
import { REGOLITH_SHADOW, TILE } from '@regolith/art';
import { MECH } from '../beats';
import { objectiveNames } from '../art/boardTiles';
import { InfoPop, useAnchorName } from './InfoPop';

/** A mech or objective whose info is showing, after a tap that had nothing else to do. */
type Inspect = { mech: string } | { objective: number };
const inspectKey = (i: Inspect) => ('mech' in i ? `mech:${i.mech}` : `objective:${i.objective}`);

/**
 * The map: artwork underneath (SVG), then clickable layers for highlighted spaces, objectives and
 * mechs, then the effects of each move, explosions and the effects of cards. What is clickable comes from the controller's highlights; a tap on a mech
 * or objective that isn't shows its info instead. It fits its box, and zooms and pans (useBoardZoom).
 * `children` float over the map (positioned in percent of its size). `introduce` (the start of a game)
 * shows that it zooms. `scene` changes when the map jumps to another position instead of following a
 * move (looking back at the game, and back again): mechs glide to where they are then, but don't roll,
 * blow up or bring the map to them.
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
  const staging = useStaging(game, scene);
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
          <ActionEffects key={`fx:${scene}`} game={game} cell={cell} />
          <Explosions key={scene} game={game} cell={cell} />
          <CardEffects key={`cfx:${scene}`} game={game} cell={cell} />
          <Shots key={`shot:${scene}`} game={game} cell={cell} />
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

/** Your mechs: those of the seats this screen plays; sharing a screen, those of whoever's turn it is. */
const yoursOf = (game: GameState, ctl: Controller) => (owner: number) =>
  ctl.mine(owner) && (owner === game.turn.player || !ctl.mine(game.turn.player));

/**
 * The spaces another player's mech could move to with a plain move: its movement (with its owner's
 * skills). Every mech it could reach to attack
 * gets a ring, above the mechs. Only shown, not clickable.
 */
function Reach({ game, id, cell, spots }: { game: GameState; id: string; cell: number; spots: MechSpots }) {
  const d = game.dice.find((x) => x.id === id);
  if (d?.loc.zone !== 'board') return null;
  const { moves, attacks } = moveOptions(game, id);
  const threatened = [...attacks.keys()].flatMap((t) => (spots.get(t) ? [{ id: t, at: spots.get(t)! }] : []));
  const style = { '--pc': game.players[d.owner].color } as CSSProperties;
  const { box } = placement(game.board, cell);
  return (
    <>
      <div className="reach" style={style}>
        {[...moves.values()].map(({ cell: c }) => (
          <span key={key(c)} style={box(c)}>
            <span />
          </span>
        ))}
      </div>
      <div className="reach reach-attack" style={style}>
        {threatened.map(({ id: t, at }) => (
          <span key={t} style={spotBox(at, cell)}>
            <span />
          </span>
        ))}
      </div>
    </>
  );
}

/** How a mech flies its way (glideAlong): eased in a little and out, so it doesn't rush the first space. */
const PATH_EASING = 'cubic-bezier(.45,.1,.25,1)';

/**
 * Flies each mech in `paths` (staging) along its way, and its shadow and odds with it, in the time of a
 * straight glide (beats.ts): they're `.pathed`, without the glide.
 */
function glideAlong(board: HTMLElement | null, paths: Staging['paths']) {
  if (!board) return;
  const to = (p: { r: number; c: number }, offset: number) => ({ transform: `translate(${p.c * 100}%, ${p.r * 100}%)`, offset });
  for (const [id, way] of paths) {
    // A jump leaves the space before it and lands at once.
    const frames = way.flatMap((p, i) => (i && p.at === way[i - 1].at ? [to(way[i - 1], p.at), to(p, p.at)] : [to(p, p.at)]));
    for (const el of board.querySelectorAll<HTMLElement>(`[data-glide="${CSS.escape(id)}"]`))
      el.animate(frames, { duration: MECH.glide, easing: PATH_EASING });
  }
}

/** A mech's die, as a part of its space: the shadows it casts (MechShadows) are made for the same size. */
const DIE_SIZE = 0.56;

/** A piece on space (r, c), `cell` px: placed in percent of its own size (one space), so a zoom or resize doesn't count as a move and glide. */
const placeAt = (r: number, c: number, cell: number) => ({ transform: `translate(${c * 100}%, ${r * 100}%)`, width: cell, height: cell });

/**
 * On a world's ground, the hard shadows every mech's die (DieShadow) and cube (CubeShadows) casts, blurred `blur` px with a hint of
 * its colour: all in one layer under the dice and cubes, as a die's top stands as high as the die beside it, so is lit, and as dark
 * where they meet as apart. Each is placed, glides, comes and goes as its mech does (`staging`, Mechs). Cut to the map's tiles, so
 * none falls off its edge.
 */
function MechShadows({
  game,
  scene,
  staging,
  spots,
  cubes,
  cell,
  blur,
}: {
  game: GameState;
  scene?: string;
  staging: Staging;
  spots: MechSpots;
  cubes: CubeSpot[];
  cell: number;
  blur: number;
}) {
  const { world } = game.board;
  const size = cell * DIE_SIZE;
  const edge = hexMapPath(game.board, cell, tileArtOf(game.board));
  const struck = staging.struck.map(({ die: d, r, c, ms }) => (
    <div key={`struck:${d.id}`} className="mech-shadow struck" style={{ ...placeAt(r, c, cell), '--late': `${ms}ms` } as CSSProperties}>
      <DieShadow size={size} world={world} blur={blur} color={game.players[d.owner].color} />
    </div>
  ));
  const shadows = game.dice.map((d) => {
    const at = spots.get(d.id);
    if (!at) return null;
    const late = staging.late.get(d.id);
    return (
      <div
        key={d.id}
        className={['mech-shadow', late !== undefined && 'late', staging.paths.has(d.id) && 'pathed'].filter(Boolean).join(' ')}
        data-glide={d.id}
        style={{ ...placeAt(at.r, at.c, cell), '--late': `${late ?? 0}ms` } as CSSProperties}
      >
        <DieShadow size={size} world={world} blur={blur} color={game.players[d.owner].color} rolls={d.rolls} scene={scene} />
      </div>
    );
  });
  return (
    <div className="mech-shadows" style={{ opacity: pieceShadowOpacity(world), clipPath: edge && `path('${edge}')` }} aria-hidden>
      <CubeShadows cubes={cubes} world={world} mm={cell / TILE.cell} />
      {shadows}
      {struck}
    </div>
  );
}

/**
 * Every mech on the map, as a die; selected, highlighted, spent or in combat. `onPress`: a pointer went down on another player's mech.
 * `staging`: mechs a card brings appear as its effect gets there, and mechs it destroys stay until its blow lands.
 */
function Mechs({
  game,
  staging,
  ctl,
  zoomed,
  spots,
  cell,
  shadowless,
  onInfo,
  onPress,
  scene,
}: {
  game: GameState;
  scene?: string;
  staging: Staging;
  ctl: Controller;
  zoomed: boolean;
  spots: MechSpots;
  cell: number;
  /** The dice's shadows are drawn under them all (MechShadows), not each under its own. */
  shadowless: boolean;
  onInfo: (id: string) => void;
  onPress: (id: string, touch: boolean) => void;
}) {
  const head = game.pending[0];
  const combat = head?.kind === 'combat' ? head : null;
  const me = game.turn.player;
  const yours = yoursOf(game, ctl);
  const struck = staging.struck.map(({ die: d, r, c, ms }) => (
    <div
      key={`struck:${d.id}`}
      className="mech struck"
      style={
        {
          ...placeAt(r, c, cell),
          '--pc': game.players[d.owner].color,
          '--late': `${ms}ms`,
        } as CSSProperties
      }
      aria-hidden
    >
      <Die3D
        value={d.value}
        rolls={d.rolls}
        scene={scene}
        size={cell * DIE_SIZE}
        color={game.players[d.owner].color}
        shadowless={shadowless}
      />
    </div>
  ));
  const mechs = game.dice.map((d) => {
    const at = spots.get(d.id);
    if (!at) return null;
    const { r, c } = at;
    const tone = ctl.highlights.dice.get(d.id);
    const selected = 'die' in ctl.sel && ctl.sel.die === d.id;
    const mine = d.owner === me && game.phase === 'play' && !head;
    const spent = mine && (game.turn.moved[d.id] ?? 0) > 0;
    const abilityUsed = mine && game.turn.abilityUsed[d.id];
    const fighting = combat && (combat.attacker.die === d.id || combat.defender.die === d.id);
    // An attack target shows the chance to win on the map itself: no hover on a touch screen, and
    // a tap attacks. The cards behind it are in the title and the mech panel.
    const attack = ctl.attacks.get(d.id);
    const { ability, name } = mechOf(game, d.value);
    const who = `${game.players[d.owner].name} · ${name} (${d.value})`;
    const place = placeAt(r, c, cell);
    const late = staging.late.get(d.id);
    return (
      <Fragment key={d.id}>
        <div
          className={[
            'mech',
            selected && 'selected',
            tone && `mech-${tone}`,
            spent && 'spent',
            fighting && 'fighting',
            ctl.actionPhase && d.owner === me && 'own',
            yours(d.owner) && 'yours',
            late !== undefined && 'late',
            staging.paths.has(d.id) && 'pathed',
          ]
            .filter(Boolean)
            .join(' ')}
          data-r={cellOf(d)!.r}
          data-c={cellOf(d)!.c}
          data-glide={d.id}
          style={{ ...place, '--pc': game.players[d.owner].color, '--late': `${late ?? 0}ms` } as CSSProperties}
          onClick={() => ctl.onDie(d.id) === false && onInfo(d.id)}
          onPointerDown={yours(d.owner) ? undefined : (e) => onPress(d.id, e.pointerType !== 'mouse')}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={`${game.players[d.owner].name}'s ${name} (${d.value})${attack ? `, ${percent(attack.chance)} chance to win an attack` : ''}`}
          title={
            attack
              ? [
                  `Attack ${who}: ${percent(attack.chance)} to win`,
                  ...attack.factors.attacker.map((f) => `You: ${f}`),
                  ...attack.factors.defender.map((f) => `Them: ${f}`),
                ].join('\n')
              : `${who}\n${ability.name}: ${ability.text}`
          }
        >
          <div className="mech-ring" />
          <Die3D
            value={d.value}
            rolls={d.rolls}
            scene={scene}
            size={cell * DIE_SIZE}
            color={game.players[d.owner].color}
            shadowless={shadowless}
          />
          {abilityUsed && (
            <span className="mech-badge" aria-label="Ability used this turn">
              ✦
            </span>
          )}
        </div>
        {/* Over the mech, in a layer of its own, so no other mech's die covers it where it sticks out. */}
        {attack && (
          <div className={`mech-odds-spot${staging.paths.has(d.id) ? ' pathed' : ''}`} data-glide={d.id} style={place}>
            <OddsBadge chance={attack.chance} cell={cell} zoomed={zoomed} />
          </div>
        )}
      </Fragment>
    );
  });
  return [...mechs, ...struck];
}

/** The info bubble for a mech or objective, anchored to its space on the map. */
function BoardInfo({
  game,
  spots,
  what,
  cell,
  onClose,
}: {
  game: GameState;
  spots: MechSpots;
  what: Inspect;
  cell: number;
  onClose: () => void;
}) {
  const anchor = useAnchorName();
  const objective = 'objective' in what ? game.board.objectives.find((p) => p.id === what.objective) : undefined;
  const spot = 'mech' in what ? spots.get(what.mech) : objective && drawing(game.board).at(objective);
  if (!spot) return null; // the mech left the map
  return (
    <>
      <div className="info-anchor" style={{ ...spotBox(spot, cell), '--anchor': anchor } as CSSProperties} />
      <InfoPop anchor={anchor} onClose={onClose}>
        {'mech' in what ? <MechInfo game={game} id={what.mech} /> : <ObjectiveInfo game={game} id={what.objective} />}
      </InfoPop>
    </>
  );
}

/** What a mech is: whose, which, and its ability. */
function MechInfo({ game, id }: { game: GameState; id: string }) {
  const d = die(game, id);
  const { ability, name } = mechOf(game, d.value);
  const p = game.players[d.owner];
  return (
    <>
      <div className="info-title" style={{ '--pc': p.color } as CSSProperties}>
        <span className="info-swatch" /> {p.name}'s {name} <span className="muted">({d.value})</span>
      </div>
      <div>
        <b>{ability.name}:</b> {ability.text}
      </div>
      {d.owner === game.turn.player && game.turn.abilityUsed[d.id] && <div className="muted">✦ Ability used this turn.</div>}
    </>
  );
}

/** An objective's name and number, as the log shows it: "Thalassa Prime (9)". */
function objectiveLabel(game: GameState, id: number): string {
  const p = game.board.objectives.find((x) => x.id === id)!;
  const name = objectiveNames(game.board).get(id);
  return name ? `${name} (${p.number})` : `Objective ${p.number}`;
}

/** An objective's name, its free cube spaces, whose cubes are on it, and who its perimeter blocks (contested perimeter). */
function ObjectiveInfo({ game, id }: { game: GameState; id: number }) {
  const p = game.board.objectives.find((x) => x.id === id)!;
  const free = p.capacity - p.cubes.length;
  const homeOf = game.players.find((pl) => pl.home === id);
  const holders = [...new Set(perimeterSpaces(game.board, p).flatMap((c) => dieAt(game, c)?.owner ?? []))].map((o) => game.players[o].name);
  const blocked = 'claim it or drop to it';
  return (
    <>
      <div className="info-title">{objectiveLabel(game, id)}</div>
      <div>
        {free} of {p.capacity} cube space{p.capacity > 1 ? 's' : ''} free.
      </div>
      {holders.length > 0 && (
        <div>
          {holders.length === 1
            ? `Contested perimeter: while ${holders[0]}’s mechs are on the perimeter, only ${holders[0]} can ${blocked}.`
            : holders.length === 2
              ? `Contested perimeter: ${holders.join(' and ')} both have mechs on the perimeter, so neither can ${blocked}.`
              : `Contested perimeter: ${holders.join(', ')} all have mechs on the perimeter, so none of them can ${blocked}.`}
        </div>
      )}
      {holders.length > 0 && homeOf && <div>{`Home objective: ${homeOf.name} can always drop here.`}</div>}
      {p.cubes.map((owner, i) => (
        <div key={i} className="info-title" style={{ '--pc': game.players[owner].color } as CSSProperties}>
          <span className="info-swatch" /> {game.players[owner].name}'s cube
        </div>
      ))}
    </>
  );
}

/**
 * An attack target's chance to win, on its space's top-right corner, sticking out of it (above the
 * map's edge too). Zoomed in, the map is clipped to its area: where that would cut the badge off,
 * it moves inside, below or to the left.
 */
function OddsBadge({ chance, cell, zoomed }: { chance: number; cell: number; zoomed: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [flip, setFlip] = useState({ below: false, left: false });
  useEffect(() => {
    const badge = ref.current!;
    const mech = badge.parentElement!;
    // Not zoomed in, only the screen's edge can cut it off.
    const root = zoomed ? mech.closest('.stage') : null;
    // How far the badge sticks out of the space (see .mech-odds): the mech must be this far inside.
    const { width, height } = badge.getBoundingClientRect();
    const up = Math.ceil(height * 0.3);
    const right = Math.ceil(width * 0.3);
    const io = new IntersectionObserver(
      ([e]) => {
        const b = e.rootBounds;
        if (b) setFlip({ below: e.boundingClientRect.top < b.top, left: e.boundingClientRect.right > b.right });
      },
      { root, rootMargin: `-${up}px -${right}px 0px 0px`, threshold: 1 },
    );
    io.observe(mech);
    return () => io.disconnect();
  }, [cell, zoomed]);
  const tone = oddsTone(chance);
  return (
    <span ref={ref} className={['mech-odds', tone, flip.below && 'below', flip.left && 'left'].filter(Boolean).join(' ')} aria-hidden>
      {/* The % sign smaller: a narrower badge. */}
      {percent(chance).replace('%', '')}
      <small>%</small>
    </span>
  );
}

/** Green when the attack is likely to win, red when likely to lose, gold in between (see .mech-odds). */
function oddsTone(chance: number): string {
  return chance >= 0.6 ? 'good' : chance <= 0.4 ? 'bad' : '';
}

/** A chance as a whole percentage; never 0% or 100% unless it is certain. */
function percent(p: number): string {
  const n = Math.round(p * 100);
  return p > 0 && n === 0 ? '<1%' : p < 1 && n === 100 ? '>99%' : `${n}%`;
}
