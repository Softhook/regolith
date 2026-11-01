import type { CSSProperties } from 'react';
import { cardName, shipOf, type CombatOutcome, type CombatPending, type GameState } from '@regolith/engine';

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
  return (
    <div className={`combat-verdict ${revealed ? 'show' : ''}`} style={{ '--pc': leader.color } as CSSProperties}>
      {revealed && (
        <>
          <strong>{leader.name}</strong>{' '}
          {lost ? (
            <>
              {out.stubborn ? `holds firm (${cardName('stubborn')})` : 'wins'}:{' '}
              <b>
                {game.players[lost.player].name}’s {shipOf(game, lost.ship).name} will be destroyed
              </b>
            </>
          ) : (
            'repels the attack: no mech is lost'
          )}
        </>
      )}
    </div>
  );
}
