import { apply, checkInvariants, combatOutcome, RuleError, type Action, type GameState } from '@regolith/engine';
import type { PictureName } from './pictures';
import { reading } from './reading';
import { stage, type Setup } from './stage';

/**
 * A lesson is a script of the game's own actions. It is played through the rules engine on a staged game, so
 * every move, fight and claim it shows is one the rules allow, and what happens in it is what would happen at
 * the table. `buildLesson` plays the script once and keeps every position it passes through as a frame; the
 * demo only steps along the frames, which is what lets it pause, skip and go back.
 *
 * A lesson's beats are of two kinds: a picture on a screen of its own (pictures.tsx), which brings its own words
 * and timing, and a caption over the training ground with the actions it acts out.
 */

/** A fight the script needs to go one way. The seed is searched for rolls that make it. */
export interface Fight {
  act: Action;
  wins: 'attacker' | 'defender';
}
type Step = Action | Fight;

/** What to light up while a caption is read. */
export interface Show {
  /** A mech to select, as a tap would: the spaces it can reach, the mechs it can attack, the zones that stop it. */
  pick?: string;
  /** Objectives to mark, with a label. */
  planets?: Record<number, string>;
  /** Mechs to point at. */
  look?: readonly string[];
  /** Which objective's perimeter a claim is about. */
  claim?: number;
}

/** A picture on a screen of its own, played once through. */
interface PictureBeat {
  picture: PictureName;
}

/** A caption over the training ground, and the actions it shows. */
interface BoardBeat {
  /** The caption. `**bold**` marks the words to take away. */
  say: string;
  /** The actions made when the beat starts, one after another. */
  play?: readonly Step[];
  show?: Show;
  /** The show after the actions have been made, if it changes. */
  then?: Show;
}

type Beat = PictureBeat | BoardBeat;

export interface LessonDef {
  id: string;
  title: string;
  /** One line under the title, in the chapter list. */
  blurb: string;
  /** The counters the lesson is about; the rest are left off the screen. None for a lesson of pictures only. */
  hud?: readonly Counter[];
  /** The training ground at the start, for a lesson with board beats. */
  setup?: Setup;
  beats: readonly Beat[];
}

export type Counter = 'cubes' | 'power' | 'actions';

/** One position of a lesson, held for `wait` ms, or, for a picture, as long as it takes to play. */
interface Frame {
  game: GameState;
  beat: number;
  say: string;
  show: Show | undefined;
  picture: PictureName | undefined;
  wait: number;
}

export interface Lesson {
  id: string;
  title: string;
  blurb: string;
  hud: readonly Counter[];
  /** Whether the rival has mechs on the map, so has counters worth showing. */
  rival: boolean;
  frames: readonly Frame[];
  /** The index of each beat's first frame. */
  starts: readonly number[];
}

/** How long a position stays, once the action that made it has been seen. */
function settle(before: GameState, after: GameState, action: Action): number {
  if (after.pending[0]?.kind === 'combat') return 5200;
  switch (action.type) {
    case 'resolveCombat':
      return before.pending[0]?.kind === 'combat' && combatOutcome(before, before.pending[0]).attackerWins ? 2200 : 1800;
    case 'conquer':
    case 'infamy':
      return 2600;
    case 'power':
      return 1800;
    default:
      return 1500;
  }
}

const fightOf = (step: Step): Fight | undefined => ('wins' in step ? step : undefined);
const actionOf = (step: Step): Action => ('wins' in step ? step.act : step);

/** Plays the script on one seed; a string says why not, if a rule refuses it or its fights don't go the way it says. */
function play(def: LessonDef, seed: number): Lesson | string {
  const setup = def.setup ?? { you: [] };
  let game = stage(setup, seed);
  const frames: Frame[] = [];
  const starts: number[] = [];
  for (const [beat, b] of def.beats.entries()) {
    starts.push(frames.length);
    if ('picture' in b) {
      frames.push({ game, beat, say: '', show: undefined, picture: b.picture, wait: 0 });
      continue;
    }
    const { say } = b;
    const reads = reading(say);
    const steps = b.play ?? [];
    const push = (wait: number, show: Show | undefined) => frames.push({ game, beat, say, show, picture: undefined, wait });
    // The caption goes up on the position before the actions; with none, it is the only position.
    push(steps.length ? 1800 : reads, b.show);
    let spent = 1800;
    for (const [i, step] of steps.entries()) {
      const action = actionOf(step);
      const before = game;
      try {
        game = apply(game, action);
      } catch (e) {
        if (e instanceof RuleError) return `beat ${beat + 1}, ${action.type}: ${e.message}`;
        throw e;
      }
      const fight = fightOf(step);
      const head = game.pending[0];
      if (fight && (head?.kind !== 'combat' || combatOutcome(game, head).attackerWins !== (fight.wins === 'attacker')))
        return `beat ${beat + 1}: the fight doesn't go to the ${fight.wins}`;
      const wait = settle(before, game, action);
      spent += wait;
      const last = i === steps.length - 1;
      // The last position keeps the caption up until it has been read.
      push(last ? Math.max(wait, reads - (spent - wait) + 600) : wait, last ? (b.then ?? b.show) : b.show);
    }
  }
  const rival = !!setup.foe?.length;
  return { id: def.id, title: def.title, blurb: def.blurb, hud: def.hud ?? [], rival, frames, starts };
}

/** How many seeds a lesson tries for rolls that fit its script. */
const SEEDS = 400;

/**
 * Plays a lesson's script through the engine. The first seed whose rolls go the way the script's fights need
 * is used, so the lesson is the same every time. Throws if the script breaks a rule or no seed fits (a bug in
 * the lesson, caught by its test).
 */
export function buildLesson(def: LessonDef): Lesson {
  let why = '';
  for (let seed = 1; seed <= SEEDS; seed++) {
    const lesson = play(def, seed);
    if (typeof lesson === 'string') {
      why ||= lesson;
      continue;
    }
    const broken = lesson.frames.flatMap((f) => checkInvariants(f.game).filter((m) => !m.startsWith('unknown map')));
    if (broken.length) throw new Error(`${def.id}: ${broken[0]}`);
    return lesson;
  }
  throw new Error(`${def.id}: ${why}`);
}
