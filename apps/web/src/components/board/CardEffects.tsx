import type { ReactNode } from 'react';
import { cellOf, effectOf, same, type Cell, type GameState } from '@regolith/engine';
import { lastLogId, useStepEffects } from '../../game/useTransient';
import { GATE_COLOR } from '../../theme';
import { EffectBox, type MapEffect } from './EffectBox';

/**
 * A card's mark on the map, over the plain action effects (ActionEffects): Show of Force striking a ship,
 * Warp Gates linked and the old pair closed (the board draws the gates themselves), an expansion ship
 * arriving, a fleet cloaked and unveiled, a ship number nudged (Flexible, Clever), a ship scrapped
 * (Resourceful), and the two ships Dangerous destroys. `replaces` names what the effect stands in for an action's effect on
 * (ActionEffects): a ship, or `planet:<id>` for the planet a cube was relocated to.
 */
type CardEffect = MapEffect & { replaces?: string } & (
    { kind: 'strike' | 'expansion' | 'cloak' | 'decloak' | 'implode' | 'raise' | 'lower' | 'blink' } | { kind: 'beam' | 'arc'; to: Cell }
  );

/** Longer than a plain action's effect: cards are rare, and worth a moment. */
const CARD_EFFECT_MS = 900;

const gatesKey = (g: GameState) => g.gates.map((c) => `${c.r},${c.c}`).join(' ');

/** What a card did on the map in the step from `before` to `game`, as effects. */
export function cardEffectsOf(before: GameState, game: GameState): CardEffect[] {
  const step = lastLogId(game);
  const out: CardEffect[] = [];
  const head = before.pending[0];
  const colorOf = (p: number) => game.players[p].color;
  const was = new Map(before.dice.map((d) => [d.id, d]));
  // The cards this step played or used (the engine names each on the entry its owner logged).
  const used = new Set(game.log.filter((e) => e.id > lastLogId(before) && e.card).map((e) => effectOf(e.card!)));
  // Unveil the Fleet takes the player's ships off the map as it is played (a Clever choice for each
  // may come before the unveil itself).
  const unveiling = used.has('unveil-the-fleet');

  for (const d of game.dice) {
    const p = was.get(d.id);
    if (!p) continue;
    const from = cellOf(p);
    const to = cellOf(d);
    const fx = { id: `${d.id}:${step}`, color: colorOf(d.owner), replaces: d.id };
    if (from && !to) {
      // Dangerous: both ships go, joined by an arc (below).
      if (head?.kind === 'dangerous') continue;
      if (head?.kind === 'showOfForce') out.push({ kind: 'strike', ...fx, at: from, color: colorOf(head.player) });
      else if (used.has('resourceful')) out.push({ kind: 'implode', ...fx, at: from });
      else if (unveiling) out.push({ kind: 'cloak', ...fx, at: from });
    } else if (!from && to) {
      if (head?.kind === 'placeExpansion') out.push({ kind: 'expansion', ...fx, at: to });
      else if (head?.kind === 'unveil') out.push({ kind: 'decloak', ...fx, at: to });
    } else if (from && to) {
      if (d.value !== p.value && d.rolls === p.rolls && (head?.kind === 'clever' || used.has('flexible'))) {
        out.push({ kind: d.value > p.value ? 'raise' : 'lower', ...fx, at: to });
      }
    }
  }

  if (head?.kind === 'dangerous') {
    const att = was.get(head.attacker);
    const def = was.get(head.defender);
    const a = att && cellOf(att);
    const b = def && cellOf(def);
    const gone = (id: string) => !cellOf(game.dice.find((d) => d.id === id)!);
    if (a && b && gone(head.attacker) && gone(head.defender)) {
      out.push({ kind: 'arc', id: `dangerous:${step}`, at: b, to: a, color: colorOf(head.player) });
    }
  }

  if (game.gates.length === 2 && gatesKey(game) !== gatesKey(before)) {
    const [a, b] = game.gates;
    out.push({ kind: 'beam', id: `gates:${step}`, at: a, to: b, color: GATE_COLOR });
    // A new pair closes the old one.
    before.gates.forEach((g, i) => {
      if (!game.gates.some((x) => same(x, g))) out.push({ kind: 'implode', id: `gate${i}:${step}`, at: g, color: GATE_COLOR });
    });
  }
  return out;
}

/** A chevron pointing up (turned over to point down). */
const chevron = (
  <svg viewBox="0 0 20 12">
    <polyline points="2,10 10,2 18,10" />
  </svg>
);
const chevrons = (
  <span className="cfx-chevrons">
    {chevron}
    {chevron}
  </span>
);
const shimmer = (
  <>
    <span className="cfx-shimmer" />
    <span className="cfx-veil" />
  </>
);

/** Each effect's parts. A part's class never names an effect's kind, so the box (`cfx-<kind>`) can't take its styles. */
const PARTS: Record<CardEffect['kind'], ReactNode> = {
  strike: (
    <>
      <span className="cfx-reticle" />
      <span className="cfx-lance" />
    </>
  ),
  expansion: (
    <>
      <span className="cfx-lance" />
      <span className="cfx-halo" />
      <span className="cfx-halo late" />
    </>
  ),
  cloak: shimmer,
  decloak: shimmer,
  implode: (
    <>
      <span className="cfx-collapse" />
      <span className="cfx-collapse late" />
      <span className="cfx-core" />
    </>
  ),
  raise: chevrons,
  lower: chevrons,
  blink: (
    <>
      <span className="cfx-halo" />
      <span className="cfx-halo late" />
    </>
  ),
  beam: (
    <span className="cfx-ray">
      <i />
    </span>
  ),
  arc: <span className="cfx-ray" />,
};

/**
 * Over the ships and explosions. Remounted for a jump to another position (`key`), so that shows none.
 * Ids are only unique per kind (Nomadic's fold and open share the ship's), hence the kind in each `key`.
 */
export function CardEffects({ game, cell }: { game: GameState; cell: number }) {
  return useStepEffects(game, CARD_EFFECT_MS, cardEffectsOf).map((e) => (
    <EffectBox board={game.board} key={`${e.kind}:${e.id}`} e={e} cell={cell} className={`cfx cfx-${e.kind}`}>
      {PARTS[e.kind]}
    </EffectBox>
  ));
}
