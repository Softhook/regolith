import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lesson } from './script';

/** How long the demo rests on a lesson's last position before the next lesson begins, in ms. */
const SECTION_PAUSE = 3500;
/** A picture shown longer than this, in ms, starts again on Back rather than going to the one before. */
const RESTART = 1500;

/** Where the demo is: a position of a lesson, and how many times it has jumped rather than played on. */
interface At {
  lesson: number;
  frame: number;
  jumps: number;
}

/**
 * Steps along the lessons' frames: on by itself while playing, and by hand otherwise. A board position is held
 * for its `wait`; a picture plays at its own pace and says when it has been played through (`pictureEnded`).
 * Anything but the next frame is a jump, which the board shows as a new position rather than a move.
 */
export function usePlayer(list: readonly Lesson[]) {
  const [at, setAt] = useState<At>({ lesson: 0, frame: 0, jumps: 0 });
  const [playing, setPlaying] = useState(true);
  const [done, setDone] = useState(false);
  /** The picture frame that has been played through, if the one shown has. */
  const [ended, setEnded] = useState<At | null>(null);
  const since = useRef(0);
  const lesson = list[at.lesson];
  const frame = lesson.frames[at.frame];
  const last = at.frame === lesson.frames.length - 1;
  const finale = at.lesson === list.length - 1;
  const waiting = !!frame.picture && ended !== at;

  useEffect(() => {
    since.current = Date.now();
  }, [at]);

  useEffect(() => {
    if (!playing || done || waiting) return;
    const t = window.setTimeout(
      () => {
        if (!last) setAt((a) => ({ ...a, frame: a.frame + 1 }));
        else if (!finale) setAt((a) => ({ lesson: a.lesson + 1, frame: 0, jumps: a.jumps + 1 }));
        else {
          setDone(true);
          setPlaying(false);
        }
      },
      (frame.picture ? 0 : frame.wait) + (last ? SECTION_PAUSE : 0),
    );
    return () => window.clearTimeout(t);
  }, [playing, done, waiting, at, frame, last, finale]);

  const go = useCallback((to: Omit<At, 'jumps'>) => {
    setDone(false);
    setAt((a) => ({ ...to, jumps: a.jumps + 1 }));
  }, []);
  const beat = frame.beat;
  const toBeat = (l: number, b: number) => go({ lesson: l, frame: list[l].starts[b] });
  /** To the start of this beat (a picture under way starts again), or, already there, the one before. */
  const back = () => {
    if (done) return go({ lesson: at.lesson, frame: lesson.starts[beat] });
    if (at.frame > lesson.starts[beat] || (frame.picture && Date.now() - since.current > RESTART)) return toBeat(at.lesson, beat);
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
    pictureEnded: () => setEnded(at),
  };
}
