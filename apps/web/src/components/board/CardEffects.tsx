import type { ReactNode } from 'react';
import type { Board } from '@regolith/engine';
import type { CardEffect } from '../../game/cardEffects';
import type { Step } from '../../game/staging';
import { useMapEffects } from '../../game/useTransient';
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
  reinforcement: (
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
  beam: (
    <span className="cfx-ray">
      <i />
    </span>
  ),
  arc: <span className="cfx-ray" />,
};

const cardsOf = (step: Step): CardEffect[] => step.cards;

/**
 * Over the mechs and explosions. Remounted for a jump to another position (`key`), so that shows none.
 * Ids are only unique per kind (a mech's id may mark two effects), hence the kind in each `key`.
 */
export function CardEffects({ step, board, cell }: { step: Step | null; board: Board; cell: number }) {
  return useMapEffects(step, CARD_EFFECT_MS, cardsOf).map((e) => (
    <EffectBox board={board} key={`${e.kind}:${e.id}`} e={e} cell={cell} className={`cfx cfx-${e.kind}`}>
      {PARTS[e.kind]}
    </EffectBox>
  ));
}
