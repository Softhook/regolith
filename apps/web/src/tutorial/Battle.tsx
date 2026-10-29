import { useEffect, useState, type CSSProperties } from 'react';
import { combatOutcome, drawing, shipOf, type CombatPending, type CombatRole, type GameState } from '@regolith/engine';
import { Die3D } from '../components/Die3D';
import { COMBAT_DICE } from '../theme';

/** How long the dice tumble before the totals show (the game's battle: CombatOverlay). */
const REVEAL_MS = 1250;

/**
 * A fight, spelled out over the map: each side's mech and the die it rolled, the totals, who wins. The same
 * dice and words as the game's own battle screen, minus its buttons. It sits over the half of the map the fight
 * isn't in, so the fight stays in view with the caption under it.
 */
export function Battle({ game, combat }: { game: GameState; combat: CombatPending }) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setRevealed(false);
    const t = window.setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [combat.id]);
  const out = combatOutcome(game, combat);
  const leader = game.players[combat[out.attackerWins ? 'attacker' : 'defender'].player];
  const { rows, at } = drawing(game.board);
  const low = at(combat.at).r + 0.5 > rows / 2;

  const side = (role: CombatRole) => {
    const s = combat[role];
    const p = game.players[s.player];
    const total = role === 'attacker' ? out.attacker : out.defender;
    const winning = revealed && (role === 'attacker') === out.attackerWins;
    return (
      <div className={`combat-side ${role} ${winning ? 'winning' : ''}`} style={{ '--pc': p.color } as CSSProperties}>
        <div className="combat-who">
          <small>{role === 'attacker' ? 'Attacker' : 'Defender'}</small>
          <strong>{p.name}</strong>
        </div>
        <div className="combat-dice">
          <div className="combat-die-col">
            <Die3D value={s.ship} size={40} color={p.color} sound={false} />
            <span>{shipOf(game, s.ship).name}</span>
          </div>
          <span className="combat-plus">+</span>
          <div className="combat-die-col">
            <Die3D
              value={total.roll}
              size={40}
              color={COMBAT_DICE[role].color}
              pip={COMBAT_DICE[role].pip}
              tumbleOnMount
              delay={role === 'attacker' ? 0 : 0.12}
              sound={false}
            />
            <span>{role === 'attacker' ? 'Attack die' : 'Defence die'}</span>
          </div>
        </div>
        <div className={`combat-total ${revealed ? 'show' : ''}`}>{revealed ? total.total : '?'}</div>
      </div>
    );
  };

  return (
    <div className={`demo-battle ${low ? 'top' : 'bottom'}`} aria-live="polite">
      <div className="combat-card">
        <div className="combat-grid">
          {side('attacker')}
          <div className="combat-vs">VS</div>
          {side('defender')}
        </div>
        <div className={`combat-verdict ${revealed ? 'show' : ''}`} style={{ '--pc': leader.color } as CSSProperties}>
          {revealed && (
            <>
              <strong>{leader.name}</strong> {out.attackerWins ? 'wins: lower total' : 'holds: the attacker needs a lower total'}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
