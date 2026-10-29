import type { Action } from '@regolith/engine';
import { buildLesson, type Fight, type Lesson, type LessonDef } from './script';
import { HOME, mech, REFINERY } from './stage';

/**
 * The demo's lessons, in the order a newcomer needs them. Each starts from its own laid-out position on the
 * training ground (stage.ts) and plays real actions through the engine (script.ts): the board is the game's own, so
 * what is taught here is what the game does. Positions are `[row, column]` on that board; see stage.ts
 * for the objectives and `RULES.md` for the rules a caption states.
 *
 * Captions are short: the demo is watched, not read. `**bold**` is what to take away.
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
  setup: { you: [], foe: [] },
  hud: [],
  beats: [
    {
      say: 'Welcome to **Regolith**. Move your **cubes** from your tray onto the **objectives**. Fill every space and you win.',
      key: { goal: true },
    },
  ],
};

/** One screen for each mech, 1 to 6, with no map. */
const MECH_SAY: Record<number, string> = {
  1: 'The **Breacher** is a **1**: the strongest mech, but it moves only **1** space.',
  2: 'The **Behemoth** is a **2**: strong, and it moves **2**.',
  3: 'The **Tactician** is a **3**: it moves **3**, as far as any mech can go.',
  4: 'The **Chameleon** is a **4**: it moves **3** too.',
  5: 'The **Sniper** is a **5**: it moves **3**, and it shoots from afar.',
  6: 'The **Wisp** is a **6**: the weakest in a fight, and still **3** at most.',
};

const mechs: LessonDef = {
  id: 'mechs',
  title: 'The mechs',
  blurb: 'Six mechs, six abilities',
  setup: { you: [], foe: [] },
  hud: [],
  beats: [
    { say: 'Each die is a **mech**, and its number says which of the **six**. Meet them one by one.', key: { lineup: true } },
    ...[1, 2, 3, 4, 5, 6].map((v) => ({ say: MECH_SAY[v], key: { mech: v } })),
  ],
};

const board: LessonDef = {
  id: 'board',
  title: 'The board',
  blurb: 'Mechs, objectives and cubes',
  setup: {
    you: [
      [2, 2, 5],
      [3, 1, 3],
    ],
    foe: [[1, 3, 4]],
  },
  hud: ['cubes'],
  beats: [
    {
      say: 'Each die is a **mech**. The dots on its top tell you which one.',
      show: { look: [you(0), you(1)] },
      key: { mechs: [5, 3] },
    },
    {
      say: 'The big numbered hexes are **objectives**. Your cube already sits on your **home** objective.',
      show: { planets: { [HOME.you]: 'Your home', [HOME.foe]: 'Rival’s home' } },
    },
    {
      say: 'You win by placing **all 5 of your cubes** on objectives. The Refinery is next.',
      show: { planets: { [REFINERY]: 'Next: a cube here' } },
    },
    {
      say: 'A mech’s number is how **far it moves** (3 at most) and how **strong** it is. In a fight, **lower is stronger**.',
      show: { look: [you(0), you(1)] },
    },
    {
      say: 'Two ways to place cubes: **Claim** objectives with your mechs, or **Take Over** by winning fights. First, moving.',
    },
  ],
};

const moving: LessonDef = {
  id: 'move',
  title: 'Moving',
  blurb: 'How far a mech goes',
  setup: {
    you: [
      [3, 1, 3],
      [3, 0, 6],
    ],
  },
  hud: ['actions'],
  beats: [
    {
      say: 'A turn is **3 actions**. A **move** costs 1. The dots show where this 3 can go.',
      show: { pick: you(0) },
    },
    {
      say: 'It moves one step at a time, **up to 3 spaces**, but never through an objective.',
      play: [move(you(0), 4, 3)],
      show: { pick: you(0) },
    },
    {
      say: 'A 6 is the fastest mech, but even it moves **no more than 3**.',
      show: { pick: you(1) },
      play: [move(you(1), 3, 3)],
    },
    {
      say: 'Each mech makes **one move or attack a turn**. Two actions spent, one left.',
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
    {
      say: 'The Refinery is an **8**. To claim it, your mechs on the six spaces around it, its **perimeter**, must add up to **exactly 8**.',
      show: { planets: { [REFINERY]: 'Needs 8' }, look: [you(0)] },
    },
    {
      say: 'The 5 is on the perimeter already. The 3 isn’t, so it moves in.',
      show: { pick: you(1) },
      play: [move(you(1), 3, 3)],
      then: { claim: REFINERY, look: [you(0), you(1)] },
    },
    {
      say: '5 + 3 = **8**. **Claim** costs 2 actions and puts your cube on the objective.',
      show: { claim: REFINERY, look: [you(0), you(1)] },
      play: [{ type: 'conquer', planet: REFINERY }],
      then: {},
    },
    {
      say: 'Every mech of yours on the perimeter counts. A third one there would have made 10: no claim. **Exact sums only.**',
      show: { planets: { [REFINERY]: 'Claimed' } },
    },
  ],
};

const fight: LessonDef = {
  id: 'fight',
  title: 'Fighting',
  blurb: 'Lower numbers win',
  setup: {
    you: [
      [3, 1, 5],
      [2, 2, 2],
    ],
    foe: [
      [5, 2, 1],
      [3, 3, 6],
    ],
  },
  hud: ['actions', 'power'],
  beats: [
    {
      say: 'To **attack**, move into an enemy mech: 1 action. Each side rolls a die and adds its mech’s number. **Lower total wins.**',
      show: { pick: you(0) },
    },
    {
      say: 'Our slow 5 attacks a fast 1. That is a bad idea…',
      show: { look: [you(0), foe(0)] },
      play: [attack(you(0), foe(0), 'defender')],
      then: { look: [you(0), foe(0)] },
    },
    {
      say: 'The attack failed. Nothing is destroyed; our mech just stays beside it.',
      play: [resolve],
    },
    {
      say: 'Now our strong 2 attacks the slow 6. **Ties go to the attacker.**',
      show: { pick: you(1) },
      play: [attack(you(1), foe(1), 'attacker')],
    },
    {
      say: 'We win: the rival’s mech is **destroyed**, and ours steps into its space.',
      play: [resolve, advance],
    },
    {
      say: 'Winning raised our **Power** by 1. Power is the other road to cubes.',
    },
  ],
};

const holding: LessonDef = {
  id: 'holding',
  title: 'Holding ground',
  blurb: 'Zones and contested objectives',
  setup: {
    you: [[2, 2, 3]],
    foe: [[3, 3, 4]],
  },
  hud: ['actions'],
  beats: [
    {
      say: 'An enemy mech controls the **spaces next to it**. Move into one and you **must stop**.',
      show: { pick: you(0), look: [foe(0)] },
    },
    {
      say: 'Our 3 had moves to spare, but it stops here. It could still attack from this space.',
      show: { pick: you(0), look: [foe(0)] },
      play: [move(you(0), 2, 3)],
      then: { look: [you(0), foe(0)] },
    },
    {
      say: 'A rival’s mech on an objective’s perimeter makes it **contested**: nobody else can claim it.',
      show: { planets: { [REFINERY]: 'Contested' }, look: [foe(0)] },
    },
    {
      say: 'To claim the Refinery, you would first have to **push that mech off**.',
      show: { planets: { [REFINERY]: 'Contested' } },
    },
  ],
};

const powers: LessonDef = {
  id: 'powers',
  title: 'Mech abilities',
  blurb: 'Every face has a trick',
  setup: {
    you: [
      [3, 1, 6],
      [2, 2, 5],
    ],
    foe: [[2, 4, 3]],
  },
  hud: ['actions'],
  beats: [
    {
      say: 'Each number is a different **kind of mech** with its own **ability**. Here are two.',
      show: { look: [you(0), you(1)] },
    },
    {
      say: 'The **5 Sniper** shoots the first mech in a straight line, at any distance, without moving.',
      show: { aim: you(1) },
      play: [{ act: { type: 'power', die: you(1), target: foe(0) }, wins: 'attacker' }],
    },
    {
      say: 'A shot is a fight like any other. This one hits.',
      play: [resolve],
    },
    {
      say: 'The **6 Wisp** fires a **barrier** down a line, for free. Nothing can pass it.',
      show: { aim: you(0) },
      play: [{ type: 'power', die: you(0), to: at(3, 3) }],
    },
    {
      say: 'There are six kinds of mech, one for each number. The manual lists them all.',
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
    {
      say: 'Your **Power** is 5. Each fight you win raises it. At **6** you take over.',
      show: { look: [you(0), foe(0)] },
    },
    {
      say: 'One more win is all it takes.',
      play: [attack(you(0), foe(0), 'attacker')],
      then: { look: [you(0), foe(0)] },
    },
    {
      say: 'Won! Our Power reaches **6**.',
      play: [resolve, advance],
    },
    {
      say: '**Take Over!** Place a cube on **any** objective, then Power drops back to 1.',
      play: [{ type: 'infamy', planet: REFINERY }],
      then: { planets: { [REFINERY]: 'A free cube' } },
    },
    {
      say: 'That is the game: **claim with exact sums**, **fight for Power**, and be first to place every cube.',
    },
  ],
};

const defs: LessonDef[] = [goal, mechs, board, moving, claim, fight, holding, powers, takeover];

let built: Lesson[] | undefined;

/** The lessons, played through the engine on first use. */
export function lessons(): Lesson[] {
  return (built ??= defs.map(buildLesson));
}
