import type { ReactNode } from 'react';
import type { GameState } from '@regolith/engine';
import { cardEffectsOf, type CardEffect } from '../../game/cardEffects';
import { useStepEffects } from '../../game/useTransient';
import { EffectBox } from './EffectBox';

/** Longer than a plain action's effect: cards are rare, and worth a moment. */
const CARD_EFFECT_MS = 900;

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
