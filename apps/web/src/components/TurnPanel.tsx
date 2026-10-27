import type { CSSProperties } from 'react';
import { cardName, canCurious, card, rulesOf, skillCard, type GameState, type SkillEffect } from '@regolith/engine';
import type { Controller } from '../game/controller';
import { hintFor } from '../game/hints';
import type { Dispatch } from '../game/useGame';
import { useShortcut } from '../game/useShortcut';
import { ActionHex, CategoryIcon } from './Card';
import { Tip } from './InfoPop';
import { Scrapyard, turnScrapOwner } from './Scrapyard';
import { ShipPanel } from './ShipPanel';

export function TurnPanel({ game, ctl, dispatch, undo }: { game: GameState; ctl: Controller; dispatch: Dispatch; undo?: () => void }) {
  const t = game.turn;
  const p = game.players[t.player];
  const head = game.pending[0];
  const { legal } = ctl;
  const canAct = ctl.actionPhase;
  const hint = ctl.human ? hintFor(game, ctl.sel) : '';
  const waitingOn = head && head.kind !== 'combat' ? game.players[head.player] : null;
  // Whose decision the table waits for (battles have their own overlay).
  const waitingFor = waitingOn ?? (!head && game.phase !== 'over' ? p : null);
  // In setup the panel is about whoever is placing, who needn't be the turn's player; name and colour agree.
  const shown = game.phase === 'setup' && waitingOn ? waitingOn : p;
  // A decision on this device (advance, place an expansion, unveil) replaces the turn's buttons, which can't be used meanwhile.
  const deciding = !!head && head.kind !== 'combat' && ctl.human && !legal.can('endTurn');

  return (
    <section className="panel turn-panel" style={{ '--pc': shown.color } as CSSProperties}>
      <div className="turn-head">
        <div className="turn-title">
          {(game.phase === 'setup' || t.bonus) && <small>{game.phase === 'setup' ? 'Setup' : 'Bonus turn'}</small>}
          <strong>{shown.name}</strong>
        </div>
        {game.phase === 'play' && (
          <Tip as="div" className="action-pips" data-fx="actions" tip={`${t.actionsLeft} action${t.actionsLeft === 1 ? '' : 's'} left`}>
            <small>Actions</small>
            {Array.from({ length: Math.max(3, t.actionsLeft) }, (_, i) => (
              <ActionHex key={i} off={i >= t.actionsLeft} />
            ))}
            {t.freeDeploys > 0 && (
              <Tip as="em" tip={`Free drop (${cardName('industrious')})`}>
                +1 drop
              </Tip>
            )}
            {canAct && t.actionsLeft === 0 && canCurious(game, t.player) && (
              <Tip as="em" tip={`${cardName('curious')}: peaceful Move or Research available`}>
                +1 curious
              </Tip>
            )}
            {legal.can('playStoredTactic') && (
              <Tip as="em" tip={`${cardName('patient')}: you may play a stored tactic from your player card`}>
                +stored tactic
              </Tip>
            )}
          </Tip>
        )}
      </div>

      {waitingFor && !ctl.mine(waitingFor.id) && (
        <p className="hint thinking">
          <span className="spinner" /> {waitingFor.ai ? `${waitingFor.name} is thinking…` : `Waiting for ${waitingFor.name}…`}
        </p>
      )}
      {hint && <p className="hint">{hint}</p>}
      {/* The ships to deploy are what you act with, so they're here rather than in the player list. */}
      <div className="turn-scrap">
        <Scrapyard game={game} p={turnScrapOwner(game, ctl)} ctl={ctl} dispatch={dispatch} />
      </div>

      {game.phase === 'play' && ctl.mine(p.id) && !deciding && (
        <div className="turn-actions">
          {rulesOf(game).cards && (
            <button
              className="btn"
              disabled={!legal.can('research')}
              onClick={() => dispatch({ type: 'research' })}
              title="+1 research. At 6 you gain a card at the end of your turn."
            >
              <CategoryIcon category="research" /> Research
            </button>
          )}
          <SkillButton game={game} effect="composed" disabled={!legal.can('composed')} onClick={() => dispatch({ type: 'composed' })} />
          <SkillButton
            game={game}
            effect="ambitious"
            label={`${cardName('ambitious')} +1`}
            disabled={!legal.can('ambitious')}
            onClick={() => dispatch({ type: 'ambitious' })}
          />
          <button
            className="btn btn-ghost undo-btn"
            aria-label="Undo"
            disabled={!canAct || !undo}
            onClick={() => {
              ctl.select({ kind: 'none' });
              undo?.();
            }}
            title="Take back your last move (Ctrl/⌘+Z). Dice rolls, battles and cards can’t be undone."
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
            <span className="undo-label">Undo</span>
          </button>
          <button
            className={`btn btn-primary ${canAct && t.actionsLeft === 0 && !canCurious(game, t.player) && !legal.can('playStoredTactic') ? 'pulse' : ''}`}
            disabled={!legal.can('endTurn')}
            onClick={() => dispatch({ type: 'endTurn' })}
          >
            End turn
          </button>
        </div>
      )}

      {head?.kind === 'advance' && ctl.human && <AdvanceChoice dispatch={dispatch} />}
      {head?.kind === 'placeExpansion' && ctl.human && (
        <div className="turn-actions">
          <button className="btn" onClick={() => dispatch({ type: 'placeExpansion', to: null })}>
            {'Send to salvage yard'}
          </button>
        </div>
      )}
      {head?.kind === 'unveil' && ctl.human && (
        <div className="turn-actions">
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'unveilDone' })}>
            Done
          </button>
        </div>
      )}

      <ShipPanel game={game} ctl={ctl} dispatch={dispatch} />
    </section>
  );
}

/**
 * After winning a battle: advance into the destroyed ship's space (also a tap on that space) or hold.
 * Enter advances, unless a button has focus (then Enter presses that button).
 */
function AdvanceChoice({ dispatch }: { dispatch: Dispatch }) {
  const go = (move: boolean) => dispatch({ type: 'advance', move });
  useShortcut(
    (e) => e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName !== 'BUTTON',
    (e) => {
      e.preventDefault();
      go(true);
    },
  );
  return (
    <div className="turn-actions">
      <button className="btn" onClick={() => go(false)}>
        Hold position
      </button>
      <button className="btn btn-primary" onClick={() => go(true)}>
        Advance
      </button>
    </div>
  );
}

/** A button for a skill the current player activates; hidden unless they have it. */
function SkillButton({
  game,
  effect,
  label,
  disabled,
  onClick,
}: {
  game: GameState;
  effect: SkillEffect;
  label?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const id = skillCard(game, game.turn.player, effect);
  if (!id) return null;
  const def = card(id);
  return (
    <button className="btn" disabled={disabled} onClick={onClick} title={def.text}>
      {label ?? def.name}
    </button>
  );
}
