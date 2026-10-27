import { useState, type CSSProperties } from 'react';
import { cardName, card, rulesOf, type GameState, type PlayerConfig, type PlayerState } from '@regolith/engine';
import { aiLevelInfo } from '../game/aiClient';
import type { Controller } from '../game/controller';
import type { Dispatch } from '../game/useGame';
import { useStepEffects } from '../game/useTransient';
import { CategoryIcon, MissileIcon, categoryStyle } from './Card';
import { CardViewer } from './CardViewer';
import { Tip } from './InfoPop';
import { PANEL_EFFECT_MS, panelEffectsOf, type PanelEffect } from './panelEffects';
import { Scrapyard, turnScrapOwner } from './Scrapyard';

/** The effect on one spot of a panel, if any: the latest, so a fresh one restarts it (`key`). */
const effectAt = (fx: PanelEffect[], spot: PanelEffect['spot']) => fx.filter((e) => e.spot === spot).at(-1);

/** An effect on a stat or a chip, over it. */
const Flash = ({ e }: { e?: PanelEffect }) => (e ? <i key={e.id} className={`panel-fx panel-fx-${e.kind}`} aria-hidden /> : null);

/** A player's track. A gain sends a pulse up it to the new value; a loss burns off the cells lost. */
function Track({ label, value, tone, spot, fx }: { label: string; value: number; tone: string; spot: string; fx?: PanelEffect }) {
  const moved = fx && 'from' in fx ? fx : undefined;
  return (
    <Tip as="div" className={`track track-${tone}`} data-fx={spot} tip={`${label}: ${value} of 6`}>
      <span className="track-label">{label}</span>
      <div className="track-cells">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span key={n} className={n <= value ? 'on' : ''} />
        ))}
        {moved && (
          <i
            key={moved.id}
            className={moved.kind === 'up' ? 'track-pulse' : 'track-drop'}
            style={{ '--from': Math.min(moved.from, 6) / 6, '--to': Math.min(moved.to, 6) / 6 } as CSSProperties}
          />
        )}
      </div>
    </Tip>
  );
}

/** An AI player's tag, with its level: "AI · Admiral". */
export function AiTag({ p }: { p: PlayerConfig }) {
  const level = aiLevelInfo(p);
  return (
    <span className="tag" title={`${level.name}: ${level.summary}`}>
      AI · {level.name}
    </span>
  );
}

/** The players' panels. `scene` changes for a jump to another position, which shows no effects. */
export function PlayerList({ game, ctl, dispatch, scene }: { game: GameState; ctl: Controller; dispatch: Dispatch; scene?: string }) {
  const inTurnPanel = turnScrapOwner(game, ctl).id;
  const fx = useStepEffects(game, PANEL_EFFECT_MS, panelEffectsOf, scene);
  return (
    <section className="panel players">
      {game.players.map((p) => (
        <PlayerCard
          key={p.id}
          game={game}
          p={p}
          ctl={ctl}
          dispatch={dispatch}
          showScrap={p.id !== inTurnPanel}
          fx={fx.filter((e) => e.player === p.id)}
        />
      ))}
    </section>
  );
}

function PlayerCard({
  game,
  p,
  ctl,
  dispatch,
  showScrap,
  fx,
}: {
  game: GameState;
  p: PlayerState;
  ctl: Controller;
  dispatch: Dispatch;
  showScrap: boolean;
  fx: PanelEffect[];
}) {
  const active = game.phase === 'play' && game.turn.player === p.id;
  const rules = rulesOf(game);
  const placed = game.board.planets.reduce((a, pl) => a + pl.cubes.filter((x) => x === p.id).length, 0);
  const totalCubes = p.cubesLeft + placed;
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <div className={`player ${active ? 'active' : ''}`} data-player={p.id} style={{ '--pc': p.color } as CSSProperties}>
      <Flash e={effectAt(fx, 'skills')} />
      <div className="player-head">
        <strong>{p.name}</strong>
        {p.ai && <AiTag p={p} />}
        <Tip className="cubes" tip={`${placed} of ${totalCubes} cubes placed`}>
          <small>
            Cubes {placed}/{totalCubes}
          </small>
          {Array.from({ length: totalCubes }, (_, i) => (
            <span key={i} className={i < placed ? 'placed' : ''} />
          ))}
        </Tip>
      </div>
      <div className="player-tracks">
        <Track label={'Power'} value={p.dominance} tone="dom" spot="dominance" fx={effectAt(fx, 'dominance')} />
        {rules.cards && <Track label="Research" value={p.research} tone="res" spot="research" fx={effectAt(fx, 'research')} />}
      </div>
      <div className="player-row">
        <Tip className="stat" data-fx="missiles" tip={'Atomics: in a battle you are losing, set your own combat roll to 1'}>
          <MissileIcon size={14} /> {p.missiles}
          <Flash e={effectAt(fx, 'missiles')} />
        </Tip>
        {p.planAhead > 0 && (
          <Tip className="stat gold" data-fx="planAhead" tip={`${cardName('plan-ahead')}: all your combat rolls are 1`}>
            Plan Ahead
            <Flash e={effectAt(fx, 'planAhead')} />
          </Tip>
        )}
        {p.actionPenalty > 0 && (
          <Tip className="stat bad" data-fx="penalty" tip="Sabotaged: fewer actions next turn">
            −{p.actionPenalty} action{p.actionPenalty > 1 ? 's' : ''}
            <Flash e={effectAt(fx, 'penalty')} />
          </Tip>
        )}
        {p.ambitionTokens > 0 && (
          <Tip className="stat" data-fx="ambition" tip="Ambition tokens">
            Ambition {p.ambitionTokens}/3
            <Flash e={effectAt(fx, 'ambition')} />
          </Tip>
        )}
      </div>
      {/* The turn panel shows one player's scrapyard (see turnScrapOwner); the others' are here. */}
      {showScrap && (
        <div className="player-scrap">
          <Scrapyard game={game} p={p} ctl={ctl} dispatch={dispatch} />
        </div>
      )}
      {(p.skills.length > 0 || (p.storedTactics?.length ?? 0) > 0) && (
        <div className="skills">
          {p.skills.map((s, i) => {
            const def = card(s.id);
            const disabled = s.disabledUntil !== undefined;
            const flash = effectAt(fx, `skill:${s.id}`);
            // Greyed out only once its flash is over: the chip's filter and opacity would grey that too.
            const dim = disabled && flash?.kind !== 'off';
            return (
              <button
                type="button"
                key={`${s.id}${i}`}
                onClick={() => setViewing(s.id)}
                data-fx={`skill:${s.id}`}
                className={`skill-chip ${s.active ? '' : 'pending'} ${dim ? 'disabled-chip' : ''}`}
                style={categoryStyle(def.category, true)}
                title={`${`${def.name}: ${def.text}`}${disabled ? `\n(Disabled by ${game.players[s.disabledUntil!].name} until their next turn)` : s.active ? '' : '\n(Takes effect from the next player’s turn)'}`}
              >
                <CategoryIcon category={def.category} size={11} />
                {def.name}
                <Flash e={flash} />
              </button>
            );
          })}
          {p.storedTactics?.map((tId, i) => {
            const def = card(tId);
            const canPlay = ctl.legal.can('playStoredTactic', (a) => a.card === tId);
            return (
              <button
                type="button"
                key={`stored-${tId}${i}`}
                onClick={() => setViewing(tId)}
                data-fx={`stored:${tId}`}
                className={`skill-chip stored-tactic ${canPlay ? 'playable' : ''}`}
                style={categoryStyle(def.category, true)}
                title={`${`${def.name} (Stored Tactic): ${def.text}`}${canPlay ? '\n(Click to view / play)' : ''}`}
              >
                <CategoryIcon category={def.category} size={11} />
                {def.name} [Tactic]
                <Flash e={effectAt(fx, `stored:${tId}`)} />
              </button>
            );
          })}
        </div>
      )}
      {viewing && (
        <CardViewer
          title={card(viewing).name}
          subtitle={
            p.storedTactics?.includes(viewing)
              ? `${p.name}’s stored tactic`
              : `${p.name}’s ${rules.cards?.terms.skill ?? 'skill'}${p.skills.some((s) => s.id === viewing && !s.active) ? ' — takes effect from the next player’s turn' : ''}`
          }
          cards={[viewing]}
          single
          onClose={() => setViewing(null)}
          action={
            ctl.legal.can('playStoredTactic', (a) => a.card === viewing) ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  dispatch({ type: 'playStoredTactic', card: viewing });
                  setViewing(null);
                }}
              >
                {game.turn.actionsLeft > 0
                  ? `Play Tactic (forfeits ${game.turn.actionsLeft} remaining action${game.turn.actionsLeft === 1 ? '' : 's'})`
                  : 'Play Tactic'}
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
