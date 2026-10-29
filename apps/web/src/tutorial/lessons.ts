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
      say: 'Here is the training ground we will play on: two homes, and the **Refinery**, an 8.',
      show: { planets: { [HOME.you]: 'Your home', [HOME.foe]: 'Rival’s home', [REFINERY]: 'Refinery: an 8' } },
    },
    {
      say: 'Two ways to place cubes: **Claim** objectives with your mechs, or **Take Over** by winning fights. First, your turn.',
    },
  ],
};

const turn: LessonDef = {
  id: 'turn',
  title: 'Your turn',
  blurb: 'Three actions',
  setup: { you: [], foe: [] },
  hud: [],
  beats: [
    {
      say: 'A turn is **3 actions**. A move, an attack, a drop or a refit costs **1**, a claim **2**. Each mech moves or attacks **once** a turn.',
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
    you: [
      [3, 1, 3],
      [3, 0, 6],
    ],
  },
  hud: ['actions'],
  beats: [
    {
      say: 'A mech moves **one space at a time**, up to its number and **never more than 3**. Objectives and mechs are in the way.',
      key: { scene: 'reach' },
      hold: 11200,
    },
    {
      say: 'On the board, the **dots** show every space this 3 can reach.',
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
      say: 'Two actions spent, one left. A mech that has moved cannot move again this turn.',
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
      say: 'The loser of the fight is **destroyed**. If the attacker loses, it just **bounces back**.',
      key: { scene: 'outcome' },
      hold: 13000,
    },
    {
      say: 'Now on the board: our 5 is slow, and about to attack a fast 1.',
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
  setup: { you: [], foe: [] },
  hud: [],
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
      say: 'You met each mech’s **ability** earlier. Here are two at work on the map.',
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
      say: 'Each fight you win raises your **Power**, and each fight you lose in defence lowers it. At **6**, you take over.',
      key: { scene: 'power' },
      hold: 19500,
    },
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

const defs: LessonDef[] = [goal, mechs, map, turn, moving, claim, fight, holding, salvage, powers, takeover];

let built: Lesson[] | undefined;

/** The lessons, played through the engine on first use. */
export function lessons(): Lesson[] {
  return (built ??= defs.map(buildLesson));
}
