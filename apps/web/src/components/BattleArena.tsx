import { useMemo, type CSSProperties } from 'react';
import { dataUrl, fighterMuzzle, GROUND_BASE, mechFighterSvg, SKY, type FighterStance } from '@regolith/art';
import { mechOf, type CombatOutcome, type CombatPending, type CombatRole, type GameState } from '@regolith/engine';
import { whose } from './BattleVerdict';

/**
 * The two mechs squared up, printed as the cards print them, under the sky and on the ground of the map's world: the attacker on
 * the left facing right, the defender facing it. Once the dice are in, the two outcomes look nothing alike: a mech
 * that will be destroyed is blown over and burns out under the winner's lunge; an attack that's repelled bounces off
 * the defender's guard, and both stay on their feet in their colours.
 * A shot (`ranged`, the Sniper's Shoot) is fought apart: the Sniper braced at one end, its target at the
 * other, and the reveal fires the shot. It hits (the target is destroyed) or misses, flying past, and
 * then nobody is hurt: the Sniper is only destroyed when the target holds firm.
 */
export function BattleArena({
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
  const winner = revealed ? out.winner : null;
  const destroyed = revealed ? out.destroyed : null;
  const a = combat.attacker;
  const d = combat.defender;
  const ac = game.players[a.player].color;
  const dc = game.players[d.player].color;
  const ranged = !!combat.ranged;
  // Both stances of both mechs, made once a battle: the swap on the reveal mustn't wait on a redraw.
  const arts = useMemo(() => {
    const art = (mech: number, plate: string, flip: boolean, stance: FighterStance) => ({
      standing: dataUrl(mechFighterSvg(mech, { flip, plate, stance })),
      struck: dataUrl(mechFighterSvg(mech, { flip, plate, stance: 'struck' })),
    });
    return { attacker: art(a.mech, ac, false, ranged ? 'aim' : 'ready'), defender: art(d.mech, dc, true, 'ready') };
  }, [a.mech, ac, d.mech, dc, ranged]);
  const muzzle = useMemo(() => (ranged ? fighterMuzzle(a.mech, 'aim') : undefined), [a.mech, ranged]);
  const repelled = !!winner && !destroyed;
  const bounced = repelled && !ranged;
  const missed = ranged && winner === 'defender';
  const fighter = (role: CombatRole) => {
    const hit = destroyed === role;
    const attacker = role === 'attacker';
    const stamp = hit ? 'Destroyed' : repelled && attacker ? (ranged ? 'Missed' : 'Repelled') : null;
    return (
      <div className={`arena-fighter ${role}`}>
        <img
          className={`arena-mech ${destroyed && !hit ? 'won' : ''} ${hit ? 'destroyed' : ''} ${bounced && attacker ? 'repelled' : ''}`}
          src={hit ? arts[role].struck : arts[role].standing}
          alt={`${whose(game.players[combat[role].player].name)} ${mechOf(game, combat[role].mech).name}`}
        />
        {hit && <span className="arena-blast" />}
        {bounced && !attacker && <span className="arena-guard" />}
        {stamp && <span className={`arena-stamp ${hit ? 'fatal' : ''}`}>{stamp}</span>}
      </div>
    );
  };
  return (
    <div
      className={['combat-arena', ranged && 'ranged', winner && 'clash', missed && 'missed', destroyed && 'fatal']
        .filter(Boolean)
        .join(' ')}
      style={{ '--sky': SKY[game.board.world], '--ground': GROUND_BASE[game.board.world] } as CSSProperties}
    >
      {fighter('attacker')}
      {ranged && winner && <span className="arena-tracer" style={{ '--muzzle-x': muzzle?.x, '--muzzle-y': muzzle?.y } as CSSProperties} />}
      {fighter('defender')}
    </div>
  );
}
