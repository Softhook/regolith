import { useEffect, useState } from 'react';
import {
  cardName,
  canRespondToCombat,
  combatOutcome,
  atomicOffered,
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
import { useBattleReveal, useBattleSounds } from '../game/useBattleReveal';
import { COMPACT_BATTLE, useMediaQuery } from '../game/useMediaQuery';
import { useShortcut } from '../game/useShortcut';
import { COMBAT_MS } from '../online/playback';
import { AtomicIcon } from './Card';
import { BattleArena } from './BattleArena';
import { BattleSide } from './BattleSide';
import { BattleVerdict } from './BattleVerdict';

type Props = Parameters<typeof Battle>[0];

/** A shot's battle (a ranged attack) opens once its atomic has crossed the map (board/Shots). */
export function CombatOverlay(props: Props) {
  const [wait] = useState(() => shotWait(props.combat));
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
  const revealed = useBattleReveal(combat);
  const compact = useMediaQuery(COMPACT_BATTLE);

  const out = combatOutcome(game, combat);
  useBattleSounds(revealed, combat, out, mine);
  const humans = game.players.filter((p) => (online ? online.responders.includes(p.id) : mine(p.id)));
  const shooters = humans.filter((p) => p.atomics > 0);
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

  const side = (role: CombatRole) => {
    const s = combat[role];
    const total = out[role];
    // The dice show the mech and the roll; listed are only what else counts: a card that sets the
    // roll (not an atomic: its die says so) and bonuses.
    const rollPart = total.parts.find((part) => part.kind === 'roll');
    const bonuses = total.parts.filter((part) => part.kind === 'modifier');
    const setBy = rollPart?.set && !s.atomic && total.roll !== Math.min(...s.dice) ? rollPart.label : null;
    return (
      <BattleSide
        game={game}
        combat={combat}
        out={out}
        role={role}
        revealed={revealed}
        dieSize={compact ? 40 : 64}
        sound
        parts={
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
                {cardName('paired-cannons')}: rolled {s.dice.join(' & ')}
              </li>
            )}
          </ul>
        }
      >
        {revealed &&
          shooters.map((sh) => (
            <AtomicButton key={sh.id} game={game} combat={combat} role={role} shooter={sh} named={humans.length > 1} dispatch={dispatch} />
          ))}
        {revealed && !s.atomic && total.roll === 1 && shooters.some((sh) => sh.id === s.player) && (
          <p className="atomic-note">{'Roll is already 1 — an atomic can’t help.'}</p>
        )}
      </BattleSide>
    );
  };

  return (
    <div className={`overlay combat-overlay ${compact ? 'compact' : ''}`} onClick={(e) => ready && e.target === e.currentTarget && ok?.()}>
      <div className="combat-card">
        <h2>Battle</h2>
        <BattleArena game={game} combat={combat} out={out} revealed={revealed} />
        <div className="combat-grid">
          {side('attacker')}
          <div className="combat-vs">VS</div>
          {side('defender')}
        </div>
        <p className="combat-rule">Lower total wins · attacker wins ties</p>
        <BattleVerdict game={game} combat={combat} out={out} revealed={revealed} />
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
            // The battle moves on by itself shortly; restarts when an atomic changes it.
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
 * land on whatever is under the battle (a mech, a space, the next choice). Undefined stays so.
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
 * An atomic sets one combat roll to 1. Lower totals win, so firing at your opponent's roll
 * only helps them: combatants are offered their own roll only, and not while already winning.
 * Players not in the battle may not fire (engine atomicOffered).
 * Each button previews the battle result if fired.
 */
function AtomicButton({
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
  if (!atomicOffered(game, combat, shooter.id, role)) return null;
  const action: Action = { type: 'atomic', by: shooter.id, side: role };
  const next = tryApply(game, action);
  const nextCombat = next?.pending[0];
  if (!next || nextCombat?.kind !== 'combat') return null;

  // Offered only on the shooter's own roll while losing, so the atomic either flips the battle or doesn't.
  const after = combatOutcome(next, nextCombat);
  const attacking = role === 'attacker';
  const flips = attacking === after.attackerWins;
  const [mine, theirs] = attacking ? [after.attacker.total, after.defender.total] : [after.defender.total, after.attacker.total];
  const who = named ? shooter.name : 'you';
  const verdict = `${who} ${flips ? 'would win' : 'would still lose'} ${mine} vs ${theirs}`;

  return (
    <button className={`btn btn-atomic ${flips ? 'decisive' : ''}`} onClick={() => dispatch(action)}>
      <span>
        <AtomicIcon /> {named ? `${shooter.name}: ` : ''}
        {'Fire atomic — your roll becomes 1'}
      </span>
      <small>{verdict}</small>
    </button>
  );
}
