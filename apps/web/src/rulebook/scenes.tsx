import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionHex, MissileIcon } from '../components/Card';
import {
  Arrow,
  CubeIcon,
  Diagram,
  DieFace,
  DieIcon,
  Glow,
  Mark,
  Note,
  Path,
  PlanetIcon,
  PlanetMarks,
  Ship,
  Tile,
  around,
  centre,
  flower,
  reachable,
  type At,
} from './diagrams';
import { MechKey } from './concepts';

/**
 * The tutorial's picture lessons: one rule idea per screen, drawn with the game's own artwork and acted out in a
 * short loop, a step at a time, with a line of words under each step. Each scene is a list of steps (how long
 * each is held, what it says, what it draws); `Staged` plays them round and round. Without motion it shows the
 * last step, where everything the scene explains is on show.
 */

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The step a scene is at: on to the next after the time held, round to the first after the last. */
function useStep(holds: readonly number[]): number {
  const [step, setStep] = useState(0);
  const calm = useMemo(still, []);
  useEffect(() => {
    if (calm) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % holds.length), holds[step]);
    return () => window.clearTimeout(t);
  }, [step, calm, holds]);
  return calm ? holds.length - 1 : step;
}

/** Words with `**bold**` set in bold. */
function Words({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (
        <Fragment key={i}>{i % 2 ? <b>{part}</b> : part}</Fragment>
      ))}
    </>
  );
}

interface Steps {
  /** How long each step is held, in ms. */
  holds: readonly number[];
  /** What each step says. */
  notes: readonly string[];
  draw: (step: number) => ReactNode;
}

function Staged({ holds, notes, draw }: Steps) {
  const step = useStep(holds);
  const note = notes[step];
  return (
    <div className="mn-scene">
      <div className="mn-scene-art">{draw(step)}</div>
      <p className="mn-scene-note" key={note}>
        <Words text={note} />
      </p>
    </div>
  );
}

const at = (r: number, c: number): At => [r, c];
/** The tiles' middles, as in the manual's diagrams: one tile at [0, 0], the next to its upper right. */
const HERE = at(0, 0);
const RIGHT = at(-2, 3);
const TWO_TILES = [...flower(HERE), ...flower(RIGHT)];

/** The step number, in a circle on a space: how many steps a mech needs to get there. */
function Count({ cells, n }: { cells: readonly At[]; n: number }) {
  return (
    <g>
      {cells.map((p) => {
        const { x, y } = centre(p);
        return (
          <g key={p.join()} className="mn-count">
            <circle cx={x} cy={y} r={8} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central">
              {n}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ------------------------------------------------------------------ the map

const SPACES: Steps = {
  holds: [2000, 2000, 2200, 3000],
  notes: [
    'The map is made of **hexagon spaces**.',
    'A mech stands on a space.',
    'Mechs are on different spaces: a space holds **one mech**.',
    'A space that is taken is **closed** to the others.',
  ],
  draw: (s) => (
    <Diagram cells={flower(HERE)} scale={2.1} label="A map of hexagon spaces, with a mech on some of them.">
      <Tile id="blank-01" at={HERE} />
      <Glow cells={flower(HERE)} tone="plain" />
      {s >= 1 && <Ship at={at(0, -1)} v={5} />}
      {s >= 2 && <Ship at={at(0, 1)} v={3} who="foe" />}
      {s >= 3 && (
        <>
          <Ship at={at(1, -1)} v={2} />
          <Path cells={[at(1, -1), at(0, -1)]} />
          <Mark at={at(0, -1)} ok={false} />
        </>
      )}
    </Diagram>
  ),
};

const OBJECTIVE: Steps = {
  holds: [3000, 2400, 2400, 2400, 2400],
  notes: [
    'An **objective** is a numbered building, from **7** to **10**. The bigger the number, the harder to claim.',
    'A **7** has room for **1** cube.',
    'An **8** has room for **2** cubes.',
    'A **9** has room for **3** cubes.',
    'A **10** has room for **4** cubes. Only one of them can be yours.',
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
const PERIMETER: Steps = {
  holds: [2000, 450, 450, 450, 450, 450, 1600, 3400],
  notes: [
    'This is an objective, an **8**.',
    'The six spaces around it are its **perimeter**.',
    'The six spaces around it are its **perimeter**.',
    'The six spaces around it are its **perimeter**.',
    'The six spaces around it are its **perimeter**.',
    'The six spaces around it are its **perimeter**.',
    'The six spaces around it are its **perimeter**.',
    'Mechs standing on the perimeter are what **claim** it.',
  ],
  draw: (s) => (
    <Diagram cells={flower(HERE)} scale={2.6} label="An 8, and the six spaces around it, its perimeter.">
      <Tile id="p8-01" at={HERE} />
      <Glow cells={RING.slice(0, Math.min(s, 6))} />
      <PlanetMarks at={HERE} n={8} />
      {s >= 7 && (
        <>
          <Ship at={at(-1, 0)} v={5} />
          <Ship at={at(1, 0)} v={3} />
        </>
      )}
    </Diagram>
  ),
};

const HOME: Steps = {
  holds: [2200, 3600, 3800],
  notes: [
    'Each player has a **home** objective.',
    'Each starts with a **cube** on their home. Yours is the one in your colour.',
    'You have **5 cubes**: one is placed. **Place them all and you win.**',
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

const TURN: Steps = {
  holds: [2800, 2600, 2600, 3200],
  notes: [
    'On your turn you have **3 actions** to spend.',
    'A **claim** costs **2** actions.',
    'A **move** costs **1**.',
    'No actions left: the turn passes to your **rival**.',
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

const FROM = at(1, -1);
const FRIEND = at(-1, 1);
const BLOCKED = [HERE, RIGHT, FRIEND];
const RINGS = [1, 2, 3].map((k) => {
  const before = reachable(TWO_TILES, FROM, k - 1, BLOCKED);
  return reachable(TWO_TILES, FROM, k, BLOCKED).filter((p) => !before.some((q) => q[0] === p[0] && q[1] === p[1]));
});

const REACH: Steps = {
  holds: [2000, 1800, 1800, 3000, 3000],
  notes: [
    'A mech moves **one space at a time**.',
    'Every step goes to a space next to the last.',
    'It can go as far as its number…',
    '…but **never more than 3 spaces**, even a 5.',
    'Objectives and other mechs are **in the way**: go around them.',
  ],
  draw: (s) => (
    <Diagram cells={TWO_TILES} scale={2.1} label="A 5 moves up to 3 spaces, around the objectives and a friendly 2.">
      <Tile id="p9-01" at={HERE} />
      <Tile id="p8-01" at={RIGHT} />
      <PlanetMarks at={HERE} n={9} />
      <PlanetMarks at={RIGHT} n={8} />
      {RINGS.map((cells, k) => s >= k + 1 && <Count key={k} cells={cells} n={k + 1} />)}
      <Ship at={FRIEND} v={2} />
      <Ship at={FROM} v={5} />
      {s >= 4 && (
        <>
          <Mark at={HERE} ok={false} />
          <Mark at={FRIEND} ok={false} />
        </>
      )}
    </Diagram>
  ),
};

// ------------------------------------------------------------------ claiming

interface Sum {
  mine: readonly (readonly [At, number])[];
  foe?: readonly (readonly [At, number])[];
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
  {
    mine: [
      [at(-1, 0), 6],
      [at(0, 1), 3],
    ],
    foe: [[at(0, -1), 4]],
    result: { ok: false, text: 'enemy on the perimeter: no claim' },
  },
];

const SUM: Steps = {
  holds: [3000, 2400, 3000, 3400, 3400],
  notes: [
    'To **claim** an objective, your mechs on its **perimeter** must add up to its number.',
    'This is a **9**. A 6 stands on its perimeter, so the sum is 6.',
    '6 + 3 = **9**. Exactly right: a cube of yours lands on it.',
    '**Every** mech of yours there counts. 6 + 3 + 2 is 11, not 9.',
    'An **enemy mech** on the perimeter blocks the claim, whatever the sum.',
  ],
  draw: (s) => {
    const { mine, foe = [], result } = SUMS[s];
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
          {foe.map(([p, v]) => (
            <Ship key={p.join()} at={p} v={v} who="foe" />
          ))}
          {foe.length > 0 && <Mark at={foe[0][0]} ok={false} />}
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

const FIGHT: Steps = {
  holds: [2400, 2400, 2400, 3200, 3400, 3000, 3600],
  notes: [
    'To **attack**, move into an enemy mech. Both players roll a die and add their mech’s number.',
    'The attacker rolls the **black** die: 2 + 3 = 5.',
    'The defender rolls the **white** die: 4 + 2 = 6.',
    'The **lower total wins**. 5 beats 6.',
    'A tie? **The attacker wins ties.**',
    'Losing the roll? Spend your **atomic**: it turns your die into a **1**.',
    'Now 3 + 1 = 4 beats 6. You get **one** atomic each.',
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

const OUTCOME: Steps = {
  holds: [2200, 2200, 3200, 2400, 3200],
  notes: [
    'After the roll, the loser pays. Our 2 attacks their 4.',
    'The attacker rolled **lower**, so it wins.',
    'The loser is **destroyed** and goes to its owner’s **salvage yard**. The winner steps in.',
    'Now our 2 attacks their 6, and rolls higher…',
    '…the attacker **bounces back**. Nothing is destroyed, and a failed attack costs nothing else.',
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
        {s === 4 && <Mark at={at(0, -1)} ok={false} />}
      </Diagram>
    );
  },
};

// ------------------------------------------------------------------ holding ground

const FOE = at(-1, 2);
const ZONE = around(FOE).filter((p) => TWO_TILES.some((q) => q[0] === p[0] && q[1] === p[1]) && !(p[0] === RIGHT[0] && p[1] === RIGHT[1]));
const ZONE_ROUTE = [at(1, -1), at(1, 0), at(0, 1)];

const ZONE_SCENE: Steps = {
  holds: [2600, 2400, 2800, 2800],
  notes: [
    'An enemy mech controls the **spaces next to it**: its **zone**.',
    'Our 3 wants to walk past it…',
    '…but entering the zone, it **must stop**, even with steps to spare.',
    'A stopped mech can still **attack** from there.',
  ],
  draw: (s) => (
    <Diagram cells={TWO_TILES} scale={2.1} label="A mech that moves next to an enemy must stop there, and can still attack it.">
      <Tile id="p7-01" at={HERE} />
      <Tile id="p8-01" at={RIGHT} />
      <PlanetMarks at={HERE} n={7} />
      <PlanetMarks at={RIGHT} n={8} />
      <Glow cells={ZONE} tone="zone" />
      <Ship at={FOE} v={4} who="foe" />
      {s === 1 && <Path cells={ZONE_ROUTE} />}
      {s === 2 && (
        <>
          <Path cells={ZONE_ROUTE} />
          <Ship at={ZONE_ROUTE[2]} v={3} ghost />
          <Mark at={at(-1, 1)} ok={false} />
        </>
      )}
      {s === 3 && <Path cells={[ZONE_ROUTE[2], FOE]} attack />}
      <Ship at={s >= 3 ? ZONE_ROUTE[2] : ZONE_ROUTE[0]} v={3} />
    </Diagram>
  ),
};

const CONTESTED: Steps = {
  holds: [2600, 3000, 2600, 3000],
  notes: [
    'Your 5 and 3 on the perimeter make **8**: this 8 could be claimed.',
    'But an **enemy mech** on the perimeter makes it **contested**. Nobody can claim it.',
    'To claim it you must **push the enemy off**: attack it.',
    'The enemy is gone, the sum is right, and the claim works.',
  ],
  draw: (s) => (
    <Diagram cells={flower(HERE)} scale={2.6} label="Your 5 and 3 make 8, but an enemy 6 on the perimeter blocks the claim.">
      <Tile id="p8-01" at={HERE} />
      <Glow cells={RING} />
      <PlanetMarks at={HERE} n={8} cubes={s === 3 ? ['you'] : []} />
      {s >= 1 && s <= 2 && <Ship at={at(0, -1)} v={6} who="foe" />}
      {s === 2 && <Path cells={[at(-1, 0), at(0, -1)]} attack />}
      {s === 1 && <Mark at={at(0, -1)} ok={false} />}
      {s === 3 && (
        <>
          <Mark at={at(-1, 0)} ok />
          <Mark at={at(1, 0)} ok />
        </>
      )}
      <Ship at={at(-1, 0)} v={5} />
      <Ship at={at(1, 0)} v={3} />
    </Diagram>
  ),
};

// ------------------------------------------------------------------ bringing mechs back

const DROP: Steps = {
  holds: [2800, 3200, 3000],
  notes: [
    'A destroyed mech waits in your **salvage yard**.',
    '**Drop** it: put it on an empty perimeter space of an objective that holds **your cube**.',
    'It keeps its number, and it is back in the fight.',
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

const REFIT: Steps = {
  holds: [2600, 2800, 3000],
  notes: [
    'A **6**, the Wisp. Not the mech you need right now.',
    '**Refit**: re-roll it. A new number is a **new mech**.',
    'It must show a number it **hasn’t shown yet this turn**.',
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
const POWER: Steps = {
  holds: [1900, 1700, 1700, 1900, 1500, 1500, 1500, 2400, 2800, 2800],
  notes: [
    'Your **Power** starts at **1**.',
    'Win a fight as the attacker: **+1 Power**.',
    'Win again: **+1**.',
    'Lose a fight as the defender: **−1**.',
    'Back to winning: **+1**…',
    '…**+1**…',
    '…**+1**…',
    'At **6** you **take over**!',
    'Place a cube on **any** objective, even a contested one.',
    'Then your Power drops back to **1**.',
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

const SCENES = {
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
} as const;

export type SceneName = keyof typeof SCENES;

/** A picture lesson, by name. */
export function Scene({ name }: { name: SceneName }) {
  return <Staged {...SCENES[name]} />;
}
