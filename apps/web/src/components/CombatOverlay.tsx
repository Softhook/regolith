import { useEffect, useState, type CSSProperties } from 'react';
import {
  cardName,
  shipOf,
  canRespondToCombat,
  combatOutcome,
  missileOffered,
  signed,
  tryApply,
  type Action,
  type CombatPending,
  type CombatRole,
  type GameState,
  type PlayerId,
  type PlayerState,
} from '@regolith/engine';
import { combatStage } from '@regolith/online';
import type { Dispatch } from '../game/useGame';
import type { GameView } from '../game/view';
import { COMBAT_RESOLVE_MS, humanFights } from '../game/useAiDriver';
import { shotWait } from '../game/strike';
import { PHONE, reducedMotion, useMediaQuery } from '../game/useMediaQuery';
import { useShortcut } from '../game/useShortcut';
import { COMBAT_MS } from '../online/playback';
import { COMBAT_DICE } from '../theme';
import { MissileIcon } from './Card';
import { Die3D } from './Die3D';

const REVEAL_MS = 1250;

type Props = Parameters<typeof Battle>[0];

/** A shot's battle (a ranged attack) opens once its missile has crossed the map (board/Shots). */
export function CombatOverlay(props: Props) {
  const [wait] = useState(() => (reducedMotion() ? 0 : shotWait(props.combat)));
  const [landed, setLanded] = useState(!wait);
  useEffect(() => {
    if (!wait) return;
    const t = window.setTimeout(() => setLanded(true), wait);
    return () => window.clearTimeout(t);
  }, [wait]);
  return landed ? <Battle {...props} /> : null;
}

function Battle({
  game,
  combat,
  dispatch,
  mine,
  aiResponder,
  online,
}: {
  game: GameState;
  combat: CombatPending;
  dispatch: Dispatch;
  /** The players this screen responds for. */
  mine: (p: PlayerId) => boolean;
  /** On this device: the AI about to respond, so the battle can't be resolved yet. */
  aiResponder: PlayerId | null;
  /** Online: who the battle waits for; it resolves once everyone who may respond is done. */
  online?: GameView['combat'];
}) {
  const [revealed, setRevealed] = useState(false);
  const dieSize = useMediaQuery(PHONE) ? 40 : 64;
  useEffect(() => {
    setRevealed(false);
    const t = window.setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [combat.id]);

  const out = combatOutcome(game, combat);
  const A = game.players[combat.attacker.player];
  const D = game.players[combat.defender.player];
  const humans = game.players.filter((p) => (online ? online.responders.includes(p.id) : mine(p.id)));
  const shooters = humans.filter((p) => p.missiles > 0);
  const autoResolve = !humans.some((p) => canRespondToCombat(game, combat, p.id));
  const waitingNames = online
    ? online.waitingOn.map((id) => game.players[id].name).join(' and ')
    : aiResponder !== null
      ? game.players[aiResponder].name
      : undefined;
  // A battle nobody here can change stays up until OK (or a click beside it), so the player can
  // see how it went: online, it moves on once decided; here, OK resolves it. Battles no human here
  // fight in move on by themselves: online by playback, here by the AI driver (`timed`).
  const rawResolve = () => dispatch({ type: 'resolveCombat' });
  const resolve = close(rawResolve);
  const timed = !online && !humanFights(game, combat);
  const rawOk = online
    ? !online.mustAnswer && !waitingNames
      ? online.dismiss
      : undefined
    : autoResolve && !timed
      ? rawResolve
      : undefined;
  const ok = close(rawOk);
  const ready = revealed && aiResponder === null;
  // Enter or Escape is OK too; not held down (it would carry on into the next choice), nor on a
  // focused button (Enter presses that already). No click follows a key, so none is swallowed.
  useShortcut(
    (e) =>
      ready && !!rawOk && !e.repeat && (e.key === 'Enter' || e.key === 'Escape') && (e.target as HTMLElement | null)?.tagName !== 'BUTTON',
    (e) => {
      e.preventDefault();
      rawOk?.();
    },
  );
  const leader = out.attackerWins ? A : D;

  const side = (role: CombatRole) => {
    const s = combat[role];
    const p = game.players[s.player];
    const total = role === 'attacker' ? out.attacker : out.defender;
    const winning = revealed && (role === 'attacker') === out.attackerWins;
    // The dice show the ship and the roll; listed are only what else counts: a card that sets the
    // roll (not a missile: its die says so) and bonuses.
    const rollPart = total.parts.find((part) => part.kind === 'roll');
    const bonuses = total.parts.filter((part) => part.kind === 'modifier');
    const setBy = rollPart?.set && !s.missile && total.roll !== Math.min(...s.dice) ? rollPart.label : null;
    return (
      <div className={`combat-side ${role} ${winning ? 'winning' : ''}`} style={{ '--pc': p.color } as CSSProperties}>
        <div className="combat-who">
          <small>{role === 'attacker' ? 'Attacker' : 'Defender'}</small>
          <strong>{p.name}</strong>
        </div>
        <div className="combat-dice">
          <div className="combat-die-col">
            <Die3D value={s.ship} size={dieSize} color={p.color} sound={false} />
            <span>{shipOf(game, s.ship).name}</span>
          </div>
          <span className="combat-plus">+</span>
          <div className={`combat-die-col ${s.missile ? 'missiled' : ''}`}>
            <Die3D
              value={total.roll}
              size={dieSize}
              color={COMBAT_DICE[role].color}
              pip={COMBAT_DICE[role].pip}
              tumbleOnMount
              delay={role === 'attacker' ? 0 : 0.12}
              sound={role === 'attacker'}
            />
            <span>{s.missile ? 'Atomic' : role === 'attacker' ? 'Attack die' : 'Defence die'}</span>
          </div>
        </div>
        <ul className={`combat-parts ${revealed ? 'show' : ''}`}>
          {setBy && (
            <li>
              <span>{setBy}</span>
              <b>roll {total.roll}</b>
            </li>
          )}
          {bonuses.map((part, i) => (
            <li key={i}>
              <span>{part.label}</span>
              <b>{signed(part.value)}</b>
            </li>
          ))}
          {s.dice.length > 1 && !rollPart?.set && (
            <li className="muted">
              {cardName('brutal')}: rolled {s.dice.join(' & ')}
            </li>
          )}
        </ul>
        <div className={`combat-total ${revealed ? 'show' : ''}`}>{revealed ? total.total : '?'}</div>
        {revealed &&
          shooters.map((sh) => (
            <MissileButton key={sh.id} game={game} combat={combat} role={role} shooter={sh} named={humans.length > 1} dispatch={dispatch} />
          ))}
        {revealed && !s.missile && total.roll === 1 && shooters.some((sh) => sh.id === s.player) && (
          <p className="missile-note">{'Roll is already 1 — an atomic can’t help.'}</p>
        )}
      </div>
    );
  };

  return (
    <div className="overlay combat-overlay" onClick={(e) => ready && e.target === e.currentTarget && ok?.()}>
      <div className="combat-card">
        <h2>Battle</h2>
        <div className="combat-grid">
          {side('attacker')}
          <div className="combat-vs">VS</div>
          {side('defender')}
        </div>
        <p className="combat-rule">Lower total wins · attacker wins ties</p>
        <div className={`combat-verdict ${revealed ? 'show' : ''}`} style={{ '--pc': leader.color } as CSSProperties}>
          {revealed && (
            <>
              <strong>{leader.name}</strong>{' '}
              {out.stubborn
                ? `holds firm (${cardName('stubborn')})`
                : out.attackerWins
                  ? 'will destroy the defender'
                  : 'will repel the attack'}
            </>
          )}
        </div>
        <div className="combat-footer">
          {online?.mustAnswer ? (
            <button className="btn btn-primary" disabled={!revealed} onClick={close(online.pass)}>
              {autoResolve ? 'Continue' : 'Done — no response'}
            </button>
          ) : waitingNames ? (
            <p className="combat-waiting">
              <span className="spinner" /> Waiting for {waitingNames}…
            </p>
          ) : ok ? (
            <button className="btn btn-primary" disabled={!ready} onClick={ok}>
              OK
            </button>
          ) : online || timed ? (
            // The battle moves on by itself shortly; restarts when a missile changes it.
            <div className="autobar" key={combatStage(combat)}>
              <span style={{ animationDuration: `${online ? COMBAT_MS : COMBAT_RESOLVE_MS}ms` }} />
            </div>
          ) : (
            <button className="btn btn-primary" disabled={!ready} onClick={resolve}>
              Resolve battle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Closes the battle with `f`, then swallows clicks for a moment: a double click would otherwise
 * land on whatever is under the battle (a ship, a space, the next choice). Undefined stays so.
 */
function close(f: (() => void) | undefined): (() => void) | undefined {
  if (!f) return undefined;
  return () => {
    const stop = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', stop, true);
    window.setTimeout(() => window.removeEventListener('click', stop, true), 400);
    f();
  };
}

/**
 * A missile sets one combat roll to 1. Lower totals win, so firing at your opponent's roll
 * only helps them: combatants are offered their own roll only, and not while already winning.
 * Players not in the battle may not fire (engine missileOffered).
 * Each button previews the battle result if fired.
 */
function MissileButton({
  game,
  combat,
  role,
  shooter,
  named,
  dispatch,
}: {
  game: GameState;
  combat: CombatPending;
  role: CombatRole;
  shooter: PlayerState;
  named: boolean;
  dispatch: Dispatch;
}) {
  if (!missileOffered(game, combat, shooter.id, role)) return null;
  const action: Action = { type: 'missile', by: shooter.id, side: role };
  const next = tryApply(game, action);
  const nextCombat = next?.pending[0];
  if (!next || nextCombat?.kind !== 'combat') return null;

  // Offered only on the shooter's own roll while losing, so the missile either flips the battle or doesn't.
  const after = combatOutcome(next, nextCombat);
  const attacking = role === 'attacker';
  const flips = attacking === after.attackerWins;
  const [mine, theirs] = attacking ? [after.attacker.total, after.defender.total] : [after.defender.total, after.attacker.total];
  const who = named ? shooter.name : 'you';
  const verdict = `${who} ${flips ? 'would win' : 'would still lose'} ${mine} vs ${theirs}`;

  return (
    <button className={`btn btn-missile ${flips ? 'decisive' : ''}`} onClick={() => dispatch(action)}>
      <span>
        <MissileIcon /> {named ? `${shooter.name}: ` : ''}
        {'Fire atomic — your roll becomes 1'}
      </span>
      <small>{verdict}</small>
    </button>
  );
}
