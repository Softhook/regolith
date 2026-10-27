import { canMoveDie, canUseAbility, card, die, hasSkill, movementRange, say, shipOf, skillCard, type GameState } from '@regolith/engine';
import type { Controller } from '../game/controller';
import type { Dispatch } from '../game/useGame';
import { Die3D } from './Die3D';
import { Tip } from './InfoPop';

/** Actions for the selected ship: its ability, Reconfigure, and skills that act on one ship. */
export function ShipPanel({ game, ctl, dispatch }: { game: GameState; ctl: Controller; dispatch: Dispatch }) {
  const { sel, legal } = ctl;
  if (!('die' in sel) || !ctl.actionPhase) return null;
  const d = game.dice.find((x) => x.id === sel.die);
  if (!d) return null;
  const t = game.turn;
  const me = t.player;
  const onBoard = d.loc.zone === 'board';
  const used = !canUseAbility(game, d);
  const secondUse = !used && !!t.abilityUsed[d.id];
  const tacticalId = skillCard(game, me, 'tactical') ?? skillCard(game, me, 'tactical-original');
  const mine = (a: { die: string }) => a.die === d.id;
  const ship = shipOf(game, d.value);
  const words = (text: string) => say(game, text);
  const ability = { name: words(ship.ability.name), text: words(ship.ability.text) };
  // A prototype power (hooks, no built-in power) is never "used this turn".
  const passive = !ship.power;
  const cancel = () => ctl.select({ kind: 'none' });
  // The cards in the odds shown on the ships it may attack (the same for most targets).
  const factors = [
    ...new Set(
      [...ctl.attacks].flatMap(([id, a]) => {
        const owner = game.players[die(game, id).owner].name;
        return [...a.factors.attacker, ...a.factors.defender.map((f) => `${owner}'s ${f}`)];
      }),
    ),
  ];
  const oddsNote = factors.length ? `Attack odds count ${factors.join(' · ')}` : null;

  const abilityButton = () => {
    if (!onBoard) return null;
    if (ship.hooks?.action) {
      return (
        <button
          className="btn"
          disabled={!legal.can('power', mine)}
          onClick={() => ctl.select({ kind: 'power', die: d.id })}
          title={legal.can('power', mine) ? ability.text : `${ability.name} unavailable now. ${ability.text}`}
        >
          {ability.name}
        </button>
      );
    }
    if (used) return null;
    switch (ship.power) {
      case 'strike':
        return (
          <button className="btn" disabled={!legal.can('freeAttack', mine)} onClick={() => ctl.select({ kind: 'freeAttack', die: d.id })}>
            Free attack
          </button>
        );
      case 'transport':
        return (
          <button
            className="btn"
            disabled={!legal.can('carry', mine)}
            onClick={() => ctl.select({ kind: 'carryPassenger', die: d.id })}
            aria-label="Carry & move"
          >
            <Label long="Carry & move" short="Carry" />
          </button>
        );
      case 'warp':
        return (
          <button
            className="btn"
            disabled={!legal.can('swap', mine)}
            onClick={() => ctl.select({ kind: 'swap', die: d.id })}
            aria-label="Switch places"
          >
            <Label long="Switch places" short="Switch" />
          </button>
        );
      case 'modify':
        return ([3, 5] as const).map((value) => (
          <button
            key={value}
            className="btn"
            disabled={!legal.can('change', (a) => mine(a) && a.value === value)}
            onClick={() => dispatch({ type: 'change', die: d.id, value })}
            aria-label={`Become ${value}`}
            title={`Become ${value}`}
          >
            <Label long={`Become ${value}`} short={`→ ${value}`} />
          </button>
        ));
      case 'freeReconfigure':
        return (
          <button
            className="btn"
            disabled={!legal.can('freeReconfigure', mine)}
            onClick={() => dispatch({ type: 'freeReconfigure', die: d.id })}
            aria-label={words('Free Reconfigure')}
          >
            <Label long={words('Free Reconfigure')} short={words('Reconfigure')} />
          </button>
        );
    }
    return null;
  };

  return (
    <div className="ship-panel">
      <div className="ship-panel-head">
        <Die3D value={d.value} rolls={d.rolls} size={34} color={game.players[d.owner].color} sound={false} />
        {/* On phones the ability text below is hidden: a tap on the name shows it. */}
        <Tip
          as="div"
          className="ship-name"
          tip={
            <>
              <span>{`${ability.name}: ${used && !passive ? 'used this turn' : ability.text}`}</span>
              {oddsNote && <span className="muted">{oddsNote}</span>}
            </>
          }
        >
          <strong>{ship.name}</strong>
          <small>
            {onBoard ? `Moves ${movementRange(game, d)} · ${canMoveDie(game, d) ? 'ready' : 'already moved'}` : words('In scrapyard')}
          </small>
        </Tip>
        <button className="icon-btn" onClick={cancel} aria-label="Deselect">
          ×
        </button>
      </div>
      <p className="ship-ability">
        <b>{ability.name}</b> {used && !passive ? '— used this turn' : `— ${ability.text}`}
        {secondUse && !passive && <em className="muted"> (second use via Cunning)</em>}
      </p>
      {oddsNote && <p className="ship-odds-note">{oddsNote}</p>}
      <div className="turn-actions">
        {abilityButton()}
        <button
          className="btn"
          disabled={!legal.can('reconfigure', mine)}
          onClick={() => dispatch({ type: 'reconfigure', die: d.id })}
          title={words('Spend 1 action to re-roll this ship to a new number.')}
        >
          {words('Reconfigure')}
        </button>
        {tacticalId && legal.can('tactical', (a) => mine(a) && !a.passenger) && (
          <button
            className="btn"
            onClick={() => ctl.select({ kind: 'tactical', die: d.id })}
            title={words(card(tacticalId).text)}
            aria-label="Tactical step"
          >
            <Label long="Tactical step" short="Tactical" />
          </button>
        )}
        {tacticalId && legal.can('tactical', (a) => mine(a) && !!a.passenger) && (
          <button
            className="btn"
            onClick={() => ctl.select({ kind: 'carryPassenger', die: d.id, tactical: true })}
            title={words(`${card(tacticalId).text} The ${ship.name} may transport a ship over that 1 space.`)}
            aria-label="Tactical carry"
          >
            <Label long="Tactical carry" short="Tac. carry" />
          </button>
        )}
        {onBoard && hasSkill(game, me, 'flexible') && (
          <>
            <button
              className="btn"
              disabled={!legal.can('flexible', (a) => mine(a) && a.delta === -1)}
              onClick={() => dispatch({ type: 'flexible', die: d.id, delta: -1 })}
            >
              −1
            </button>
            <button
              className="btn"
              disabled={!legal.can('flexible', (a) => mine(a) && a.delta === 1)}
              onClick={() => dispatch({ type: 'flexible', die: d.id, delta: 1 })}
            >
              +1
            </button>
          </>
        )}
        {legal.can('nomadic', mine) && (
          <button
            className="btn"
            onClick={() => ctl.select({ kind: 'nomadic', die: d.id })}
            title={words(card(skillCard(game, me, 'nomadic')!).text)}
          >
            Nomadic
          </button>
        )}
        {legal.can('resourceful', mine) && (
          <button
            className="btn"
            onClick={() => dispatch({ type: 'resourceful', die: d.id })}
            title={words(card('resourceful').text)}
            aria-label="Sacrifice +1 action"
          >
            <Label long="Sacrifice +1 action" short="Sacrifice" />
          </button>
        )}
      </div>
    </div>
  );
}

/** A button's label, and a shorter one for when the selected ship's row is narrow (a phone's turn panel). */
function Label({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className="label-long">{long}</span>
      <span className="label-short">{short}</span>
    </>
  );
}
