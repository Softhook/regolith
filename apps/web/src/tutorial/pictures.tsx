import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionHex, MissileIcon } from '../components/Card';
import {
  Arrow,
  CubeIcon,
  Diagram,
  Dots,
  DieFace,
  DieIcon,
  Glow,
  Note,
  Path,
  PlanetIcon,
  PlanetMarks,
  Ship,
  Tile,
  around,
  flower,
  within,
  type At,
} from '../rulebook/diagrams';
import { GoalAnimation, MechKey, MechKeys, MechProfile } from '../rulebook/concepts';

/**
 * The tutorial's pictures: one idea per screen, drawn with the game's own artwork and played once through, a
 * step at a time, with a line of words under each step. A picture is its steps (how long each is held and
 * what it says) and a drawing of each step, kept together here so changing one means looking in one place.
 * Without motion it shows its last step, where everything it explains is on show.
 *
 * To add one: write its `Picture` below and list it in `PICTURES`; a lesson then shows it as `{ picture: name }`.
 */

interface Step {
  /** How long the step is held, in ms. */
  hold: number;
  /** What it says, under the drawing; `**bold**` is what to take away. Empty for a drawing that says it all. */
  say: string;
}

interface Picture {
  steps: readonly Step[];
  /** The drawing at step `s`, counted from 0. */
  draw: (s: number) => ReactNode;
}

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The step a picture is at: on to the next after the time held, resting on the last. */
function useStep(steps: readonly Step[]): number {
  const [step, setStep] = useState(0);
  const calm = useMemo(still, []);
  const last = steps.length - 1;
  useEffect(() => {
    if (calm || step === last) return;
    const t = window.setTimeout(() => setStep(step + 1), steps[step].hold);
    return () => window.clearTimeout(t);
  }, [step, calm, steps, last]);
  return calm ? last : step;
}

/** Words with `**bold**` set in bold. */
export function Words({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (
        <Fragment key={i}>{i % 2 ? <b>{part}</b> : part}</Fragment>
      ))}
    </>
  );
}

const at = (r: number, c: number): At => [r, c];
/** The tiles' middles, as in the manual's diagrams: one tile at [0, 0], the next to its upper right. */
const HERE = at(0, 0);
const RIGHT = at(-2, 3);
const TWO_TILES = [...flower(HERE), ...flower(RIGHT)];

// ------------------------------------------------------------------ the map

const SPACES: Picture = {
  steps: [
    { hold: 2000, say: 'The map is made of **hexagon spaces**.' },
    { hold: 2000, say: 'A mech stands on a space.' },
    { hold: 3000, say: 'Each space holds **one mech**.' },
  ],
  draw: (s) => (
    <Diagram cells={flower(HERE)} scale={2.1} label="A map of hexagon spaces, with a mech on some of them.">
      <Tile id="blank-01" at={HERE} />
      <Glow cells={flower(HERE)} tone="plain" />
      {s >= 1 && <Ship at={at(0, -1)} v={5} />}
      {s >= 2 && <Ship at={at(0, 1)} v={3} />}
    </Diagram>
  ),
};

const OBJECTIVE: Picture = {
  steps: [
    { hold: 3000, say: 'An **objective** is a numbered building, from **7** to **10**. The bigger the number, the harder to claim.' },
    { hold: 2400, say: 'A **7** has room for **1** cube.' },
    { hold: 2400, say: 'An **8** has room for **2** cubes.' },
    { hold: 2400, say: 'A **9** has room for **3** cubes.' },
    { hold: 2400, say: 'A **10** has room for **4** cubes. Only one of them can be yours.' },
  ],
  draw: (s) => (
    <div className="mn-sizes mn-sizes-big" role="img" aria-label="A 7 holds 1 cube, an 8 holds 2, a 9 holds 3 and a 10 holds 4.">
      {[7, 8, 9, 10].map((n) => {
        const on = s === 0 || s === n - 6;
        return (
          <div key={n} className={on ? 'on' : 'off'}>
            <PlanetIcon n={n} size={80} />
            <span className="mn-spaces">
              {Array.from({ length: n - 6 }, (_, i) => (
                <CubeIcon key={i} size={18} empty />
              ))}
            </span>
            <small>{s === 0 ? '' : `holds ${n - 6}`}</small>
          </div>
        );
      })}
    </div>
  ),
};

const RING = around(HERE);
const PERIMETER: Picture = {
  steps: [
    { hold: 2000, say: 'This is an objective, an **8**.' },
    // The six spaces light up one at a time, under the same words.
    ...[450, 450, 450, 450, 450, 3400].map((hold) => ({ hold, say: 'The six spaces around it are its **perimeter**.' })),
  ],
  draw: (s) => (
    <Diagram cells={flower(HERE)} scale={2.6} label="An 8, and the six spaces around it, its perimeter.">
      <Tile id="p8-01" at={HERE} />
      <Glow cells={RING.slice(0, Math.min(s, 6))} />
      <PlanetMarks at={HERE} n={8} />
    </Diagram>
  ),
};

const HOME: Picture = {
  steps: [
    { hold: 2200, say: 'Each player has a **home** objective.' },
    { hold: 3600, say: 'Each starts with a **cube** on their home. Yours is the one in your colour.' },
    { hold: 3800, say: 'You have **5 cubes** in all: one down, four to go.' },
  ],
  draw: (s) => (
    <div className="mn-home">
      <Diagram cells={TWO_TILES} scale={2.1} label="Two home objectives, each with its player's cube.">
        <Tile id="p7-01" at={HERE} />
        <Tile id="p7-01" at={RIGHT} />
        <PlanetMarks at={HERE} n={7} cubes={s >= 1 ? ['you'] : []} />
        <PlanetMarks at={RIGHT} n={7} cubes={s >= 1 ? ['foe'] : []} />
      </Diagram>
      <div className={s >= 2 ? 'mn-tray on' : 'mn-tray'} aria-label="Your 5 cubes, 1 placed">
        {Array.from({ length: 5 }, (_, i) => (
          <CubeIcon key={i} size={30} empty={i > 0} />
        ))}
      </div>
    </div>
  ),
};

// ------------------------------------------------------------------ the turn

const MOVES = [
  ['Move', 1],
  ['Attack', 1],
  ['Drop', 1],
  ['Refit', 1],
  ['Claim', 2],
] as const;

const TURN: Picture = {
  steps: [
    { hold: 2800, say: 'On your turn you have **3 actions** to spend.' },
    { hold: 2600, say: 'A **claim** costs **2** actions.' },
    { hold: 3800, say: 'A **move** or an **attack** costs **1**. Each mech moves or attacks **once** a turn.' },
    { hold: 3200, say: 'No actions left: the turn passes to your **rival**.' },
  ],
  draw: (s) => {
    const left = [3, 1, 0, 0][s];
    const used = [undefined, 'Claim', 'Move', undefined][s];
    return (
      <div className="mn-turn">
        <div className="mn-actionbar" role="img" aria-label={`${left} of 3 actions left`}>
          {[0, 1, 2].map((i) => (
            <ActionHex key={i} size={56} off={i >= left} />
          ))}
        </div>
        <div className="mn-chips">
          {MOVES.map(([name, cost]) => (
            <span key={name} className={name === used ? 'mn-chip on' : 'mn-chip'}>
              <b>{name}</b>
              <i>
                {Array.from({ length: cost }, (_, i) => (
                  <ActionHex key={i} size={14} />
                ))}
              </i>
            </span>
          ))}
        </div>
        <p className="mn-turn-over" aria-hidden={s !== 3}>
          {s === 3 ? 'Rival’s turn' : ''}
        </p>
      </div>
    );
  },
};

/** Open ground three steps all round a lone 3: nothing in its way, so only the steps are on show. */
const FIELD = within(3);
const WALK = [HERE, at(0, 1), at(0, 2), at(0, 3)];

const REACH: Picture = {
  steps: [
    { hold: 2400, say: 'A mech moves **one space at a time**.' },
    { hold: 1800, say: 'Then another…' },
    { hold: 3400, say: '…up to its number, but **never more than 3**.' },
    { hold: 1100, say: 'Pick a space, and it walks there, a step at a time.' },
    { hold: 1100, say: 'Pick a space, and it walks there, a step at a time.' },
    { hold: 3000, say: 'Pick a space, and it walks there, a step at a time.' },
  ],
  draw: (s) => {
    // From step 3 on, the 3 walks along WALK, one space a step, leaving its trail behind.
    const walked = Math.max(0, s - 2);
    return (
      <Diagram cells={FIELD} scale={1.9} label="A 3 on open ground, and every space it can reach in up to 3 steps.">
        <Glow cells={FIELD} tone="plain" />
        {s < 3 && <Dots cells={within(s + 1).filter((p) => p[0] || p[1])} />}
        {walked > 0 && (
          <>
            <Ship at={HERE} v={3} ghost />
            <Dots cells={WALK.slice(walked + 1)} />
            <Path cells={WALK.slice(0, walked + 1)} />
          </>
        )}
        <Ship at={WALK[walked]} v={3} />
      </Diagram>
    );
  },
};

// ------------------------------------------------------------------ claiming

interface Sum {
  mine: readonly (readonly [At, number])[];
  /** What the sum is and whether it counts. */
  result?: { ok: boolean; text: string };
}

const SUMS: Sum[] = [
  { mine: [] },
  { mine: [[at(-1, 0), 6]] },
  {
    mine: [
      [at(-1, 0), 6],
      [at(0, 1), 3],
    ],
    result: { ok: true, text: 'exactly 9: claimed' },
  },
  {
    mine: [
      [at(-1, 0), 6],
      [at(0, 1), 3],
      [at(1, 0), 2],
    ],
    result: { ok: false, text: 'not 9: no claim' },
  },
];

const SUM: Picture = {
  steps: [
    { hold: 3000, say: 'To **claim** an objective, your mechs on its **perimeter** must add up to its number.' },
    { hold: 2400, say: 'This is a **9**. A 6 stands on its perimeter, so the sum is 6.' },
    { hold: 3000, say: '6 + 3 = **9**. Exactly right: a cube of yours lands on it.' },
    { hold: 3400, say: '**Every** mech of yours there counts. 6 + 3 + 2 is 11, not 9.' },
  ],
  draw: (s) => {
    const { mine, result } = SUMS[s];
    const total = mine.reduce((n, [, v]) => n + v, 0);
    return (
      <div className="mn-sumscene">
        <Diagram cells={flower(HERE)} scale={2.3} label="A 9 and the mechs on its perimeter.">
          <Tile id="p9-01" at={HERE} />
          <Glow cells={RING} />
          <PlanetMarks at={HERE} n={9} cubes={s === 2 ? ['you'] : []} />
          {mine.map(([p, v]) => (
            <Ship key={p.join()} at={p} v={v} />
          ))}
        </Diagram>
        <div className="mn-sum-eq">
          <div className="mn-eq" aria-label={`${total}`}>
            {mine.length === 0 && <span className="mn-eq-none">no mechs yet</span>}
            {mine.map(([p, v], i) => (
              <Fragment key={p.join()}>
                {i > 0 && <b>+</b>}
                <DieIcon v={v} size={40} />
              </Fragment>
            ))}
            <b>=</b>
            <span className={result ? (result.ok ? 'mn-total win' : 'mn-total no') : 'mn-total'}>{total}</span>
            <b>needs</b>
            <PlanetIcon n={9} size={34} />
          </div>
          <div className={result ? (result.ok ? 'mn-eq-result mn-ok' : 'mn-eq-result mn-no') : 'mn-eq-result'}>{result?.text ?? ' '}</div>
        </div>
      </div>
    );
  },
};

// ------------------------------------------------------------------ fighting

interface Roll {
  mech: number;
  die?: number;
}
interface Fight {
  a: Roll;
  d: Roll;
  win?: 'a' | 'd';
  atomic?: boolean;
}
const FIGHTS: Fight[] = [
  { a: { mech: 2 }, d: { mech: 4 } },
  { a: { mech: 2, die: 3 }, d: { mech: 4 } },
  { a: { mech: 2, die: 3 }, d: { mech: 4, die: 2 } },
  { a: { mech: 2, die: 3 }, d: { mech: 4, die: 2 }, win: 'a' },
  { a: { mech: 3, die: 2 }, d: { mech: 4, die: 1 }, win: 'a' },
  { a: { mech: 3, die: 5 }, d: { mech: 4, die: 2 }, win: 'd', atomic: true },
  { a: { mech: 3, die: 1 }, d: { mech: 4, die: 2 }, win: 'a', atomic: true },
];

function FightSide({ role, roll, win, lose }: { role: 'Attacker' | 'Defender'; roll: Roll; win: boolean; lose: boolean }) {
  const atk = role === 'Attacker';
  const total = roll.die === undefined ? undefined : roll.mech + roll.die;
  return (
    <div className={`${atk ? 'mn-side mn-you-side' : 'mn-side mn-foe-side'}${lose ? ' lose' : ''}`}>
      <small>{role}</small>
      <div className="mn-eq">
        <span className="mn-eq-part">
          <DieIcon v={roll.mech} kind={atk ? 'you' : 'foe'} size={46} />
          <i>mech</i>
        </span>
        <b>+</b>
        <span className="mn-eq-part">
          {roll.die === undefined ? (
            <span className="mn-slot">?</span>
          ) : (
            <span className="mn-roll" key={roll.die}>
              <DieIcon v={roll.die} kind={atk ? 'atk' : 'def'} size={46} />
            </span>
          )}
          <i>{atk ? 'attack' : 'defence'} die</i>
        </span>
        <b>=</b>
        <span className={win ? 'mn-total win' : 'mn-total'}>{total ?? ''}</span>
      </div>
    </div>
  );
}

const FIGHT: Picture = {
  steps: [
    { hold: 2400, say: 'To **attack**, move into an enemy mech. Both players roll a die and add their mech’s number.' },
    { hold: 2400, say: 'The attacker rolls the **black** die: 2 + 3 = 5.' },
    { hold: 2400, say: 'The defender rolls the **white** die: 4 + 2 = 6.' },
    { hold: 3200, say: 'The **lower total wins**. 5 beats 6.' },
    { hold: 3400, say: 'A tie? **The attacker wins ties.**' },
    { hold: 3000, say: 'Losing the roll? Spend your **atomic**: it turns your die into a **1**.' },
    { hold: 3600, say: 'Now 3 + 1 = 4 beats 6. You get **one** atomic each.' },
  ],
  draw: (s) => {
    const f = FIGHTS[s];
    return (
      <div className="mn-fightscene">
        <div className="mn-fight">
          <FightSide role="Attacker" roll={f.a} win={f.win === 'a'} lose={f.win === 'd'} />
          <div className="mn-vs">vs</div>
          <FightSide role="Defender" roll={f.d} win={f.win === 'd'} lose={f.win === 'a'} />
        </div>
        <div className={f.atomic ? 'mn-atomic on' : 'mn-atomic'}>
          <MissileIcon size={26} /> <span>Atomic</span>
        </div>
      </div>
    );
  },
};

const OUT_YARD = (
  <>
    <rect className="mn-yard" x={-128} y={-34} width={62} height={68} rx={8} />
    <Note x={-97} y={-25}>
      SALVAGE
    </Note>
  </>
);

const OUTCOME: Picture = {
  steps: [
    { hold: 2200, say: 'After the roll, the loser pays. Our 2 attacks their 4.' },
    { hold: 2200, say: 'The attacker rolled **lower**, so it wins.' },
    { hold: 3200, say: 'The loser is **destroyed** and goes to its owner’s **salvage yard**. The winner steps in.' },
    { hold: 2400, say: 'Now our 2 attacks their 6, and rolls higher…' },
    { hold: 3200, say: '…the attacker **bounces back**. Nothing is destroyed, and a failed attack costs nothing else.' },
  ],
  draw: (s) => {
    return (
      <Diagram
        cells={flower(HERE)}
        left={78}
        scale={2.1}
        label="An attack that wins destroys the defender, and one that loses bounces back."
      >
        {OUT_YARD}
        <Tile id="blank-01" at={HERE} />
        {s === 2 && <DieFace x={-97} y={6} v={4} kind="foe" />}
        {(s === 0 || s === 1) && <Ship at={HERE} v={4} who="foe" />}
        {s >= 3 && <Ship at={HERE} v={6} who="foe" />}
        {s === 1 && <Path cells={[at(0, -1), HERE]} attack />}
        {s === 3 && <Path cells={[at(0, -1), HERE]} attack />}
        {s === 2 ? <Ship at={HERE} v={2} /> : <Ship at={at(0, -1)} v={2} />}
      </Diagram>
    );
  },
};

// ------------------------------------------------------------------ holding ground

/** Open ground round an enemy 4: its zone, and the walk past it that our 3 wants. */
const GROUND = within(2);
const ZONE = around(HERE);
const ZONE_ROUTE = [at(2, -1), at(1, -1), at(0, -1), at(-1, -1)];

const ZONE_SCENE: Picture = {
  steps: [
    { hold: 2600, say: 'An enemy mech controls the **spaces next to it**: its **zone**.' },
    { hold: 2400, say: 'Our 3 wants to walk past it…' },
    { hold: 2800, say: '…but entering the zone, it **must stop**, even with steps to spare.' },
    { hold: 2800, say: 'A stopped mech can still **attack** from there.' },
  ],
  draw: (s) => (
    <Diagram cells={GROUND} scale={2.1} label="A mech that moves next to an enemy must stop there, and can still attack it.">
      <Glow cells={GROUND} tone="plain" />
      <Glow cells={ZONE} tone="zone" />
      <Ship at={HERE} v={4} who="foe" />
      {s === 1 && <Path cells={ZONE_ROUTE} />}
      {s === 3 && <Path cells={[ZONE_ROUTE[1], HERE]} attack />}
      <Ship at={s >= 2 ? ZONE_ROUTE[1] : ZONE_ROUTE[0]} v={3} />
    </Diagram>
  ),
};

const CONTESTED: Picture = {
  steps: [
    { hold: 2600, say: 'Your 5 and 3 make **8** here…' },
    { hold: 3000, say: '…but an **enemy mech** on the perimeter makes it **contested**.' },
    { hold: 2600, say: '**Push the enemy off**: attack it.' },
    { hold: 3000, say: 'The enemy is gone: now the 8 can be claimed.' },
  ],
  draw: (s) => (
    <Diagram cells={flower(HERE)} scale={2.6} label="Your 5 and 3 make 8, but an enemy 6 on the perimeter blocks the claim.">
      <Tile id="p8-01" at={HERE} />
      <Glow cells={RING} />
      <PlanetMarks at={HERE} n={8} cubes={s === 3 ? ['you'] : []} />
      {s >= 1 && s <= 2 && <Ship at={at(0, -1)} v={6} who="foe" />}
      {s === 2 && <Path cells={[at(-1, 0), at(0, -1)]} attack />}
      <Ship at={at(-1, 0)} v={5} />
      <Ship at={at(1, 0)} v={3} />
    </Diagram>
  ),
};

// ------------------------------------------------------------------ bringing mechs back

const DROP: Picture = {
  steps: [
    { hold: 2800, say: 'A destroyed mech waits in your **salvage yard**.' },
    { hold: 3200, say: '**Drop** it: put it on an empty perimeter space of an objective that holds **your cube**.' },
    { hold: 3000, say: 'It keeps its number, and it is back in the fight.' },
  ],
  draw: (s) => (
    <Diagram
      cells={flower(HERE)}
      left={78}
      scale={2.1}
      label="A mech goes from your salvage yard onto the perimeter of an objective holding your cube."
    >
      {OUT_YARD}
      <Tile id="p8-02" at={HERE} />
      <Glow cells={s === 1 ? RING : []} />
      <PlanetMarks at={HERE} n={8} cubes={['you']} />
      {s < 2 && <DieFace x={-97} y={6} v={4} />}
      {s === 1 && (
        <>
          <Ship at={at(0, -1)} v={4} ghost />
          <Arrow x1={-78} y1={-4} x2={-46} y2={-16} curve={14} />
        </>
      )}
      {s === 2 && <Ship at={at(0, -1)} v={4} />}
    </Diagram>
  ),
};

const REFIT: Picture = {
  steps: [
    { hold: 2600, say: 'A **6**, the Wisp. Not the mech you need right now.' },
    { hold: 2800, say: '**Refit**: re-roll it. A new number is a **new mech**.' },
    { hold: 3000, say: 'It must show a number it **hasn’t shown yet this turn**.' },
  ],
  draw: (s) => (
    <div className="mn-refit">
      <MechKey v={s === 0 ? 6 : 2} />
      <span className={s === 1 ? 'mn-refit-arrow spin' : 'mn-refit-arrow'} aria-hidden="true">
        ↻
      </span>
    </div>
  ),
};

// ------------------------------------------------------------------ power

/** Power, step by step: each win raises it and a loss in defence lowers it, until it reaches 6. */
const POWERS = [1, 2, 3, 2, 3, 4, 5, 6, 6, 1];
const POWER: Picture = {
  steps: [
    { hold: 1900, say: 'Your **Power** starts at **1**.' },
    { hold: 1700, say: 'Win a fight as the attacker: **+1 Power**.' },
    { hold: 1700, say: 'Win again: **+1**.' },
    { hold: 1900, say: 'Lose a fight as the defender: **−1**.' },
    { hold: 1500, say: 'Back to winning: **+1**…' },
    { hold: 1500, say: '…**+1**…' },
    { hold: 1500, say: '…**+1**…' },
    { hold: 2400, say: 'At **6** you **take over**!' },
    { hold: 2800, say: 'Place a cube on **any** objective, even a contested one.' },
    { hold: 2800, say: 'Then your Power drops back to **1**.' },
  ],
  draw: (s) => {
    const power = POWERS[s];
    return (
      <div className="mn-powerscene">
        <small>Power</small>
        <div className="mn-track mn-track-dom" role="img" aria-label={`Power ${power} of 6`}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <span key={n} className={n <= power ? 'on' : ''}>
              {n}
            </span>
          ))}
          <span className="mn-track-end">
            → <CubeIcon size={26} />
          </span>
        </div>
        <div className="mn-power-target">
          <PlanetIcon n={9} size={74} cubes={s >= 8 ? ['you'] : []} />
          <small>{s >= 8 ? 'a free cube' : 'any objective'}</small>
        </div>
      </div>
    );
  },
};

// ------------------------------------------------------------------ screens with one step

/** A picture with nothing to play: one drawing, held for `hold` ms with `say` under it. */
const single = (hold: number, say: string, drawing: ReactNode): Picture => ({ steps: [{ hold, say }], draw: () => drawing });

/** One mech on a screen of its own. Its drawing names it and shows its reach and ability, so it says nothing more. */
const mech = (v: number) => single(7000, '', <MechProfile v={v} />);

const PICTURES = {
  goal: single(7000, 'Welcome to **Regolith**. Be the first to place **all your cubes** on **objectives**.', <GoalAnimation />),
  lineup: single(
    9000,
    'Your pieces are **mechs**: dice on the map, numbered **1 to 6**. In a fight **low is strong**. Each kind has an **ability**.',
    <MechKeys />,
  ),
  mech1: mech(1),
  mech2: mech(2),
  mech3: mech(3),
  mech4: mech(4),
  mech5: mech(5),
  mech6: mech(6),
  spaces: SPACES,
  objective: OBJECTIVE,
  perimeter: PERIMETER,
  home: HOME,
  turn: TURN,
  reach: REACH,
  sum: SUM,
  fight: FIGHT,
  outcome: OUTCOME,
  zone: ZONE_SCENE,
  contested: CONTESTED,
  drop: DROP,
  refit: REFIT,
  power: POWER,
} satisfies Record<string, Picture>;

export type PictureName = keyof typeof PICTURES;

/** How long a picture takes to play once through, in ms. */
export const pictureLength = (name: PictureName) => PICTURES[name].steps.reduce((n, { hold }) => n + hold, 0);

/** A picture, played once through from its first step. */
export function PictureView({ name }: { name: PictureName }) {
  const { steps, draw } = PICTURES[name];
  const step = useStep(steps);
  const { say } = steps[step];
  return (
    <div className="mn-scene">
      <div className="mn-scene-art">{draw(step)}</div>
      {say && (
        <p className="mn-scene-note" key={say} aria-live="polite">
          <Words text={say} />
        </p>
      )}
    </div>
  );
}
