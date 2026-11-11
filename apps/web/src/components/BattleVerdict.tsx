import type { CSSProperties } from 'react';
import { cardName, mechOf, type CombatOutcome, type CombatPending, type GameState } from '@regolith/engine';

/** Whose something is: the tutorial's player is called You. */
export const whose = (name: string) => (name === 'You' ? 'Your' : `${name}’s`);

/** A battle's result in words, the game's and the tutorial's, and all a phone on its side has (it has no strip): who wins, and whether a mech is lost. */
export function BattleVerdict({
  game,
  combat,
  out,
  revealed,
}: {
  game: GameState;
  combat: CombatPending;
  out: CombatOutcome;
  revealed: boolean;
}) {
  const leader = game.players[combat[out.winner].player];
  const lost = out.destroyed && combat[out.destroyed];
  const s = leader.name === 'You' ? '' : 's';
  return (
    <div className={`combat-verdict ${revealed ? 'show' : ''}`} style={{ '--pc': leader.color } as CSSProperties}>
      {revealed && (
        <>
          <strong>{leader.name}</strong>{' '}
          {lost ? (
            <>
              {out.stubborn ? `hold${s} firm (${cardName('stubborn')})` : `win${s}`}:{' '}
              <b>
                {whose(game.players[lost.player].name)} {mechOf(game, lost.mech).name} will be destroyed
              </b>
            </>
          ) : (
            `repel${s} the attack: no mech is lost`
          )}
        </>
      )}
    </div>
  );
}
