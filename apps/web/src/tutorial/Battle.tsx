import { combatOutcome, drawing, type CombatPending, type GameState, type PlayerId } from '@regolith/engine';
import { BattleArena } from '../components/BattleArena';
import { BattleSide } from '../components/BattleSide';
import { BattleVerdict } from '../components/BattleVerdict';
import { useBattleReveal, useBattleSounds } from '../game/useBattleReveal';
import { PHONE, useMediaQuery } from '../game/useMediaQuery';

/**
 * A fight, spelled out over the map: the two mechs fighting, each side's mech and the die it rolled, the totals, who
 * wins. The same strip, dice, words and sounds as the game's own battle screen, minus its buttons. It sits over the
 * half of the map the fight isn't in, so the fight stays in view where the window has room, with the caption under it.
 */
export function Battle({
  game,
  combat,
  mine,
  silent,
}: {
  game: GameState;
  combat: CombatPending;
  mine: (p: PlayerId) => boolean;
  /** A fight jumped to rather than seen to begin: shown, but not heard. */
  silent: boolean;
}) {
  const revealed = useBattleReveal(combat);
  const out = combatOutcome(game, combat);
  useBattleSounds(revealed && !silent, combat, out, mine);
  const compact = useMediaQuery(PHONE);
  const { rows, at } = drawing(game.board);
  const low = at(combat.at).r + 0.5 > rows / 2;

  return (
    <div className={`demo-battle ${low ? 'top' : 'bottom'} ${compact ? 'compact' : ''}`} aria-live="polite">
      <div className="combat-card">
        <BattleArena game={game} combat={combat} out={out} revealed={revealed} />
        <div className="combat-grid">
          <BattleSide game={game} combat={combat} out={out} role="attacker" revealed={revealed} dieSize={40} sound={!silent} />
          <div className="combat-vs">VS</div>
          <BattleSide game={game} combat={combat} out={out} role="defender" revealed={revealed} dieSize={40} />
        </div>
        <BattleVerdict game={game} combat={combat} out={out} revealed={revealed} />
      </div>
    </div>
  );
}
