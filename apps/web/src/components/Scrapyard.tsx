import { say, scrapyard, shipOf, type Die, type GameState, type PlayerState } from '@regolith/engine';
import type { Controller } from '../game/controller';
import type { Dispatch } from '../game/useGame';
import { Die3D } from './Die3D';
import { Tip } from './InfoPop';

/** The ships `player` has re-rolled while unveiling (Unveil tactic) on this device, or null when not unveiling. */
function unveilingOf(game: GameState, player: number, ctl: Controller): string[] | null {
  const head = game.pending[0];
  return head?.kind === 'unveil' && head.player === player && ctl.human ? head.rerolled : null;
}

/** Whether `p` can deploy from their scrapyard on this device now: in their action phase, unveiling, or placing their starting ships. */
function canDeployFrom(game: GameState, p: PlayerState, ctl: Controller): boolean {
  const head = game.pending[0];
  const placingStart = head?.kind === 'placeShips' && head.player === p.id && ctl.human;
  return (ctl.actionPhase && game.turn.player === p.id) || !!unveilingOf(game, p.id, ctl) || placingStart;
}

/** A ship's ability in this game's rules, as one line. */
function abilityText(game: GameState, value: number): string {
  const { ability } = shipOf(game, value);
  return say(game, `${ability.name}: ${ability.text}`);
}

/**
 * Whose scrapyard the turn panel shows: the ships this device plays with, so they stay in one place
 * rather than moving between the panel and a player row as turns pass. That's whoever can deploy now,
 * else the acting player if they play here (several players sharing a device), else the first player
 * who does; a screen that plays for nobody shows the acting player's. Their player row leaves it out.
 */
export function turnScrapOwner(game: GameState, ctl: Controller): PlayerState {
  const deployer = game.players.find((q) => canDeployFrom(game, q, ctl));
  if (deployer) return deployer;
  const head = game.pending[0];
  const acting = game.players[game.phase === 'setup' && head && head.kind !== 'combat' ? head.player : game.turn.player];
  return ctl.mine(acting.id) ? acting : (game.players.find((q) => ctl.mine(q.id)) ?? acting);
}

/** A player's scrapyard: their ships off the board, which they tap to deploy when they can. */
export function Scrapyard({ game, p, ctl, dispatch }: { game: GameState; p: PlayerState; ctl: Controller; dispatch: Dispatch }) {
  const scrap = scrapyard(game, p.id);
  if (!scrap.length) return null;
  const unveiling = unveilingOf(game, p.id, ctl);
  const canDeploy = canDeployFrom(game, p, ctl);
  const clickScrap = (d: Die) => {
    ctl.select(ctl.sel.kind === 'scrap' && ctl.sel.die === d.id ? { kind: 'none' } : { kind: 'scrap', die: d.id });
  };
  return (
    <div className="scrapyard">
      <span className="scrap-label">{say(game, 'Scrapyard')}</span>
      {scrap.map((d) => (
        <span key={d.id} className="scrap-die-wrap">
          <Tip
            className={`scrap-die ${canDeploy ? 'clickable' : ''} ${ctl.sel.kind === 'scrap' && ctl.sel.die === d.id ? 'selected' : ''}`}
            onClick={() => canDeploy && (clickScrap(d), true)}
            tip={
              <>
                <b>
                  {shipOf(game, d.value).name} ({d.value})
                </b>
                <span>{abilityText(game, d.value)}</span>
                <span className="muted">{say(game, 'Waiting in the scrapyard to be deployed.')}</span>
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
