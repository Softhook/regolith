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

/** A lesson told wholly in pictures: no mechs, no counters. */
const SCREEN = { setup: { you: [], foe: [] }, hud: [] } satisfies Pick<LessonDef, 'setup' | 'hud'>;

const goal: LessonDef = {
  id: 'goal',
  title: 'The goal',
  blurb: 'What wins the game',
  ...SCREEN,
  beats: [
    {
      say: 'Welcome to **Regolith**. Be the first to place **all your cubes** on **objectives**. This tutorial shows how.',
      key: { goal: true },
    },
  ],
};

const mechs: LessonDef = {
  id: 'mechs',
  title: 'Your mechs',
  blurb: 'Six kinds, one number each',
  ...SCREEN,
  beats: [
    {
      say: 'Your pieces are **mechs**, dice on the map. A mech’s number, **1 to 6**, is its kind. In a fight **low is strong**: a 1 is the toughest, a 6 the weakest.',
      key: { lineup: true },
    },
  ],
};

const map: LessonDef = {
  id: 'map',
  title: 'The map',
  blurb: 'Spaces, objectives and cubes',
  setup: { you: [], foe: [] },
  hud: ['cubes'],
  beats: [
    { say: 'The map is made of **spaces**, and each one holds **one mech**.', key: { scene: 'spaces' }, hold: 8800 },
    {
      say: 'Some spaces are **objectives**, numbered **7 to 10**. A bigger one is harder to claim and holds more cubes.',
      key: { scene: 'objective' },
      hold: 12200,
    },
    { say: 'The six spaces around an objective are its **perimeter**. Mechs there claim it.', key: { scene: 'perimeter' }, hold: 9800 },
    {
      say: 'Each player starts with a cube on their **home** objective. **Place all 5 cubes** and you win.',
      key: { scene: 'home' },
      hold: 9800,
    },
    {
      say: 'Here is the practice map: two homes, and the **Refinery**, an 8.',
      show: { planets: { [HOME.you]: 'Your home', [HOME.foe]: 'Rival’s home', [REFINERY]: 'Refinery: an 8' } },
    },
    {
      say: 'There are two ways to place a cube: **Claim** an objective with your mechs, or **Take Over** by winning fights. First, how a turn works.',
    },
  ],
};

const turn: LessonDef = {
  id: 'turn',
  title: 'Your turn',
  blurb: 'Three actions',
  ...SCREEN,
  beats: [
    {
      say: 'A turn is **3 actions**. A **move** or an **attack** costs **1**, a **claim** costs **2**. Each mech moves or attacks **once** a turn.',
      key: { scene: 'turn' },
      hold: 11200,
    },
  ],
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
    {
      say: 'A mech moves **one space at a time**, up to its number but **never more than 3**. Objectives and other mechs block the way.',
      key: { scene: 'reach' },
      hold: 11200,
    },
    {
      say: 'On the board, the **dots** show every space this 3 can reach.',
      show: { pick: you(0) },
    },
    {
      say: 'We pick one, and the 3 walks there a space at a time.',
      play: [move(you(0), 4, 3)],
      show: { pick: you(0) },
    },
    {
      say: 'That was **1 action** of the 3. A mech that has moved cannot move again this turn.',
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
      say: 'To **claim** an objective, your mechs on its perimeter must add up to its number **exactly**, with no enemy there.',
      key: { scene: 'sum' },
      hold: 13800,
    },
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
      say: 'To **attack**, move into an enemy mech. Each side rolls a die and adds its mech’s number. **Lower total wins**, and ties go to the attacker.',
      key: { scene: 'fight' },
      hold: 19000,
    },
    {
      say: 'The loser is **destroyed**. If the attacker loses, it just **bounces back**.',
      key: { scene: 'outcome' },
      hold: 13000,
    },
    {
      say: 'On the board: our strong 2 attacks the enemy 6.',
      show: { pick: you(1) },
      play: [attack(you(1), foe(1), 'attacker')],
    },
    {
      say: 'We win: the rival’s mech is **destroyed**, and ours steps into its space.',
      play: [resolve, advance],
    },
    {
      say: 'Now our weak 5 attacks the strong 1, a bad idea.',
      show: { pick: you(0), look: [foe(0)] },
      play: [attack(you(0), foe(0), 'defender')],
    },
    {
      say: 'It loses, but nothing is destroyed: an attacker that loses just **bounces back**.',
      play: [resolve],
    },
    {
      say: 'Winning raised our **Power** by 1. Power is the other way to get cubes.',
    },
  ],
};

const holding: LessonDef = {
  id: 'holding',
  title: 'Blocking',
  blurb: 'Enemy mechs get in the way',
  setup: {
    you: [[2, 2, 3]],
    foe: [[3, 3, 4]],
  },
  hud: ['actions'],
  beats: [
    {
      say: 'An enemy mech controls the **spaces next to it**. A mech that moves into one **must stop**, but can still attack.',
      key: { scene: 'zone' },
      hold: 9800,
    },
    {
      say: 'An enemy mech on an objective’s perimeter makes it **contested**: nobody else can claim it until it is pushed off.',
      key: { scene: 'contested' },
      hold: 10600,
    },
    {
      say: 'On the board, our 3 had moves to spare, but it stops beside the enemy.',
      show: { pick: you(0), look: [foe(0)] },
      play: [move(you(0), 2, 3)],
      then: { look: [you(0), foe(0)] },
    },
    {
      say: 'The enemy 4 is on the Refinery’s perimeter, so the Refinery is **contested**.',
      show: { planets: { [REFINERY]: 'Contested' }, look: [foe(0)] },
    },
  ],
};

const salvage: LessonDef = {
  id: 'salvage',
  title: 'Drop and Refit',
  blurb: 'Bringing mechs back',
  ...SCREEN,
  beats: [
    {
      say: 'A destroyed mech waits in your **salvage yard**. A **drop** puts it back on the map, next to an objective of yours.',
      key: { scene: 'drop' },
      hold: 8800,
    },
    {
      say: 'A **refit** re-rolls a mech. A new number is a **new mech**, and it can change a sum.',
      key: { scene: 'refit' },
      hold: 8000,
    },
  ],
};

/** One screen for each mech, 1 to 6, with no map: its drawing, how far it moves and its ability. */
const ABILITY_SAY: Record<number, string> = {
  1: 'The **Breacher** (1): the strongest mech, but it moves only **1** space.',
  2: 'The **Behemoth** (2): strong, and it can **carry** a friend along.',
  3: 'The **Tactician** (3): it can **swap** places with any of your mechs.',
  4: 'The **Chameleon** (4): it can turn itself into a 3 or a 5.',
  5: 'The **Sniper** (5): it **shoots** down a straight line, from any distance.',
  6: 'The **Wisp** (6): weakest in a fight, but it can fire a **barrier** for free.',
};

const abilities: LessonDef = {
  id: 'abilities',
  title: 'Mech abilities',
  blurb: 'Every kind has a trick',
  ...SCREEN,
  beats: [
    {
      say: 'Last, the **abilities**. Each kind of mech has one, used on your turn. You can come back to this screen any time.',
      key: { lineup: true },
    },
    ...[1, 2, 3, 4, 5, 6].map((v) => ({ say: ABILITY_SAY[v], key: { mech: v } })),
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
      say: 'Each fight you win raises your **Power**, and each fight you lose in defence lowers it. At **6**, you take over.',
      key: { scene: 'power' },
      hold: 19500,
    },
    {
      say: 'Say your **Power** is already **5**.',
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
      say: 'That is how cubes get placed: **claim with exact sums**, or **fight for Power**.',
    },
  ],
};

const defs: LessonDef[] = [goal, map, mechs, turn, moving, claim, fight, takeover, holding, salvage, abilities];

let built: Lesson[] | undefined;

/** The lessons, played through the engine on first use. */
export function lessons(): Lesson[] {
  return (built ??= defs.map(buildLesson));
}
