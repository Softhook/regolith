import { cellOf, drawing, same, type Cell, type GameState } from '@regolith/engine';
import { SHIP } from '../../beats';
import { lastLogId, useStepEffects } from '../../game/useTransient';
import { cardEffectsOf } from './CardEffects';
import { EffectBox, cubeCount, type MapEffect } from './EffectBox';
import { glidePath } from './staging';

/**
 * A short effect on the map for one action: a ship warping in, flying (from `at` to `to`, `ms` into its flight: one
 * for each space of its way), or a planet conquered.
 */
type Effect = MapEffect & ({ kind: 'deploy' | 'conquer' } | { kind: 'trail'; to: Cell; ms: number });

/** Every effect is over by then (a trail's last part starts within a glide), so none slows play down. */
const EFFECT_MS = 500 + SHIP.glide;

/** What the step from `before` to `game` did on the map, as effects. */
function effectsOf(before: GameState, game: GameState): Effect[] {
  const step = lastLogId(game);
  const out: Effect[] = [];
  // A card's own effect (CardEffects) stands in for these on a ship or planet it marks: one placed by
  // Expansion or Unveil, one Nomadic relocates, a relocated cube.
  const replaced = new Set(cardEffectsOf(before, game).flatMap((e) => e.replaces ?? []));
  const was = new Map(before.dice.map((d) => [d.id, d]));
  for (const d of game.dice) {
    const p = was.get(d.id);
    const to = cellOf(d);
    if (!p || !to || replaced.has(d.id)) continue;
    const from = cellOf(p);
    const fx = { id: `${d.id}:${step}`, at: to, color: game.players[d.owner].color };
    if (!from) out.push({ kind: 'deploy', ...fx });
    else if (!same(from, to)) out.push(...trails(before, game, d.id, from, to).map((t, i) => ({ ...fx, ...t, id: `${fx.id}:${i}` })));
  }
  for (const pl of game.board.planets) {
    if (replaced.has(`planet:${pl.id}`)) continue;
    const old = before.board.planets.find((x) => x.id === pl.id)?.cubes ?? [];
    // Whose cubes there grew in number: a cube taken off shifts the rest, so their order says nothing.
    const owner = pl.cubes.find((o) => cubeCount(pl.cubes, o) > cubeCount(old, o));
    if (owner !== undefined) out.push({ kind: 'conquer', id: `planet${pl.id}:${step}`, at: pl, color: game.players[owner].color });
  }
  return out;
}

/**
 * The trail of ship `id` flying from `from` to `to`: straight, or a part for each space it crosses (staging
 * glidePath), each as the ship gets there; none across a joined edge or through a Warp Gate.
 */
function trails(before: GameState, game: GameState, id: string, from: Cell, to: Cell) {
  const path = glidePath(before, game, id);
  if (!path.length) return [{ kind: 'trail' as const, at: from, to, ms: 0 }];
  const { at } = drawing(game.board);
  const lens = path.slice(1).map((p, i) => {
    const [a, b] = [at(path[i]), at(p)];
    return Math.hypot(a.r - b.r, a.c - b.c);
  });
  const total = lens.reduce((a, b) => (b < 1.8 ? a + b : a), 0) || 1;
  let gone = 0;
  return lens.flatMap((len, i) => {
    if (len >= 1.8) return [];
    const ms = (gone / total) * SHIP.glide;
    gone += len;
    return [{ kind: 'trail' as const, at: path[i], to: path[i + 1], ms }];
  });
}

/** Over the ships, under explosions. Remounted for a jump to another position (`key`), so that shows none. */
export function ActionEffects({ game, cell }: { game: GameState; cell: number }) {
  return useStepEffects(game, EFFECT_MS, effectsOf).map((e) => (
    <EffectBox board={game.board} key={e.id} e={e} cell={cell} className={`fx fx-${e.kind}`}>
      <span style={e.kind === 'trail' ? { animationDelay: `${e.ms}ms` } : undefined} />
      {/* Each effect but the trail is two parts (a flash and a ring, a shockwave and a glow). */}
      {e.kind !== 'trail' && <span />}
    </EffectBox>
  ));
}
