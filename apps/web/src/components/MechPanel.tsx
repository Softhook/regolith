import {
  cardName,
  canMoveDie,
  canUseAbility,
  card,
  die,
  hasSkill,
  movementRange,
  mechOf,
  skillCard,
  type GameState,
} from '@regolith/engine';
import type { Controller } from '../game/controller';
import type { Dispatch } from '../game/useGame';
import { Die3D } from './Die3D';
import { Tip } from './InfoPop';

/** Actions for the selected mech: its ability, Refit, and skills that act on one mech. */
export function MechPanel({ game, ctl, dispatch }: { game: GameState; ctl: Controller; dispatch: Dispatch }) {
  const { sel, legal } = ctl;
  if (!('die' in sel) || !ctl.actionPhase) return null;
  const d = game.dice.find((x) => x.id === sel.die);
  if (!d) return null;
  const t = game.turn;
  const me = t.player;
  const onBoard = d.loc.zone === 'board';
  const used = !canUseAbility(game, d);
  const secondUse = !used && !!t.abilityUsed[d.id];
  const tacticalId = skillCard(game, me, 'tactical');
  const mine = (a: { die: string }) => a.die === d.id;
  const mech = mechOf(game, d.value);
  const ability = mech.ability;
  // An ability with hooks and no built-in one is never "used this turn".
  const passive = !mech.builtIn;
  const cancel = () => ctl.select({ kind: 'none' });
  // The cards in the odds shown on the mechs it may attack (the same for most targets).
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
    if (mech.hooks?.action) {
      return (
        <button
          className="btn"
          disabled={!legal.can('ability', mine)}
          onClick={() => ctl.select({ kind: 'ability', die: d.id })}
          title={legal.can('ability', mine) ? ability.text : `${ability.name} unavailable now. ${ability.text}`}
        >
          {ability.name}
        </button>
      );
    }
    if (used) return null;
    switch (mech.builtIn) {
      case 'freeAttack':
        return (
          <button className="btn" disabled={!legal.can('freeAttack', mine)} onClick={() => ctl.select({ kind: 'freeAttack', die: d.id })}>
            Free attack
          </button>
        );
      case 'carry':
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
      case 'swap':
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
      case 'change':
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
    }
    return null;
  };

  return (
    <div className="mech-panel">
      <div className="mech-panel-head">
        <Die3D value={d.value} rolls={d.rolls} size={34} color={game.players[d.owner].color} sound={false} />
        {/* On phones the ability text below is hidden: a tap on the name shows it. */}
        <Tip
          as="div"
          className="mech-name"
          tip={
            <>
              <span>{`${ability.name}: ${used && !passive ? 'used this turn' : ability.text}`}</span>
              {oddsNote && <span className="muted">{oddsNote}</span>}
            </>
          }
        >
          <strong>{mech.name}</strong>
          <small>
            {onBoard ? `Moves ${movementRange(game, d)} · ${canMoveDie(game, d) ? 'ready' : 'already moved'}` : 'In salvage yard'}
          </small>
        </Tip>
        <button className="icon-btn" onClick={cancel} aria-label="Deselect">
          ×
        </button>
      </div>
      <p className="mech-ability">
        <b>{ability.name}</b> {used && !passive ? '— used this turn' : `— ${ability.text}`}
        {secondUse && !passive && <em className="muted"> (second use via {cardName('cunning')})</em>}
      </p>
      {oddsNote && <p className="mech-odds-note">{oddsNote}</p>}
      <div className="turn-actions">
        {abilityButton()}
        <button
          className="btn"
          disabled={!legal.can('refit', mine)}
          onClick={() => dispatch({ type: 'refit', die: d.id })}
          title={'Spend 1 action to re-roll this mech to a new number.'}
        >
          {'Refit'}
        </button>
        {tacticalId && legal.can('tactical', (a) => mine(a) && !a.passenger) && (
          <button
            className="btn"
            onClick={() => ctl.select({ kind: 'tactical', die: d.id })}
            title={card(tacticalId).text}
            aria-label={`${cardName('tactical')} step`}
          >
            <Label long={`${cardName('tactical')} step`} short={cardName('tactical')} />
          </button>
        )}
        {tacticalId && legal.can('tactical', (a) => mine(a) && !!a.passenger) && (
          <button
            className="btn"
            onClick={() => ctl.select({ kind: 'carryPassenger', die: d.id, tactical: true })}
            title={`${card(tacticalId).text} The ${mech.name} may carry a mech over that 1 space.`}
            aria-label={`${cardName('tactical')} carry`}
          >
            <Label long={`${cardName('tactical')} carry`} short="Carry" />
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
        {legal.can('resourceful', mine) && (
          <button
            className="btn"
            onClick={() => dispatch({ type: 'resourceful', die: d.id })}
            title={card(skillCard(game, me, 'resourceful')!).text}
            aria-label="Sacrifice +1 action"
          >
            <Label long="Sacrifice +1 action" short="Sacrifice" />
          </button>
        )}
      </div>
    </div>
  );
}

/** A button's label, and a shorter one for when the selected mech's row is narrow (a phone's turn panel). */
function Label({ long, short }: { long: string; short: string }) {
  return (
    <>
      <span className="label-long">{long}</span>
      <span className="label-short">{short}</span>
    </>
  );
}
