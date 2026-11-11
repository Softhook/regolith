import type { CSSProperties, ReactNode } from 'react';
import { mechOf, type CombatOutcome, type CombatPending, type CombatRole, type GameState } from '@regolith/engine';
import { COMBAT_DICE } from '../theme';
import { Die3D } from './Die3D';

/**
 * One side of a battle, the game's and the tutorial's: who fights, its mech's die and the die it rolled, then its
 * total. `parts` go above the total, `children` below it. `sound` rattles the attacker's die.
 */
export function BattleSide({
  game,
  combat,
  out,
  role,
  revealed,
  dieSize,
  sound = false,
  parts,
  children,
}: {
  game: GameState;
  combat: CombatPending;
  out: CombatOutcome;
  role: CombatRole;
  revealed: boolean;
  dieSize: number;
  sound?: boolean;
  parts?: ReactNode;
  children?: ReactNode;
}) {
  const s = combat[role];
  const p = game.players[s.player];
  const total = out[role];
  return (
    <div className={`combat-side ${role} ${revealed && out.winner === role ? 'winning' : ''}`} style={{ '--pc': p.color } as CSSProperties}>
      <div className="combat-who">
        <small>{role === 'attacker' ? 'Attacker' : 'Defender'}</small>
        <strong>{p.name}</strong>
      </div>
      <div className="combat-dice">
        <div className="combat-die-col">
          <Die3D value={s.mech} size={dieSize} color={p.color} sound={false} />
          <span>{mechOf(game, s.mech).name}</span>
        </div>
        <span className="combat-plus">+</span>
        <div className={`combat-die-col ${s.atomic ? 'atomic-fired' : ''}`}>
          <Die3D
            value={total.roll}
            size={dieSize}
            color={COMBAT_DICE[role].color}
            pip={COMBAT_DICE[role].pip}
            tumbleOnMount
            delay={role === 'attacker' ? 0 : 0.12}
            sound={sound && role === 'attacker'}
          />
          <span>{s.atomic ? 'Atomic' : role === 'attacker' ? 'Attack die' : 'Defence die'}</span>
        </div>
      </div>
      {parts}
      <div className={`combat-total ${revealed ? 'show' : ''}`}>{revealed ? total.total : '?'}</div>
      {children}
    </div>
  );
}
