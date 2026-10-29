import { useMemo, type ReactNode } from 'react';
import type { GameState } from '@regolith/engine';
import { Board } from '../components/Board';
import { useController } from '../game/controller';
import { useShortcut } from '../game/useShortcut';
import css from '../rulebook/rulebook.css?raw';
import { Battle } from './Battle';
import { lessons } from './lessons';
import { lit } from './lit';
import { usePlayer } from './player';
import { PictureView, pictureScene, Words } from './pictures';
import { Status } from './Status';

const NO_DISPATCH = () => false;
const NOBODY = () => false;

/** The map, as the game draws it, with what the caption points at lit up in the game's own way. */
function Stage({ game, show, scene }: { game: GameState; show: Parameters<typeof lit>[1]; scene: string }) {
  const base = useController(game, NO_DISPATCH, NOBODY);
  const highlights = useMemo(() => lit(game, show), [game, show]);
  // The controller of a game nobody plays, but lighting up what a tap on a mech would.
  const ctl = useMemo(() => ({ ...base, highlights }), [base, highlights]);
  const head = game.pending[0];
  return (
    <div className="demo-stage">
      <Board game={game} ctl={ctl} scene={scene} />
      {head?.kind === 'combat' && <Battle key={head.id} game={game} combat={head} />}
    </div>
  );
}

/** The last screen: what to take away, and on to a practice game. */
function End({ again, onPlay }: { again: () => void; onPlay: () => void }) {
  return (
    <div className="demo-end" role="status">
      <h3>That’s the game</h3>
      <ul>
        <li>
          <b>Claim</b> an objective with mechs whose numbers add up exactly: one of your cubes goes on it.
        </li>
        <li>
          <b>Fight</b>: lower totals win. Clear the enemies off an objective, and build Power to place a cube for free.
        </li>
        <li>
          <b>Win</b> by placing all your cubes first.
        </li>
      </ul>
      <p>
        A practice game uses the Basic rules, with no cards. When you want more, pick <b>Regolith</b> in the lobby.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={again}>
          Watch again
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={onPlay}>
          Play a practice game
        </button>
      </div>
    </div>
  );
}

/**
 * The tutorial: the rules acted out on a small training ground, one lesson after another, with a caption
 * for each step. It plays by itself and can be paused, skipped and gone back in. It is the real board and the
 * real rules engine playing scripted turns (script.ts, lessons.ts), not a video.
 */
export function Tutorial({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  const list = useMemo(lessons, []);
  const p = usePlayer(list);
  const { lesson, frame } = p;

  useShortcut(
    (e) => ['Escape', ' ', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !e.metaKey && !e.ctrlKey && !(e.key === ' ' && e.repeat),
    (e) => {
      e.preventDefault();
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ') p.toggle();
      else if (e.key === 'ArrowLeft') p.back();
      else p.forward();
    },
  );

  const beats = lesson.starts.length;
  const control = (label: string, run: () => void, icon: ReactNode, extra = '') => (
    <button type="button" className={`btn demo-btn ${extra}`} onClick={run} aria-label={label} title={label}>
      {icon}
    </button>
  );

  return (
    <div className="demo" role="dialog" aria-label="Tutorial">
      <style>{css}</style>
      <header className="demo-top">
        <div>
          <small>Tutorial</small>
          <h2>
            <span>{p.at.lesson + 1}</span> {lesson.title}
          </h2>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </header>

      {frame.picture ? (
        // A picture carries its own words, right under it.
        // Kept from one picture to the next of the same scene, so only what changes is redrawn.
        <div className="mn mn-dark demo-bare" key={`bare:${p.at.lesson}:${pictureScene(frame.picture) ?? `${frame.beat}:${p.at.jumps}`}`}>
          <PictureView key={`${frame.beat}:${p.at.jumps}`} name={frame.picture} playing={p.playing && !p.done} onEnd={p.pictureEnded} />
        </div>
      ) : (
        <>
          <Status game={frame.game} hud={lesson.hud} rival={lesson.rival} />
          <Stage game={frame.game} show={frame.show} scene={`${lesson.id}:${p.at.jumps}`} />
        </>
      )}

      {p.done && <End again={p.again} onPlay={onPlay} />}

      <footer className="demo-foot">
        {!frame.picture && (
          <p key={`${p.at.lesson}:${frame.beat}`} className="demo-say" aria-live="polite">
            <Words text={frame.say} />
          </p>
        )}
        <div className="demo-bar">
          <div className="demo-controls">
            {control('Back', p.back, '⏮')}
            {control(p.playing ? 'Pause' : 'Play', p.toggle, p.playing ? '⏸' : '▶', 'demo-play')}
            {control('Next', p.forward, '⏭')}
            {control('Replay this lesson', p.restart, '↺')}
          </div>
          <div className="demo-dots" role="tablist" aria-label="Steps">
            {lesson.starts.map((_, b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={b === frame.beat}
                aria-label={`Step ${b + 1} of ${beats}`}
                className={b === frame.beat ? 'on' : b < frame.beat ? 'seen' : ''}
                onClick={() => p.toBeat(p.at.lesson, b)}
              />
            ))}
          </div>
        </div>
        <nav className="demo-lessons" aria-label="Lessons">
          {list.map((l, i) => (
            <button key={l.id} type="button" className={i === p.at.lesson ? 'on' : ''} onClick={() => p.lessonAt(i)} title={l.blurb}>
              <span>{i + 1}</span> {l.title}
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}
