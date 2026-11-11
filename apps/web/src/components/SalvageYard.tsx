import { salvageYard, mechOf, type Die, type GameState, type PlayerState } from '@regolith/engine';
import type { Controller } from '../game/controller';
import type { Dispatch } from '../game/useGame';
import { Die3D } from './Die3D';
import { Tip } from './InfoPop';

/** The mechs `player` has re-rolled while unveiling (Unveil tactic) on this device, or null when not unveiling. */
function unveilingOf(game: GameState, player: number, ctl: Controller): string[] | null {
  const head = game.pending[0];
  return head?.kind === 'unveil' && head.player === player && ctl.human ? head.rerolled : null;
}

/** Whether `p` can drop from their salvage yard on this device now: in their action phase, unveiling, or placing their starting mechs. */
function canDropFrom(game: GameState, p: PlayerState, ctl: Controller): boolean {
  const head = game.pending[0];
  const placingStart = head?.kind === 'placeMechs' && head.player === p.id && ctl.human;
  return (ctl.actionPhase && game.turn.player === p.id) || !!unveilingOf(game, p.id, ctl) || placingStart;
}

/** A mech's ability in this game's rules, as one line. */
function abilityText(game: GameState, value: number): string {
  const { ability } = mechOf(game, value);
  return `${ability.name}: ${ability.text}`;
}

/**
 * Whose salvage yard the turn panel shows: the mechs this device plays with, so they stay in one place
 * rather than moving between the panel and a player row as turns pass. That's whoever can drop now,
 * else the acting player if they play here (several players sharing a device), else the first player
 * who does; a screen that plays for nobody shows the acting player's. Their player row leaves it out.
 */
export function turnYardOwner(game: GameState, ctl: Controller): PlayerState {
  const dropper = game.players.find((q) => canDropFrom(game, q, ctl));
  if (dropper) return dropper;
  const head = game.pending[0];
  const acting = game.players[game.phase === 'setup' && head && head.kind !== 'combat' ? head.player : game.turn.player];
  return ctl.mine(acting.id) ? acting : (game.players.find((q) => ctl.mine(q.id)) ?? acting);
}

/** A player's salvageYard: their mechs off the board, which they tap to drop when they can. */
export function SalvageYard({ game, p, ctl, dispatch }: { game: GameState; p: PlayerState; ctl: Controller; dispatch: Dispatch }) {
  const salvage = salvageYard(game, p.id);
  if (!salvage.length) return null;
  const unveiling = unveilingOf(game, p.id, ctl);
  const canDrop = canDropFrom(game, p, ctl);
  const clickSalvaged = (d: Die) => {
    ctl.select(ctl.sel.kind === 'salvage' && ctl.sel.die === d.id ? { kind: 'none' } : { kind: 'salvage', die: d.id });
  };
  return (
    <div className="salvage-yard">
      <span className="salvage-label">{'Salvage yard'}</span>
      {salvage.map((d) => (
        <span key={d.id} className="salvage-die-wrap">
          <Tip
            className={`salvage-die ${canDrop ? 'clickable' : ''} ${ctl.sel.kind === 'salvage' && ctl.sel.die === d.id ? 'selected' : ''}`}
            onClick={() => canDrop && (clickSalvaged(d), true)}
            tip={
              <>
                <b>
                  {mechOf(game, d.value).name} ({d.value})
                </b>
                <span>{abilityText(game, d.value)}</span>
                <span className="muted">{'Waiting in the salvage yard to be dropped.'}</span>
              </>
            }
          >
            <Die3D value={d.value} rolls={d.rolls} size={22} color={p.color} sound={false} />
          </Tip>
          {unveiling && !unveiling.includes(d.id) && (
            <button className="mini-btn" onClick={() => dispatch({ type: 'unveilReroll', die: d.id })}>
              re-roll
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
