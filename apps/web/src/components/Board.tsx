import { Fragment, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { cellAtPoint, die, dieAt, drawing, key, moveOptions, orbitals, rulesOf, same, say, shipOf, type GameState } from '@regolith/engine';
import type { Controller } from '../game/controller';
import { BoardArt, tileArtOf } from './board/BoardArt';
import { ActionEffects } from './board/ActionEffects';
import { CardEffects } from './board/CardEffects';
import { Explosions } from './board/Explosions';
import { Routes } from './board/Routes';
import { Shots } from './board/Shots';
import { Zones } from './board/Zones';
import { hexMapPath, placement, shipSpots, spotBox, type ShipSpots } from './board/geometry';
import { useStaging, type Staging } from './board/staging';
import { useBoardZoom } from './board/useBoardZoom';
import { OffscreenHints, ZoomControls, useFollowMoves, useZoomIntro } from './board/ZoomUi';
import { Die3D, DieShadow } from './Die3D';
import { PIECE_SHADOW_OPACITY } from './board/shadows';
import { REGOLITH_SHADOW, TILE } from '@regolith/art';
import { useOnGround } from '../art/mapLook';
import { planetNames } from '../art/boardTiles';
import { InfoPop, useAnchorName } from './InfoPop';

/** A ship or planet whose info is showing, after a tap that had nothing else to do. */
type Inspect = { ship: string } | { planet: number };
const inspectKey = (i: Inspect) => ('ship' in i ? `ship:${i.ship}` : `planet:${i.planet}`);

/**
 * The map: artwork underneath (SVG), then clickable layers for highlighted spaces, planets and
 * ships, then the effects of each move, explosions and the effects of cards. What is clickable comes from the controller's highlights; a tap on a ship
 * or planet that isn't shows its info instead. It fits its box, and zooms and pans (useBoardZoom).
 * `children` float over the map (positioned in percent of its size). `introduce` (the start of a game)
 * shows that it zooms. `scene` changes when the map jumps to another position instead of following a
 * move (looking back at the game, and back again): ships glide to where they are then, but don't roll,
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
  const { planets } = game.board;
  const { rows, cols } = drawing(game.board);
  const zoom = useBoardZoom(wrap, boardRef, rows, cols);
  const { cell } = zoom;
  const { box } = placement(game.board, cell);
  // On a world's ground the dice cast hard shadows, as its buildings do: blurred as much, in pixels.
  const cast = useOnGround(game.board) ? REGOLITH_SHADOW.blur * (cell / TILE.cell) : undefined;
  const spots = shipSpots(game);
  const staging = useStaging(game, scene);
  const tip = useZoomIntro(game, ctl, zoom, !!introduce);
  useFollowMoves(game, ctl, spots, zoom, scene);
  const [inspect, setInspect] = useState<Inspect | null>(null);
  if (inspect && 'ship' in inspect && !spots.has(inspect.ship)) setInspect(null);
  // The info closes itself on a tap elsewhere; a tap on the same thing again closes it too.
  const show = (what: Inspect) => setInspect((cur) => (cur && inspectKey(cur) === inspectKey(what) ? null : what));
  // Another player's ship shows how far it can move: while a finger is on it, or while a mouse click's info is open.
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
    held ?? (inspect && 'ship' in inspect && viaMouse.current && !yoursOf(game, ctl)(die(game, inspect.ship).owner) ? inspect.ship : null);

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
        className={`board${game.board.hex ? ' hex' : ''}`}
        style={{ left: zoom.x, top: zoom.y, width: cols * cell, height: rows * cell, '--cell': `${cell}px` } as CSSProperties}
      >
        <BoardArt game={game} cell={cell} lateCube={staging.cube} />

        <div className="board-layer" onClick={onBoardClick}>
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

          {planets.map((p) => {
            const hl = ctl.highlights.planets.get(p.id);
            const free = p.capacity - p.cubes.length;
            return (
              <button
                key={p.id}
                className={`planet-hit ${hl ? `planet-${hl.tone}` : ''}`}
                data-r={p.r}
                data-c={p.c}
                style={box(p)}
                onClick={() => ctl.onPlanet(p.id) === false && show({ planet: p.id })}
                title={`${planetLabel(game, p.id)} · ${free} of ${p.capacity} cube location${p.capacity > 1 ? 's' : ''} free`}
              >
                {hl && <span className="planet-label">{hl.label}</span>}
              </button>
            );
          })}

          {reachOf && <Reach game={game} id={reachOf} cell={cell} spots={spots} />}

          {cast !== undefined && <ShipShadows game={game} scene={scene} staging={staging} spots={spots} cell={cell} blur={cast} />}
          {/* Mouse users also get `title=` on ships and planets; touch screens get the tap. */}
          <Ships
            game={game}
            scene={scene}
            staging={staging}
            ctl={ctl}
            zoomed={zoom.zoomed}
            spots={spots}
            cell={cell}
            shadowless={cast !== undefined}
            onInfo={(id) => show({ ship: id })}
            onPress={(id, touch) => {
              viaMouse.current = !touch;
              if (touch) setHeld(id);
            }}
          />
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

/** Your ships: those of the seats this screen plays; sharing a screen, those of whoever's turn it is. */
const yoursOf = (game: GameState, ctl: Controller) => (owner: number) =>
  ctl.mine(owner) && (owner === game.turn.player || !ctl.mine(game.turn.player));

/**
 * The spaces another player's ship could move to with a plain move: its movement (with its owner's
 * skills), diagonally too for an Interceptor with its ability. Every ship it could reach to attack
 * gets a ring, above the ships. Only shown, not clickable.
 */
function Reach({ game, id, cell, spots }: { game: GameState; id: string; cell: number; spots: ShipSpots }) {
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

/** A ship's die, as a part of its space: the shadows it casts (ShipShadows) are made for the same size. */
const DIE_SIZE = 0.56;

/** A piece on space (r, c), `cell` px: placed in percent of its own size (one space), so a zoom or resize doesn't count as a move and glide. */
const placeAt = (r: number, c: number, cell: number) => ({ transform: `translate(${c * 100}%, ${r * 100}%)`, width: cell, height: cell });

/**
 * On a world's ground, the hard shadows every ship's die casts (DieShadow), blurred `blur` px with a hint of its colour: all in one layer
 * under the dice, as a die's top stands as high as the die beside it, so is lit, and as dark where they meet as
 * apart. Each is placed, glides, comes and goes as its ship does (`staging`, Ships). Cut to the map's tiles, so
 * none falls off its edge.
 */
function ShipShadows({
  game,
  scene,
  staging,
  spots,
  cell,
  blur,
}: {
  game: GameState;
  scene?: string;
  staging: Staging;
  spots: ShipSpots;
  cell: number;
  blur: number;
}) {
  // Only a hex map is ever on the ground.
  const edge = game.board.hex ? hexMapPath(game.board, cell, tileArtOf(game.board)) : undefined;
  const struck = staging.struck.map(({ die: d, r, c, ms }) => (
    <div key={`struck:${d.id}`} className="ship-shadow struck" style={{ ...placeAt(r, c, cell), '--late': `${ms}ms` } as CSSProperties}>
      <DieShadow size={cell * DIE_SIZE} blur={blur} color={game.players[d.owner].color} />
    </div>
  ));
  const shadows = game.dice.map((d) => {
    const at = spots.get(d.id);
    if (!at) return null;
    const late = staging.late.get(d.id);
    return (
      <div
        key={d.id}
        className={late === undefined ? 'ship-shadow' : 'ship-shadow late'}
        style={{ ...placeAt(at.r, at.c, cell), '--late': `${late ?? 0}ms` } as CSSProperties}
      >
        <DieShadow size={cell * DIE_SIZE} blur={blur} color={game.players[d.owner].color} rolls={d.rolls} scene={scene} />
      </div>
    );
  });
  return (
    <div className="ship-shadows" style={{ opacity: PIECE_SHADOW_OPACITY, clipPath: edge && `path('${edge}')` }} aria-hidden>
      {shadows}
      {struck}
    </div>
  );
}

/**
 * Every ship on the map, as a die; selected, highlighted, spent or in combat. `onPress`: a pointer went down on another player's ship.
 * `staging`: ships a card brings appear as its effect gets there, and ships it destroys stay until its blow lands.
 */
function Ships({
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
  spots: ShipSpots;
  cell: number;
  /** The dice's shadows are drawn under them all (ShipShadows), not each under its own. */
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
      className="ship struck"
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
  const ships = game.dice.map((d) => {
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
    // a tap attacks. The cards behind it are in the title and the ship panel.
    const attack = ctl.attacks.get(d.id);
    const { ability, name } = shipOf(game, d.value);
    const who = `${game.players[d.owner].name} · ${name} (${d.value})`;
    const place = placeAt(r, c, cell);
    const late = staging.late.get(d.id);
    return (
      <Fragment key={d.id}>
        <div
          className={[
            'ship',
            selected && 'selected',
            tone && `ship-${tone}`,
            spent && 'spent',
            fighting && 'fighting',
            ctl.actionPhase && d.owner === me && 'own',
            yours(d.owner) && 'yours',
            late !== undefined && 'late',
          ]
            .filter(Boolean)
            .join(' ')}
          data-r={r}
          data-c={c}
          style={{ ...place, '--pc': game.players[d.owner].color, '--late': `${late ?? 0}ms` } as CSSProperties}
          onClick={() => ctl.onDie(d.id) === false && onInfo(d.id)}
          onPointerDown={yours(d.owner) ? undefined : (e) => onPress(d.id, e.pointerType !== 'mouse')}
          onContextMenu={(e) => e.preventDefault()}
          aria-label={`${game.players[d.owner].name}'s ${name} (${d.value})${attack ? `, ${percent(attack.chance)} chance to win an attack` : ''}`}
          title={say(
            game,
            attack
              ? [
                  `Attack ${who}: ${percent(attack.chance)} to win`,
                  ...attack.factors.attacker.map((f) => `You: ${f}`),
                  ...attack.factors.defender.map((f) => `Them: ${f}`),
                ].join('\n')
              : `${who}\n${ability.name}: ${ability.text}`,
          )}
        >
          <div className="ship-ring" />
          <Die3D
            value={d.value}
            rolls={d.rolls}
            scene={scene}
            size={cell * DIE_SIZE}
            color={game.players[d.owner].color}
            shadowless={shadowless}
          />
          {abilityUsed && (
            <span className="ship-badge" aria-label="Ability used this turn">
              ✦
            </span>
          )}
        </div>
        {/* Over the ship, in a layer of its own, so no other ship's die covers it where it sticks out. */}
        {attack && (
          <div className="ship-odds-spot" style={place}>
            <OddsBadge chance={attack.chance} cell={cell} zoomed={zoomed} />
          </div>
        )}
      </Fragment>
    );
  });
  return [...ships, ...struck];
}

/** The info bubble for a ship or planet, anchored to its space on the map. */
function BoardInfo({
  game,
  spots,
  what,
  cell,
  onClose,
}: {
  game: GameState;
  spots: ShipSpots;
  what: Inspect;
  cell: number;
  onClose: () => void;
}) {
  const anchor = useAnchorName();
  const planet = 'planet' in what ? game.board.planets.find((p) => p.id === what.planet) : undefined;
  const spot = 'ship' in what ? spots.get(what.ship) : planet && drawing(game.board).at(planet);
  if (!spot) return null; // the ship left the map
  return (
    <>
      <div className="info-anchor" style={{ ...spotBox(spot, cell), '--anchor': anchor } as CSSProperties} />
      <InfoPop anchor={anchor} onClose={onClose}>
        {'ship' in what ? <ShipInfo game={game} id={what.ship} /> : <PlanetInfo game={game} id={what.planet} />}
      </InfoPop>
    </>
  );
}

/** What a ship is: whose, which, and its ability. */
function ShipInfo({ game, id }: { game: GameState; id: string }) {
  const d = die(game, id);
  const { ability, name } = shipOf(game, d.value);
  const p = game.players[d.owner];
  return (
    <>
      <div className="info-title" style={{ '--pc': p.color } as CSSProperties}>
        <span className="info-swatch" /> {p.name}'s {name} <span className="muted">({d.value})</span>
      </div>
      <div>
        <b>{say(game, ability.name)}:</b> {say(game, ability.text)}
      </div>
      {d.owner === game.turn.player && game.turn.abilityUsed[d.id] && <div className="muted">✦ Ability used this turn.</div>}
    </>
  );
}

/** A planet's name and number, as the log shows it: "Thalassa Prime (9)". */
function planetLabel(game: GameState, id: number): string {
  const p = game.board.planets.find((x) => x.id === id)!;
  const name = planetNames(game.board).get(id);
  return name ? `${name} (${p.number})` : say(game, `Planet ${p.number}`);
}

/** A planet's name, its free cube spaces, whose cubes are on it, and who its orbit blocks (contested orbit). */
function PlanetInfo({ game, id }: { game: GameState; id: number }) {
  const p = game.board.planets.find((x) => x.id === id)!;
  const free = p.capacity - p.cubes.length;
  const homeOf = game.players.find((pl) => pl.home === id);
  const rules = rulesOf(game);
  const holders = rules.contestedOrbit
    ? [...new Set(orbitals(game.board, p).flatMap((c) => dieAt(game, c)?.owner ?? []))].map((o) => game.players[o].name)
    : [];
  const blocked = `conquer it${rules.contestedDeploy ? ' or deploy to it' : ''}`;
  return (
    <>
      <div className="info-title">{planetLabel(game, id)}</div>
      <div>
        {free} of {p.capacity} cube space{p.capacity > 1 ? 's' : ''} free.
      </div>
      {holders.length > 0 && (
        <div>
          {say(
            game,
            holders.length === 1
              ? `Contested orbit: while ${holders[0]}’s ships are in orbit, only ${holders[0]} can ${blocked}.`
              : holders.length === 2
                ? `Contested orbit: ${holders.join(' and ')} both have ships in orbit, so neither can ${blocked}.`
                : `Contested orbit: ${holders.join(', ')} all have ships in orbit, so none of them can ${blocked}.`,
          )}
        </div>
      )}
      {holders.length > 0 && homeOf && <div>{say(game, `Home planet: ${homeOf.name} can always deploy here.`)}</div>}
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
    const ship = badge.parentElement!;
    // Not zoomed in, only the screen's edge can cut it off.
    const root = zoomed ? ship.closest('.stage') : null;
    // How far the badge sticks out of the space (see .ship-odds): the ship must be this far inside.
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
    io.observe(ship);
    return () => io.disconnect();
  }, [cell, zoomed]);
  const tone = oddsTone(chance);
  return (
    <span ref={ref} className={['ship-odds', tone, flip.below && 'below', flip.left && 'left'].filter(Boolean).join(' ')} aria-hidden>
      {/* The % sign smaller: a narrower badge. */}
      {percent(chance).replace('%', '')}
      <small>%</small>
    </span>
  );
}

/** Green when the attack is likely to win, red when likely to lose, gold in between (see .ship-odds). */
function oddsTone(chance: number): string {
  return chance >= 0.6 ? 'good' : chance <= 0.4 ? 'bad' : '';
}

/** A chance as a whole percentage; never 0% or 100% unless it is certain. */
function percent(p: number): string {
  const n = Math.round(p * 100);
  return p > 0 && n === 0 ? '<1%' : p < 1 && n === 100 ? '>99%' : `${n}%`;
}
