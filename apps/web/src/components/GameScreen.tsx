import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { actor, drawing, rulesOf, say, type GameState, type PlayerId } from '@regolith/engine';
import { useController } from '../game/controller';
import { useUndoShortcut } from '../game/useGame';
import { conquerOptions } from '../game/legal';
import { lost, type GameView } from '../game/view';
import { useReview, type Review } from '../game/review';
import { logText } from '../game/logText';
import { SayContext } from '../game/words';
import { GAME_NAME } from '../appId';
import { SHEET, useMediaQuery } from '../game/useMediaQuery';
import { BottomSheet } from './BottomSheet';
import { Board } from './Board';
import { Market } from './Market';
import { Log } from './Log';
import { PlayerList } from './PlayerList';
import { TurnPanel } from './TurnPanel';
import { CombatOverlay } from './CombatOverlay';
import { ConquerChoice, DecisionOverlay, GameOver } from './Overlays';
import { ErrorToast, PlayedCard, Toasts } from './Toasts';
import { FullscreenButton } from './FullscreenButton';
import { WorldButton } from './WorldButton';
import { MusicButton, SoundButton } from './SoundButton';

/** The map's height over its width, as drawn. */
const mapRatio = (game: GameState) => {
  const { rows, cols } = drawing(game.board);
  return rows / cols;
};

/**
 * The game screen, for a game on this device or online. `side` goes at the top of the sidebar,
 * `overlay` over everything; online, leaving doesn't end the game. `onLobby` (the title) goes back to
 * the lobby without ending it. On a phone held upright the sidebar and market are a bottom sheet over
 * the map instead, with the turn panel showing at rest and the market first under it.
 *
 * A tap on a log entry looks back at the game: the screen shows the map as it was just after it, and
 * nothing can be played until the review ends. The game goes on meanwhile, and the log with it; the
 * review bar says when it is waiting for this screen.
 */
export function Game({
  view,
  onQuit,
  onLobby,
  onRules,
  online,
  side,
  overlay,
}: {
  view: GameView;
  onQuit: () => void;
  onLobby: () => void;
  onRules: () => void;
  online?: boolean;
  side?: ReactNode;
  overlay?: ReactNode;
}) {
  const live = view.game;
  const { review, can, pick } = useReview(live, view.positions, view.reviewAfter);
  // While reviewing, the screen shows a past position that nobody plays.
  const game = review?.state ?? live;
  const dispatch = review ? NO_DISPATCH : view.dispatch;
  const undo = review ? undefined : view.undo;
  useUndoShortcut(undo);
  // The game as it was when the review began. On the way back the map shows it for a moment, then
  // follows play from there to the game now, so what happened meanwhile rolls, blows up and is
  // brought into view as usual instead of just being there.
  const [leftAt, setLeftAt] = useState<GameState | null>(null);
  const lookBack = (id: number) => {
    if (!review) setLeftAt(live);
    pick(id);
  };
  const returning = !review && leftAt !== live ? leftAt : null;
  useEffect(() => {
    if (!review && leftAt) setLeftAt(null);
  }, [review, leftAt]);
  // The page's colours follow the rule set's look (styles.css, :root[data-look]).
  const look = rulesOf(game).look;
  useEffect(() => {
    if (!look) return;
    document.documentElement.dataset.look = look;
    return () => {
      delete document.documentElement.dataset.look;
    };
  }, [look]);
  const { error, toasts } = view;
  const ctl = useController(game, dispatch, review ? NOBODY : view.mine);
  const [hideGameOver, setHideGameOver] = useState(false);
  const head = game.pending[0];
  const sheet = useMediaQuery(SHEET);
  const cards = rulesOf(game).cards;
  const { sel } = ctl;
  const conquering = sel.kind === 'conquer' ? conquerOptions(ctl.legal, sel.planet) : [];
  // The same panels in both layouts, in a different order.
  const turnPanel = <TurnPanel game={game} ctl={ctl} dispatch={dispatch} undo={undo} />;
  // Changes when the screen jumps to another position rather than following a move: looking back, or skipping ahead online.
  const scene = review ? `review:${review.entry.id}` : `live:${view.jumps ?? 0}`;
  const market = cards && <Market game={game} dispatch={dispatch} legal={ctl.legal} steady={!!review} scene={scene} />;
  const players = <PlayerList game={game} ctl={ctl} dispatch={dispatch} scene={scene} />;
  const log = <Log game={live} review={{ can, pick: lookBack, picked: review?.entry.id, move: review?.move }} />;

  return (
    <SayContext.Provider value={(text) => say(game, text)}>
      <div className={`app ${review ? 'reviewing' : ''}`}>
        <header className="topbar">
          <button type="button" className="brand" title="Back to the lobby" onClick={onLobby}>
            {GAME_NAME}
          </button>
          <div className="topbar-map">
            <span className={`mode-badge mode-${game.mode}${rulesOf(game).experimental ? ' experimental' : ''}`}>{rulesOf(game).name}</span>
            {game.board.mapName}
          </div>
          <div className="topbar-actions">
            <button className="btn btn-ghost" onClick={onLobby}>
              Lobby
            </button>
            <button className="btn btn-ghost" onClick={onRules}>
              Rules
            </button>
            {game.board.world && <WorldButton world={game.board.world} />}
            <MusicButton />
            <SoundButton />
            <FullscreenButton />
          </div>
        </header>

        <main className={`layout ${sheet ? 'sheet-layout' : ''}`}>
          {/* First in both layouts, so turning the phone keeps the board (and its zoom). */}
          <div className="stage" style={{ '--map-ratio': mapRatio(game) } as CSSProperties}>
            {/* Choosing a starting planet is the first moment the map is yours to look at: show it zooms then. */}
            <Board
              game={returning ?? game}
              ctl={ctl}
              scene={scene}
              introduce={!review && game.phase === 'setup' && ctl.highlights.planets.size > 0}
            />
            {review && <ReviewBar review={review} game={live} waiting={waitingFor(view)} />}
            {/* The game's news goes on while looking back, as news of the game now. */}
            <Toasts toasts={toasts} game={live} now={!!review} />
            <PlayedCard
              game={live}
              mine={view.mine}
              jumps={view.jumps}
              review={review ? live.log.filter((e) => review.move.has(e.id)) : undefined}
              hold={!review && head?.kind === 'combat'}
            />
            <ErrorToast error={error} />
          </div>
          {sheet ? (
            <BottomSheet
              peek={turnPanel}
              wantOpen={!!cards && (ctl.legal.can('takeCard') || ctl.legal.can('patientTactic'))}
              closeFor={review?.entry.id}
            >
              {side}
              {market}
              {players}
              {log}
            </BottomSheet>
          ) : (
            <>
              <aside className="sidebar">
                {side}
                {turnPanel}
                {players}
                {log}
              </aside>
              {market}
            </>
          )}
        </main>

        {!review && head?.kind === 'combat' && (
          <CombatOverlay
            key={head.id}
            game={game}
            combat={head}
            dispatch={dispatch}
            mine={view.mine}
            aiResponder={view.aiResponder ?? null}
            online={online ? view.combat : undefined}
          />
        )}
        {!review && <DecisionOverlay game={game} dispatch={dispatch} human={ctl.human} />}
        {conquering.length > 0 && (
          <ConquerChoice game={game} options={conquering} dispatch={dispatch} onClose={() => ctl.select({ kind: 'none' })} />
        )}
        {!review && game.phase === 'over' && !hideGameOver && (
          <GameOver
            game={game}
            lost={lost(game, view.mine)}
            onNew={onQuit}
            onClose={() => setHideGameOver(true)}
            newLabel={online ? 'Back to lobby' : undefined}
          />
        )}
        {overlay}
      </div>
    </SayContext.Provider>
  );
}

const NO_DISPATCH = () => false;
const NOBODY = (_: PlayerId) => false;

/** While the screen looks back: what the game as it is now waits for this screen to do, if anything. */
function waitingFor(view: GameView): string | null {
  const g = view.game;
  if (g.phase === 'over') return 'The game is over';
  const head = g.pending[0];
  if (head?.kind === 'combat')
    return view.mine(head.attacker.player) || view.mine(head.defender.player) ? 'A battle is waiting for you' : null;
  return view.mine(actor(g)) ? 'It’s your move' : null;
}

/**
 * Over the map while looking back: which log entry it shows, steps through the log, and the way back
 * to the game, which stands out while the game is `waiting` for this screen.
 */
function ReviewBar({ review, game, waiting }: { review: Review; game: GameState; waiting: string | null }) {
  const { entry } = review;
  const colour = { '--pc': entry.player !== undefined ? game.players[entry.player].color : 'var(--muted)' } as CSSProperties;
  return (
    <div className="review-bar" style={colour}>
      <button
        type="button"
        className="btn review-step"
        disabled={!review.prev}
        onClick={review.prev}
        title="Earlier (←)"
        aria-label="Earlier"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" />
        </svg>
        <span>Earlier</span>
      </button>
      {/* Read out at each step; the buttons around it are not. */}
      <div className="review-text" role="status">
        {waiting ? (
          <small className="review-waiting">{waiting}</small>
        ) : (
          <small>{review.state.phase === 'setup' ? 'Setup' : `Turn ${review.state.turn.number}`} · looking back</small>
        )}
        <span>{logText(game, entry)}</span>
      </div>
      <button
        type="button"
        className="btn review-step"
        onClick={review.next}
        title={review.last ? 'Back to the game (→)' : 'Later (→)'}
        aria-label={review.last ? 'Back to the game' : 'Later'}
      >
        <span>Later</span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button type="button" className={`btn ${waiting ? 'btn-primary pulse' : ''}`} onClick={review.close} title="Back to the game (Esc)">
        Back to game
      </button>
    </div>
  );
}
