import { useEffect, useState } from 'react';
import type { CombatOutcome, CombatPending, PlayerId } from '@regolith/engine';
import { combatStage } from '@regolith/online';
import { BATTLE } from '../beats';
import { playBattleResult } from './sounds';
import { useEffectEvent } from './useEffectEvent';

/**
 * Whether a battle's dice have landed, so its totals and result can show. An atomic hides them again until it goes
 * off, so the result it changes isn't shown before it lands. Derived from the stage, so no frame shows a new stage as revealed.
 */
export function useBattleReveal(combat: CombatPending): boolean {
  const stage = combatStage(combat);
  const [opening] = useState(stage);
  const [landed, setLanded] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setLanded(stage), stage === opening ? BATTLE.reveal : BATTLE.atomic);
    return () => window.clearTimeout(t);
  }, [stage, opening]);
  return landed === stage;
}

/** A battle's result, heard as it shows, and again as an atomic goes off. */
export function useBattleSounds(revealed: boolean, combat: CombatPending, out: CombatOutcome, mine: (p: PlayerId) => boolean) {
  const hear = useEffectEvent(() => playBattleResult(combat, out, mine));
  useEffect(() => {
    if (revealed) hear();
  }, [revealed, hear]);
}
