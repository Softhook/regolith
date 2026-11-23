import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import { cellOf, mechOf, type GameState } from '@regolith/engine';
import { TILE } from '@regolith/art';
import { MECH } from '../../beats';
import type { Controller } from '../../game/controller';
import type { MechSpots } from '../../game/mechSpots';
import type { Staging } from '../../game/staging';
import { Die3D, DieShadow } from '../Die3D';
import { tileArtOf } from './BoardArt';
import { CubeShadows, type CubeSpot } from './Cubes';
import { hexMapPath } from './geometry';
import { pieceShadowOpacity } from './shadows';

/** Your mechs: those of the seats this screen plays; sharing a screen, those of whoever's turn it is. */
export const yoursOf = (game: GameState, ctl: Controller) => (owner: number) =>
  ctl.mine(owner) && (owner === game.turn.player || !ctl.mine(game.turn.player));

/** How a mech flies its way (glideAlong): eased in a little and out, so it doesn't rush the first space. */
const PATH_EASING = 'cubic-bezier(.45,.1,.25,1)';

/**
 * Flies each mech in `paths` (staging) along its way, and its shadow and odds with it, in the time of a
 * straight glide (beats.ts): they're `.pathed`, without the glide.
 */
export function glideAlong(board: HTMLElement | null, paths: Staging['paths']) {
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
export const DIE_SIZE = 0.56;

/** A piece on space (r, c), `cell` px: placed in percent of its own size (one space), so a zoom or resize doesn't count as a move and glide. */
const placeAt = (r: number, c: number, cell: number) => ({ transform: `translate(${c * 100}%, ${r * 100}%)`, width: cell, height: cell });

/** The map's outline at `cell` px a space (hexMapPath), worked out once per map and size: the board changes every move, its tiles never. */
const edges = new Map<string, string>();
function mapEdge(board: GameState['board'], cell: number): string {
  const k = `${board.mapId}:${cell}`;
  let edge = edges.get(k);
  if (edge === undefined) {
    if (edges.size > 32) edges.clear();
    edges.set(k, (edge = hexMapPath(board, cell, tileArtOf(board))));
  }
  return edge;
}

/**
 * On a world's ground, the hard shadows every mech's die (DieShadow) and cube (CubeShadows) casts, blurred `blur` px with a hint of
 * its colour: all in one layer under the dice and cubes, as a die's top stands as high as the die beside it, so is lit, and as dark
 * where they meet as apart. Each is placed, glides, comes and goes as its mech does (`staging`, Mechs). Cut to the map's tiles, so
 * none falls off its edge.
 */
export function MechShadows({
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
  const edge = mapEdge(game.board, cell);
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
export function Mechs({
  game,
  staging,
  ctl,
  zoomed,
  spots,
  cell,
  shadowless,
  onInfo,
  onPress,
  onReveal,
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
  /** Brings space (r, c) into view, when zoomed in (zoom.reveal). */
  onReveal: (r: number, c: number) => void;
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
          // A button to the keyboard and screen readers too (its die is drawn inside, so not a <button>): Enter or Space taps it.
          role="button"
          tabIndex={0}
          onClick={() => ctl.onDie(d.id) === false && onInfo(d.id)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            // A key held down taps once, not over and over (each tap would pick it, then drop it).
            if (!e.repeat) e.currentTarget.click();
          }}
          // Reached with the keyboard off screen (zoomed in), the map brings it into view. Not for a click, which focuses it too.
          onFocus={(e) => e.currentTarget.matches(':focus-visible') && onReveal(cellOf(d)!.r, cellOf(d)!.c)}
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
export function oddsTone(chance: number): string {
  return chance >= 0.6 ? 'good' : chance <= 0.4 ? 'bad' : '';
}

/** A chance as a whole percentage; never 0% or 100% unless it is certain. */
export function percent(p: number): string {
  const n = Math.round(p * 100);
  return p > 0 && n === 0 ? '<1%' : p < 1 && n === 100 ? '>99%' : `${n}%`;
}
