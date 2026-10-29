import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GameState } from '@regolith/engine';
import { Board } from '../components/Board';
import { useController } from '../game/controller';
import { useShortcut } from '../game/useShortcut';
import css from '../rulebook/rulebook.css?raw';
import { GoalAnimation, MechKeys, MechProfile } from '../rulebook/concepts';
import { Scene } from '../rulebook/scenes';
import { Battle } from './Battle';
import { lessons } from './lessons';
import { lit } from './lit';
import type { Lesson } from './script';
import { Status } from './Status';

const NO_DISPATCH = () => false;
const NOBODY = () => false;

/** Where the demo is: a position of a lesson, and how many times it has jumped rather than played on. */
interface At {
  lesson: number;
  frame: number;
  jumps: number;
}

/**
 * Steps along the lessons' frames: on by itself while playing, and by hand otherwise. Anything but the next
 * frame is a jump, which the board shows as a new position rather than a move.
 */
function usePlayer(list: readonly Lesson[]) {
  const [at, setAt] = useState<At>({ lesson: 0, frame: 0, jumps: 0 });
  const [playing, setPlaying] = useState(true);
  const [done, setDone] = useState(false);
  const lesson = list[at.lesson];
  const frame = lesson.frames[at.frame];
  const last = at.frame === lesson.frames.length - 1;
  const finale = at.lesson === list.length - 1;

  useEffect(() => {
    if (!playing || done) return;
    const t = window.setTimeout(() => {
      if (!last) setAt((a) => ({ ...a, frame: a.frame + 1 }));
      else if (!finale) setAt((a) => ({ lesson: a.lesson + 1, frame: 0, jumps: a.jumps + 1 }));
      else {
        setDone(true);
        setPlaying(false);
      }
    }, frame.wait);
    return () => window.clearTimeout(t);
  }, [playing, done, at, frame, last, finale]);

  const go = useCallback((to: Omit<At, 'jumps'>) => {
    setDone(false);
    setAt((a) => ({ ...to, jumps: a.jumps + 1 }));
  }, []);
  const beat = frame.beat;
  const toBeat = (l: number, b: number) => go({ lesson: l, frame: list[l].starts[b] });
  /** To the start of this beat, or, already there, the one before. */
  const back = () => {
    if (done) return go({ lesson: at.lesson, frame: lesson.starts[beat] });
    if (at.frame > lesson.starts[beat]) return toBeat(at.lesson, beat);
    if (beat > 0) return toBeat(at.lesson, beat - 1);
    return go({ lesson: Math.max(0, at.lesson - 1), frame: 0 });
  };
  const forward = () => {
    if (beat < lesson.starts.length - 1) return toBeat(at.lesson, beat + 1);
    if (!finale) return go({ lesson: at.lesson + 1, frame: 0 });
    setDone(true);
    setPlaying(false);
  };
  return {
    at,
    lesson,
    frame,
    playing,
    done,
    toggle: () => (done ? (go({ lesson: 0, frame: 0 }), setPlaying(true)) : setPlaying((p) => !p)),
    back,
    forward,
    toBeat,
    restart: () => go({ lesson: at.lesson, frame: 0 }),
    lessonAt: (l: number) => go({ lesson: l, frame: 0 }),
    again: () => {
      go({ lesson: 0, frame: 0 });
      setPlaying(true);
    },
  };
}

/** A caption's words, with `**bold**` set in bold. */
function Say({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (
        <Fragment key={i}>{i % 2 ? <b>{part}</b> : part}</Fragment>
      ))}
    </>
  );
}

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

      {frame.key?.goal || frame.key?.mech || frame.key?.lineup || frame.key?.scene ? (
        <div className="mn mn-dark demo-bare" key={`bare:${p.at.lesson}:${frame.beat}:${p.at.jumps}`}>
          {frame.key.scene ? (
            <Scene name={frame.key.scene} />
          ) : frame.key.goal ? (
            <GoalAnimation />
          ) : frame.key.lineup ? (
            <MechKeys />
          ) : (
            <MechProfile v={frame.key.mech!} />
          )}
        </div>
      ) : (
        <>
          <Status
            game={frame.game}
            hud={lesson.hud}
            rival={lesson.frames[0].game.dice.some((d) => d.owner === 1 && d.loc.zone === 'board')}
          />
          <Stage game={frame.game} show={frame.show} scene={`${lesson.id}:${p.at.jumps}`} />
        </>
      )}

      {p.done && (
        <div className="demo-end" role="status">
          <h3>That’s the game</h3>
          <ul>
            <li>
              <b>Claim</b> an objective with mechs whose numbers add up exactly.
            </li>
            <li>
              <b>Fight</b>: lower totals win, and winning builds Power for a free cube.
            </li>
            <li>
              <b>Win</b> by placing all your cubes first.
            </li>
          </ul>
          <p>
            A practice game uses the Basic rules, with no cards. When you want more, pick <b>Regolith</b> in the lobby.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={p.again}>
              Watch again
            </button>
            <button type="button" className="btn btn-primary btn-lg" onClick={onPlay}>
              Play a practice game
            </button>
          </div>
        </div>
      )}

      <footer className="demo-foot">
        <p key={`${p.at.lesson}:${frame.beat}`} className="demo-say" aria-live="polite">
          <Say text={frame.say} />
        </p>
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
