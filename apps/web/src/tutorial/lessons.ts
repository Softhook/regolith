import type { Action } from '@regolith/engine';
import { buildLesson, type Fight, type Lesson, type LessonDef } from './script';
import { HOME, mech, REFINERY } from './stage';

/**
 * The demo's lessons, in the order a newcomer needs them. Each starts from its own laid-out position on the
 * training ground (stage.ts) and plays real actions through the engine (script.ts): the board is the game's own, so
 * what is taught here is what the game does. Positions are `[row, column]` on that board; see stage.ts
 * for the objectives and `RULES.md` for the rules a caption states.
 *
 * A rule is taught once, by a picture (pictures.tsx), which carries its own words; a board beat after it only
 * acts it out on the training ground, in a short caption. `**bold**` is what to take away.
 */

const at = (r: number, c: number) => ({ r, c });
const move = (die: string, r: number, c: number): Action => ({ type: 'move', die, to: at(r, c) });
const attack = (die: string, target: string, wins: Fight['wins']): Fight => ({ act: { type: 'attack', die, target }, wins });
const resolve: Action = { type: 'resolveCombat' };
const advance: Action = { type: 'advance', move: true };

const you = (i: number) => mech('you', i);
const foe = (i: number) => mech('foe', i);

const goal: LessonDef = {
  id: 'goal',
  title: 'The goal',
  blurb: 'What wins the game',
  beats: [{ picture: 'goal' }],
};

const mechs: LessonDef = {
  id: 'mechs',
  title: 'Your mechs',
  blurb: 'Six kinds, each with an ability',
  beats: [
    { picture: 'lineup' },
    { picture: 'mech1' },
    { picture: 'mech2' },
    { picture: 'mech3' },
    { picture: 'mech4' },
    { picture: 'mech5' },
    { picture: 'mech6' },
  ],
};

const map: LessonDef = {
  id: 'map',
  title: 'The map',
  blurb: 'Spaces, objectives and cubes',
  hud: ['cubes'],
  beats: [
    { picture: 'spaces' },
    { picture: 'objective' },
    { picture: 'perimeter' },
    { picture: 'home' },
    {
      say: 'The practice map: two homes, and the **Refinery**, an 8.',
      show: { planets: { [HOME.you]: 'Your home', [HOME.foe]: 'Rival’s home', [REFINERY]: 'Refinery: an 8' } },
    },
  ],
};

const turn: LessonDef = {
  id: 'turn',
  title: 'Your turn',
  blurb: 'Three actions',
  beats: [{ picture: 'turn' }],
};

const moving: LessonDef = {
  id: 'move',
  title: 'Moving',
  blurb: 'How far a mech goes',
  setup: {
    you: [[3, 1, 3]],
  },
  hud: ['actions'],
  beats: [
    { picture: 'reach' },
    {
      say: 'On the board, the **dots** show where this 3 can go: around the objectives, never through. It walks to one.',
      play: [move(you(0), 4, 3)],
      show: { pick: you(0) },
    },
  ],
};

const claim: LessonDef = {
  id: 'claim',
  title: 'Claiming',
  blurb: 'Make the numbers add up',
  setup: {
    you: [
      [3, 2, 5],
      [2, 2, 3],
    ],
  },
  hud: ['actions', 'cubes'],
  beats: [
    { picture: 'sum' },
    {
      say: 'On the board: the 3 joins the 5, and the Refinery is ours.',
      show: { planets: { [REFINERY]: 'Needs 8' }, look: [you(0), you(1)] },
      play: [move(you(1), 3, 3), { type: 'conquer', planet: REFINERY }],
      then: { planets: { [REFINERY]: 'Claimed' } },
    },
  ],
};

const fight: LessonDef = {
  id: 'fight',
  title: 'Fighting',
  blurb: 'Lower numbers win',
  setup: {
    you: [[2, 2, 2]],
    foe: [[3, 3, 6]],
  },
  hud: ['actions', 'power'],
  beats: [
    { picture: 'fight' },
    { picture: 'outcome' },
    {
      say: 'On the board: our 2 attacks their 6…',
      show: { pick: you(0) },
      play: [attack(you(0), foe(0), 'attacker')],
    },
    {
      say: '…wins, and steps in.',
      play: [resolve, advance],
    },
  ],
};

const takeover: LessonDef = {
  id: 'takeover',
  title: 'Take Over',
  blurb: 'Power makes cubes',
  setup: { you: [[2, 2, 2]], foe: [[2, 3, 5]], power: { you: 5 } },
  hud: ['power', 'cubes'],
  beats: [
    { picture: 'power' },
    {
      say: 'On the board, our **Power** is **5**. One more win…',
      show: { look: [you(0), foe(0)] },
      play: [attack(you(0), foe(0), 'attacker')],
      then: { look: [you(0), foe(0)] },
    },
    {
      say: '…makes **6**: **Take Over** the Refinery.',
      play: [resolve, advance, { type: 'infamy', planet: REFINERY }],
      then: { planets: { [REFINERY]: 'A free cube' } },
    },
  ],
};

const holding: LessonDef = {
  id: 'holding',
  title: 'Blocking',
  blurb: 'Enemy mechs get in the way',
  beats: [{ picture: 'zone' }, { picture: 'contested' }],
};

const salvage: LessonDef = {
  id: 'salvage',
  title: 'Drop and Refit',
  blurb: 'Bringing mechs back',
  beats: [{ picture: 'drop' }, { picture: 'refit' }],
};

const defs: LessonDef[] = [goal, mechs, map, turn, moving, claim, fight, takeover, holding, salvage];

let built: Lesson[] | undefined;

/** The lessons, played through the engine on first use. */
export function lessons(): Lesson[] {
  return (built ??= defs.map(buildLesson));
}
