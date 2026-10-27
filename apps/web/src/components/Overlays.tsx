import { useEffect, useState, type CSSProperties } from 'react';
import { CARD_CATEGORIES } from '@regolith/art';
import { cardName, shipOf, card, die, rulesOf, scrapyard, type Action, type ActionOf, type GameState } from '@regolith/engine';
import { SHORT, useMediaQuery } from '../game/useMediaQuery';
import type { Dispatch } from '../game/useGame';
import { CardView, CategoryIcon, categoryStyle } from './Card';
import { Dialog, Modal } from './Dialog';
import { Die3D } from './Die3D';
import { cubeCount } from './board/EffectBox';
import { AiTag } from './PlayerList';
import { Fireworks } from './fireworks/Fireworks';

/** Modal decisions for human players. Board-based decisions are handled by highlights instead. */
export function DecisionOverlay({ game, dispatch, human }: { game: GameState; dispatch: Dispatch; human: boolean }) {
  const head = game.pending[0];
  if (!head || !human) return null;
  switch (head.kind) {
    case 'setupRoll':
      return <SetupRoll game={game} dispatch={dispatch} player={head.player} rerolled={head.rerolled} />;
    case 'skillDraft':
      return (
        <Modal
          title="Choose your starting skill"
          subtitle={`${game.players[head.player].name}, keep one. The other returns to the bottom of the deck.`}
          pc={game.players[head.player].color}
        >
          <div className="card-choice">
            {head.options.map((id) => (
              <CardView key={id} id={id} size="lg" onClick={() => dispatch({ type: 'draftSkill', skill: id })} />
            ))}
          </div>
        </Modal>
      );
    case 'peek':
      return (
        <Modal
          title="Peek"
          subtitle="You chose the oldest card. Take it, or the top card of the deck instead."
          pc={game.players[head.player].color}
        >
          <div className="card-choice">
            <div className="choice-col">
              <small>Face-up</small>
              <CardView
                id={(head.deck === 'skill' ? game.market.skillRow : game.market.tacticRow)[2]}
                size="lg"
                onClick={() => dispatch({ type: 'peekChoice', takeTop: false })}
              />
            </div>
            <div className="choice-col">
              <small>Top of deck</small>
              <CardView id={head.top} size="lg" className="flip-in" onClick={() => dispatch({ type: 'peekChoice', takeTop: true })} />
            </div>
          </div>
        </Modal>
      );
    case 'discardSkill': {
      const p = game.players[head.player];
      return (
        <Modal
          title={`Too many ${rulesOf(game).cards?.terms.skills ?? 'skills'}`}
          subtitle={`${p.name}, choose a card to discard.`}
          pc={p.color}
        >
          <div className="card-choice wrap">
            {p.skills.map((s, i) => (
              <CardView key={`${s.id}${i}`} id={s.id} size="md" onClick={() => dispatch({ type: 'discardSkill', skill: s.id })} />
            ))}
          </div>
        </Modal>
      );
    }
    case 'changeOfHeart':
      return (
        <Modal
          title={cardName('change-of-heart')}
          subtitle="Search the Skill deck and take any skill."
          pc={game.players[head.player].color}
          wide
        >
          <SkillsByCategory ids={[...new Set(game.market.skillDeck)]} onPick={(id) => dispatch({ type: 'changeOfHeart', skill: id })} />
        </Modal>
      );
    case 'dangerous': {
      const p = game.players[head.player];
      const att = die(game, head.attacker);
      const def = die(game, head.defender);
      return (
        <Modal
          title={cardName('dangerous')}
          subtitle={`${game.players[att.owner].name}'s ${shipOf(game, att.value).name} attacks your ${shipOf(game, def.value).name}. Before the dice are rolled, you may destroy both mechs (no power change).`}
          pc={p.color}
        >
          <div className="modal-actions">
            <button className="btn" onClick={() => dispatch({ type: 'dangerous', destroy: false })}>
              Fight
            </button>
            <button className="btn btn-primary" onClick={() => dispatch({ type: 'dangerous', destroy: true })}>
              {'Destroy both mechs'}
            </button>
          </div>
        </Modal>
      );
    }
    case 'clever': {
      const p = game.players[head.player];
      const d = die(game, head.die);
      const isCalculating = head.source === 'calculating';
      const title = isCalculating ? cardName('calculating') : cardName('clever');
      const subtitle = isCalculating
        ? `${p.name}, choose this mech’s number (1–6) for the salvage yard.`
        : `${p.name}, keep this mech’s number or change it by 1.`;
      return (
        <Modal title={title} subtitle={subtitle} pc={p.color}>
          <div className="fleet-roll clever-row">
            {(head.options ?? [1, 2, 3, 4, 5, 6]).map((value) => (
              <button key={value} className="fleet-die clever-choice" onClick={() => dispatch({ type: 'clever', value })}>
                <Die3D value={value} size={54} color={p.color} sound={false} />
                <span className="show">{shipOf(game, value).name}</span>
              </button>
            ))}
          </div>
          {d.loc.zone === 'scrapyard' && <p className="modal-sub">{'The mech goes to your salvage yard.'}</p>}
        </Modal>
      );
    }
    case 'prideful': {
      const p = game.players[head.player];
      const victim = game.players[head.victim];
      return (
        <Modal
          title={cardName('prideful')}
          subtitle={`${p.name}, you destroyed ${victim.name}’s mech. You may take ${cardName('prideful')} from them.`}
          pc={p.color}
        >
          <div className="modal-actions">
            <button className="btn" onClick={() => dispatch({ type: 'prideful', take: false })}>
              Decline
            </button>
            <button className="btn btn-primary" onClick={() => dispatch({ type: 'prideful', take: true })}>
              Take Prideful
            </button>
          </div>
        </Modal>
      );
    }
    case 'ruthless': {
      const p = game.players[head.player];
      const victim = game.players[head.victim];
      return (
        <Modal
          title={cardName('ruthless')}
          subtitle={`${p.name}, you destroyed an enemy mech. Choose one of ${victim.name}’s skills to disable until the start of your next turn.`}
          pc={p.color}
        >
          <div className="modal-actions">
            <button className="btn" onClick={() => dispatch({ type: 'ruthless' })}>
              Skip
            </button>
            {victim.skills
              .filter((s) => s.active)
              .map((s) => (
                <button key={s.id} className="btn btn-primary" onClick={() => dispatch({ type: 'ruthless', skill: s.id })}>
                  Disable {card(s.id).name}
                </button>
              ))}
          </div>
        </Modal>
      );
    }
    default:
      return null;
  }
}

/**
 * A whole deck of skills to choose from (Change of Heart): grouped under their categories, A–Z within each, and
 * every card's whole text shown, since this is where it's read and compared.
 */
function SkillsByCategory({ ids, onPick }: { ids: string[]; onPick: (id: string) => void }) {
  const order = Object.keys(CARD_CATEGORIES);
  const rank = (category: string) => (order.includes(category) ? order.indexOf(category) : order.length);
  const groups = new Map<string, string[]>();
  for (const id of [...ids].sort((a, b) => card(a).name.localeCompare(card(b).name))) {
    const category = card(id).category;
    groups.set(category, [...(groups.get(category) ?? []), id]);
  }
  return (
    <div className="skill-groups">
      {[...groups]
        .sort(([a], [b]) => rank(a) - rank(b))
        .map(([category, cards]) => (
          <section key={category} className="skill-group" style={categoryStyle(category, false)}>
            <h3>
              <CategoryIcon category={category} />
              {CARD_CATEGORIES[category]?.label ?? category}
            </h3>
            <div className="skill-group-cards">
              {cards.map((id) => (
                <CardView key={id} id={id} size="sm" onClick={() => onPick(id)} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function SetupRoll({ game, dispatch, player, rerolled }: { game: GameState; dispatch: Dispatch; player: number; rerolled: boolean }) {
  const p = game.players[player];
  const dice = scrapyard(game, player);
  const sum = dice.reduce((a, d) => a + d.value, 0);
  const [landed, setLanded] = useState(false);
  // Smaller dice on short screens (phone landscape), so Keep fleet stays on screen. Matches styles.css.
  const dieSize = useMediaQuery(SHORT) ? 54 : 78;
  const rollKey = dice.map((d) => d.rolls).join();
  useEffect(() => {
    setLanded(false);
    const t = window.setTimeout(() => setLanded(true), 1350);
    return () => window.clearTimeout(t);
  }, [rollKey]);

  return (
    <Modal
      title="Roll your fleet"
      subtitle={`${p.name}, these three dice are your starting mechs. The lowest fleet total plays first.`}
      pc={p.color}
    >
      <div className="fleet-roll">
        {dice.map((d, i) => (
          <div key={d.id} className="fleet-die">
            <Die3D value={d.value} rolls={d.rolls} size={dieSize} color={p.color} tumbleOnMount delay={i * 0.12} sound={i === 0} />
            <span className={landed ? 'show' : ''}>{shipOf(game, d.value).name}</span>
          </div>
        ))}
      </div>
      <p className={`fleet-sum ${landed ? 'show' : ''}`}>
        Fleet total <b>{sum}</b>
      </p>
      <div className="modal-actions">
        <button
          className="btn"
          disabled={rerolled || !landed}
          onClick={() => dispatch({ type: 'setupReroll' })}
          title="You may re-roll once, but must re-roll all three."
        >
          {rerolled ? 'Re-roll used' : 'Re-roll all (once)'}
        </button>
        <button className="btn btn-primary" disabled={!landed} onClick={() => dispatch({ type: 'setupKeep' })}>
          Keep fleet
        </button>
      </div>
    </Modal>
  );
}

/**
 * How to conquer a planet that offers more than one way: an empty place, or over-conquest displacing
 * one opponent's cube (the conqueror chooses whose). `options` are the legal `conquer` actions for it.
 */
export function ConquerChoice({
  game,
  options,
  dispatch,
  onClose,
}: {
  game: GameState;
  options: ActionOf<'conquer'>[];
  dispatch: Dispatch;
  onClose: () => void;
}) {
  const planet = game.board.planets[options[0].planet];
  const plain = options.some((a) => a.replace === undefined);
  const pick = (a: Action) => {
    if (dispatch(a)) onClose();
  };
  return (
    <Dialog
      title={`Claim objective ${planet.number}`}
      subtitle={plain ? 'Take an empty place, or displace an opponent’s cube.' : 'The objective is full: choose whose cube to displace.'}
      onClose={onClose}
    >
      <div className="modal-actions">
        {options.map((a) =>
          a.replace === undefined ? (
            <button key="plain" className="btn btn-primary" onClick={() => pick(a)}>
              Take an empty place
            </button>
          ) : (
            <button key={a.replace} className="btn" style={{ borderColor: game.players[a.replace].color }} onClick={() => pick(a)}>
              Displace {game.players[a.replace].name}’s cube
            </button>
          ),
        )}
      </div>
    </Dialog>
  );
}

/**
 * `newLabel`: what leaving the finished game is called ("New game", or "Back to lobby" online). A winner (or
 * an onlooker) gets fireworks; a player who `lost` sees the board drain of colour instead.
 */
export function GameOver({
  game,
  lost,
  onNew,
  onClose,
  newLabel = 'New game',
}: {
  game: GameState;
  lost: boolean;
  onNew: () => void;
  onClose: () => void;
  newLabel?: string;
}) {
  if (game.winner === null) return null;
  const w = game.players[game.winner];
  return (
    <div className={`overlay ${lost ? 'mourn' : 'celebrate'}`}>
      {!lost && (
        <>
          <Fireworks color={w.color} />
          <div className="gameover-flash" style={{ '--pc': w.color } as CSSProperties} />
        </>
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gameover-title"
        className="modal gameover"
        style={{ '--pc': w.color } as CSSProperties}
      >
        {!lost && <div className="gameover-burst" />}
        <small>{lost ? 'Defeat' : 'Victory'}</small>
        <h2 id="gameover-title">{w.name} claims the sector</h2>
        <p className="modal-sub">
          All cubes placed after {game.turn.number} turn{game.turn.number === 1 ? '' : 's'}.
        </p>
        <GameStats game={game} />
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            View board
          </button>
          <button className="btn btn-primary" onClick={onNew}>
            {newLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Each player's game in numbers, winner first, then by cubes placed. A game saved before stats were kept
 * shows the cubes alone.
 */
function GameStats({ game }: { game: GameState }) {
  const cubes = game.players.map((p) => game.board.planets.reduce((n, pl) => n + cubeCount(pl.cubes, p.id), 0));
  const players = [...game.players].sort(
    (a, b) => Number(b.id === game.winner) - Number(a.id === game.winner) || cubes[b.id] - cubes[a.id],
  );
  const kept = game.players.every((p) => p.stats);
  const cards = kept && !!rulesOf(game).cards;
  return (
    <table className="gameover-stats">
      <thead>
        <tr>
          <th />
          <th title={'Cubes on objectives'}>Cubes</th>
          {kept && (
            <>
              <th title={'Objectives claimed'}>{'Objectives'}</th>
              <th title="Battles won – lost">Battles</th>
              <th title={'Enemy mechs destroyed – own mechs lost'}>{'Mechs'}</th>
            </>
          )}
          {cards && <th title="Cards gained">Cards</th>}
        </tr>
      </thead>
      <tbody>
        {players.map((p) => {
          const { id, name, color, stats: st } = p;
          return (
            <tr key={id} style={{ '--pc': color } as CSSProperties}>
              <th scope="row">
                {name}
                {id === game.winner && ' ★'}
                {p.ai && <AiTag p={p} />}
              </th>
              <td>{cubes[id]}</td>
              {kept && (
                <>
                  <td>{st!.planetsTaken}</td>
                  <td>
                    {st!.battlesWon}–{st!.battlesLost}
                  </td>
                  <td>
                    {st!.shipsDestroyed}–{st!.shipsLost}
                  </td>
                </>
              )}
              {cards && <td>{st!.cardsTaken}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
