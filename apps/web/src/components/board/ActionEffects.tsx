import { cellOf, same, type Board, type Cell } from '@regolith/engine';
import { MECH } from '../../beats';
import type { MapEffect } from '../../game/cardEffects';
import type { Step, Waypoint } from '../../game/staging';
import { lastLogId } from '../../game/steps';
import { useMapEffects } from '../../game/useTransient';
import { EffectBox, cubeCount } from './EffectBox';

/**
 * A short effect on the map for one action: a mech dropping in, flying (from `at` to `to`, `ms` into its flight: one
 * for each space of its way), or an objective claimed.
 */
type Effect = MapEffect & ({ kind: 'drop' | 'claim' } | { kind: 'trail'; to: Cell; ms: number });

/** Every effect is over by then (a trail's last part starts within a glide), so none slows play down. */
const EFFECT_MS = 500 + MECH.glide;

/** What the step did on the map, as effects. */
function effectsOf({ before, game, cards, staging }: Step): Effect[] {
  const step = lastLogId(game);
  const out: Effect[] = [];
  // A card's own effect (CardEffects) stands in for these on a mech it marks: one placed by Reinforcements or
  // Invasion.
  const replaced = new Set(cards.flatMap((e) => e.replaces ?? []));
  const was = new Map(before.dice.map((d) => [d.id, d]));
  for (const d of game.dice) {
    const p = was.get(d.id);
    const to = cellOf(d);
    if (!p || !to || replaced.has(d.id)) continue;
    const from = cellOf(p);
    const fx = { id: `${d.id}:${step}`, at: to, color: game.players[d.owner].color };
    if (!from) out.push({ kind: 'drop', ...fx });
    else if (!same(from, to))
      out.push(...trails(staging.paths.get(d.id) ?? [], from, to).map((t, i) => ({ ...fx, ...t, id: `${fx.id}:${i}` })));
  }
  for (const pl of game.board.objectives) {
    const old = before.board.objectives.find((x) => x.id === pl.id)?.cubes ?? [];
    // Whose cubes there grew in number: a cube taken off shifts the rest, so their order says nothing.
    const owner = pl.cubes.find((o) => cubeCount(pl.cubes, o) > cubeCount(old, o));
    if (owner !== undefined) out.push({ kind: 'claim', id: `objective${pl.id}:${step}`, at: pl, color: game.players[owner].color });
  }
  return out;
}

/**
 * The trail of a mech flying from `from` to `to`: straight, or a part for each space it crosses on its `way` (the
 * step's staging, flightOf), each as the mech gets there; none where it jumps.
 */
function trails(way: Waypoint[], from: Cell, to: Cell) {
  if (!way.length) return [{ kind: 'trail' as const, at: from, to, ms: 0 }];
  return way
    .slice(1)
    .flatMap((p, i) => (p.at > way[i].at ? [{ kind: 'trail' as const, at: way[i].cell, to: p.cell, ms: way[i].at * MECH.glide }] : []));
}

/** Over the mechs, under explosions. Remounted for a jump to another position (`key`), so that shows none. */
export function ActionEffects({ step, board, cell }: { step: Step | null; board: Board; cell: number }) {
  return useMapEffects(step, EFFECT_MS, effectsOf).map((e) => (
    <EffectBox board={board} key={e.id} e={e} cell={cell} className={`fx fx-${e.kind}`}>
      <span style={e.kind === 'trail' ? { animationDelay: `${e.ms}ms` } : undefined} />
      {/* Each effect but the trail is two parts (a flash and a ring, a shockwave and a glow). */}
      {e.kind !== 'trail' && <span />}
    </EffectBox>
  ));
}
