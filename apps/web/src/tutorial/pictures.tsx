import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { reading } from './reading';

/**
 * The tutorial's pictures: one idea per screen, drawn with the game's own artwork and played once through, a
 * step at a time, with a line of words under each step. A picture is its steps (how long each is held and
 * what it says) and a drawing of each step, kept together here so changing one means looking in one place.
 * Every step is held at least as long as its words take to read (reading.ts). Without motion the steps still
 * follow one another, each drawn still (the animations are off: rulebook.css).
 *
 * To add one: write its `Picture` below and list it in `PICTURES`; a lesson then shows it as `{ picture: name }`.
 */

interface Step {
  /** How long the step is held at least, in ms: the drawing's pace. Words are always given time to be read. */
  hold: number;
  /** What it says, under the drawing; `**bold**` is what to take away. Empty for a drawing that says it all. */
  say: string;
}

interface Picture {
  steps: readonly Step[];
  /** The drawing at step `s`, counted from 0. */
  draw: (s: number) => ReactNode;
  /** Pictures in a row with the same scene share one screen: going from one to the next, only what differs changes. */
  scene?: string;
}

/**
 * The steps, held long enough to read: steps in a row under the same words share their time, and the last of
 * them is held on until those words have had the time they need.
 */
function readable(steps: readonly Step[]): Step[] {
  const out = steps.map((s) => ({ ...s }));
  for (let i = 0; i < out.length;) {
    let j = i;
    let held = 0;
    while (j < out.length && out[j].say === out[i].say) held += out[j++].hold;
    if (out[i].say) out[j - 1].hold += Math.max(0, reading(out[i].say) - held);
    i = j;
  }
  return out;
}

const picture = (steps: readonly Step[], draw: Picture['draw']): Picture => ({ steps: readable(steps), draw });

/** Steps under the same words, held `holds` ms each: the drawing moves on while the words stay. */
const under = (say: string, holds: readonly number[]): Step[] => holds.map((hold) => ({ hold, say }));

/** The step a picture is at: on to the next after the time held, while playing; `onEnd` once the last has been held. */
function useStep(steps: readonly Step[], playing: boolean, onEnd?: () => void): number {
  const [step, setStep] = useState(0);
  const end = useRef(onEnd);
  useEffect(() => {
    end.current = onEnd;
  });
  const last = steps.length - 1;
  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => (step === last ? end.current?.() : setStep(step + 1)), steps[step].hold);
    return () => window.clearTimeout(t);
  }, [step, playing, steps, last]);
  return step;
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

// ------------------------------------------------------------------ the mechs

const LINEUP = picture(
  [
    { hold: 0, say: 'Your pieces are **mechs**: dice numbered **1 to 6**, each kind with its own name.' },
    { hold: 0, say: 'Each kind also has an **ability**. Here they are, one by one.' },
  ],
  () => <MechKeys />,
);

// ------------------------------------------------------------------ the map

const SPACES = picture(
  [
    { hold: 0, say: 'The map is made of **hexagon spaces**.' },
    { hold: 0, say: 'A mech stands on a space.' },
    { hold: 0, say: 'Each space holds **one mech**.' },
  ],
  (s) => (
    <Diagram cells={flower(HERE)} scale={2.1} label="A map of hexagon spaces, with a mech on some of them.">
      <Tile id="blank-01" at={HERE} />
      <Glow cells={flower(HERE)} tone="plain" />
      {s >= 1 && <Ship at={at(0, -1)} v={5} />}
      {s >= 2 && <Ship at={at(0, 1)} v={3} />}
    </Diagram>
  ),
);

const OBJECTIVE = picture(
  [
    { hold: 0, say: 'An **objective** is a numbered building, from **7** to **10**.' },
    { hold: 0, say: 'A **7** has room for **1** cube.' },
    { hold: 0, say: 'An **8** has room for **2** cubes.' },
    { hold: 0, say: 'A **9** has room for **3** cubes.' },
    { hold: 0, say: 'A **10** has room for **4** cubes.' },
    { hold: 0, say: 'Each holds **at most one** of your cubes, so you need **several** objectives.' },
  ],
  (s) => (
    <div
      className="mn-sizes mn-sizes-big"
      role="img"
      aria-label="A 7 holds 1 cube, an 8 holds 2, a 9 holds 3 and a 10 holds 4, at most one of each player's."
    >
      {[7, 8, 9, 10].map((n) => {
        const on = s === 0 || s === 5 || s === n - 6;
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
);

const RING = around(HERE);
const PERIMETER = picture(
  [
    { hold: 0, say: 'This is an objective, an **8**.' },
    // The six spaces light up one at a time, under the same words.
    ...under('The six spaces around it are its **perimeter**.', [450, 450, 450, 450, 450, 1500]),
  ],
  (s) => (
    <Diagram cells={flower(HERE)} scale={2.6} label="An 8, and the six spaces around it, its perimeter.">
      <Tile id="p8-01" at={HERE} />
      <Glow cells={RING.slice(0, Math.min(s, 6))} />
      <PlanetMarks at={HERE} n={8} />
    </Diagram>
  ),
);

/** Where each side's 3 mechs start: round its home, on the sides away from the other home. */
const HOME_MECHS: readonly (readonly [At, number, 'you' | 'foe'])[] = [
  [at(1, 0), 5, 'you'],
  [at(0, -1), 3, 'you'],
  [at(1, -1), 2, 'you'],
  [at(-3, 3), 4, 'foe'],
  [at(-2, 4), 6, 'foe'],
  [at(-3, 4), 1, 'foe'],
];

const HOME = picture(
  [
    { hold: 0, say: 'Each player has a **home** objective.' },
    { hold: 0, say: 'Each starts with a **cube** on it, and their **3 mechs** around it.' },
    { hold: 0, say: 'The rest of your cubes wait beside the map.' },
  ],
  (s) => (
    <div className="mn-home">
      <Diagram cells={TWO_TILES} scale={2.1} label="Two home objectives, each with its player's cube and 3 mechs.">
        <Tile id="p7-01" at={HERE} />
        <Tile id="p7-01" at={RIGHT} />
        <PlanetMarks at={HERE} n={7} cubes={s >= 1 ? ['you'] : []} />
        <PlanetMarks at={RIGHT} n={7} cubes={s >= 1 ? ['foe'] : []} />
        {s >= 1 && HOME_MECHS.map(([p, v, who]) => <Ship key={p.join()} at={p} v={v} who={who} />)}
      </Diagram>
      {/* However many cubes the map gives: one placed, the rest to go. */}
      <div className={s >= 2 ? 'mn-tray on' : 'mn-tray'} aria-label="Your cubes: one placed, the rest to go">
        {Array.from({ length: 4 }, (_, i) => (
          <CubeIcon key={i} size={30} empty={i > 0} />
        ))}
        <span className="mn-tray-more" aria-hidden="true">
          …
        </span>
      </div>
    </div>
  ),
);

// ------------------------------------------------------------------ the turn

const MOVES = [
  ['Move', 1],
  ['Attack', 1],
  ['Drop', 1],
  ['Refit', 1],
  ['Claim', 2],
] as const;

/** The actions left at each step: 3, spent one at a time, then none. */
const LEFT = [3, 2, 1, 0, 0];

const TURN = picture(
  [
    { hold: 0, say: 'On your turn you have **3 actions** to spend.' },
    ...under('Spend them in any order, on any of your mechs…', [900, 900, 900]),
    { hold: 0, say: 'No actions left: the turn passes to your **rival**.' },
  ],
  (s) => {
    const left = LEFT[s];
    return (
      <div className="mn-turn">
        <div className="mn-actionbar" role="img" aria-label={`${left} of 3 actions left`}>
          {[0, 1, 2].map((i) => (
            <ActionHex key={i} size={56} off={i >= left} />
          ))}
        </div>
        <p className="mn-turn-over" aria-hidden={s !== 4}>
          {s === 4 ? 'Rival’s turn' : ''}
        </p>
      </div>
    );
  },
);

/** The actions by name, with what they cost; what each does is its own lesson, next. */
const ACTIONS = picture(
  [
    { hold: 0, say: 'There are **five** actions. The next lessons take them one by one.' },
    { hold: 0, say: '**Claim** costs **2** actions. The others cost **1**.' },
  ],
  (s) => {
    // Step 0 shows them all; step 1 lights up Claim, the one that costs 2.
    const [name, cost] = s ? MOVES[MOVES.length - 1] : [undefined, 0];
    return (
      <div className="mn-turn">
        <div className="mn-actionbar mn-spend" role="img" aria-label={name ? `${name} costs ${cost}` : 'Five actions'}>
          {Array.from({ length: cost }, (_, i) => (
            <ActionHex key={`${name}${i}`} size={56} />
          ))}
        </div>
        <div className="mn-chips">
          {MOVES.map(([n, c]) => (
            <span key={n} className={n === name ? 'mn-chip on' : name ? 'mn-chip off' : 'mn-chip'}>
              <b>{n}</b>
              <i>
                {Array.from({ length: c }, (_, i) => (
                  <ActionHex key={i} size={14} />
                ))}
              </i>
            </span>
          ))}
        </div>
      </div>
    );
  },
);

/** Open ground three steps all round a lone mech: nothing in its way, so only the steps are on show. */
const FIELD = within(3);
const WALK = [HERE, at(0, 1), at(0, 2), at(0, 3)];

const REACH = picture(
  [
    { hold: 0, say: 'A mech moves **one space** at a time…' },
    { hold: 0, say: '…up to its **number**: this 2 goes **2**. The whole move is **1 action**.' },
    { hold: 0, say: 'But **never more than 3**: a 5 or a 6 goes 3.' },
    ...under('Pick a space and it walks there. Each mech moves **once** a turn.', [900, 900, 1500]),
  ],
  (s) => {
    // A 2 shows a mech's number; a 5, the cap of 3, and then it walks along WALK, one space a step.
    const v = s < 2 ? 2 : 5;
    const walked = Math.max(0, s - 2);
    return (
      <Diagram cells={FIELD} scale={1.9} label="A 2 reaches 2 spaces; a 5 reaches 3, never more.">
        <Glow cells={FIELD} tone="plain" />
        {s < 3 && <Dots cells={within(s + 1).filter((p) => p[0] || p[1])} />}
        {walked > 0 && (
          <>
            <Ship at={HERE} v={v} ghost />
            <Dots cells={WALK.slice(walked + 1)} />
            <Path cells={WALK.slice(0, walked + 1)} />
          </>
        )}
        <Ship at={WALK[walked]} v={v} />
      </Diagram>
    );
  },
);

// ------------------------------------------------------------------ claiming

interface Sum {
  mine: readonly (readonly [At, number])[];
  /** What the sum is and whether it counts. */
  result?: { ok: boolean; text: string };
  claimed?: boolean;
}

const SIX: readonly [At, number] = [at(-1, 0), 6];
const THREE: readonly [At, number] = [at(0, 1), 3];
const TWO: readonly [At, number] = [at(1, 0), 2];

const SUMS: Sum[] = [
  { mine: [] },
  { mine: [SIX], result: { ok: false, text: 'not enough' } },
  { mine: [SIX, THREE, TWO], result: { ok: false, text: 'too many: no claim' } },
  { mine: [SIX, THREE], result: { ok: true, text: 'exactly 9' } },
  { mine: [SIX, THREE], result: { ok: true, text: 'claimed' }, claimed: true },
];

const SUM = picture(
  [
    { hold: 0, say: 'To **claim** an objective, your mechs on its **perimeter** must add up to **exactly** its number.' },
    { hold: 0, say: 'This is a **9**. A 6 on its perimeter makes 6: not enough.' },
    { hold: 0, say: 'A 3 and a 2 join it: 11. **Every** mech of yours there counts, so that’s too many.' },
    { hold: 0, say: 'The 2 steps away: 6 + 3 = **9**.' },
    { hold: 0, say: '**Claim** it: one of your cubes goes on. **One fewer** to place.' },
  ],
  (s) => {
    const { mine, result, claimed } = SUMS[s];
    const total = mine.reduce((n, [, v]) => n + v, 0);
    return (
      <div className="mn-sumscene">
        <Diagram cells={flower(HERE)} scale={2.3} label="A 9 and the mechs on its perimeter.">
          <Tile id="p9-01" at={HERE} />
          <Glow cells={RING} />
          <PlanetMarks at={HERE} n={9} cubes={claimed ? ['you'] : []} />
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
);

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
/** One fight, our 2 against their 4, rolled and then rolled again to show a tie and an atomic. */
const FIGHTS: Fight[] = [
  { a: { mech: 2 }, d: { mech: 4 } },
  { a: { mech: 2 }, d: { mech: 4 } },
  { a: { mech: 2, die: 3 }, d: { mech: 4 } },
  { a: { mech: 2, die: 3 }, d: { mech: 4, die: 2 } },
  { a: { mech: 2, die: 3 }, d: { mech: 4, die: 2 }, win: 'a' },
  { a: { mech: 2, die: 3 }, d: { mech: 4, die: 1 }, win: 'a' },
  { a: { mech: 2, die: 5 }, d: { mech: 4, die: 2 }, win: 'd', atomic: true },
  { a: { mech: 2, die: 1 }, d: { mech: 4, die: 2 }, win: 'a', atomic: true },
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

const FIGHT = picture(
  [
    { hold: 0, say: 'A mech **attacks** by moving into an enemy mech: that’s its move for the turn.' },
    { hold: 0, say: 'Each side rolls a die and adds its mech’s number.' },
    { hold: 0, say: 'The attacker rolls the **black** die: 2 + 3 = 5.' },
    { hold: 0, say: 'The defender rolls the **white** die: 4 + 2 = 6.' },
    { hold: 0, say: 'The **lower total wins**: 5 beats 6.' },
    { hold: 0, say: 'A tie? **The attacker wins ties.**' },
    { hold: 0, say: 'Losing the roll? Spend your **atomic**: it turns your die into a **1**.' },
    { hold: 0, say: 'Now 2 + 1 = 3 beats 6. You have **one** atomic for the **whole game**.' },
  ],
  (s) => {
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
);

const OUT_YARD = (
  <>
    <rect className="mn-yard" x={-128} y={-34} width={62} height={68} rx={8} />
    <Note x={-97} y={-25}>
      SALVAGE
    </Note>
  </>
);

/** Where our 2 attacks from, then where the next enemy stands. */
const FROM = at(0, -1);
const NEXT = at(0, 1);

const OUTCOME = picture(
  [
    { hold: 0, say: 'Our 2 attacks their 4, and **wins**.' },
    { hold: 0, say: 'The defender is **destroyed**: re-rolled, it goes to its owner’s **salvage yard**.' },
    { hold: 0, say: 'Our 2 may **step in**.' },
    { hold: 0, say: 'Next turn it attacks their 6, and **loses**…' },
    { hold: 0, say: '…so it goes back where it came from. Nothing else happens.' },
  ],
  (s) => (
    <Diagram cells={flower(HERE)} left={78} scale={2.1} label="An attack that wins destroys the defender, and one that loses goes back.">
      {OUT_YARD}
      <Tile id="blank-01" at={HERE} />
      {/* The destroyed 4, re-rolled: it waits in the yard as a 1. */}
      {s >= 1 && <DieFace x={-97} y={6} v={1} kind="foe" />}
      {s === 0 && <Ship at={HERE} v={4} who="foe" />}
      {s === 0 && <Path cells={[FROM, HERE]} attack />}
      {s >= 3 && <Ship at={NEXT} v={6} who="foe" />}
      {s === 3 && <Path cells={[HERE, NEXT]} attack />}
      <Ship at={s >= 2 ? HERE : FROM} v={2} />
    </Diagram>
  ),
);

// ------------------------------------------------------------------ holding ground

/** Open ground round an enemy 4: its zone, and the walk past it that our 3 wants. */
const GROUND = within(2);
const ZONE_ROUTE = [at(2, -1), at(1, -1), at(0, -1), at(-1, -1)];

const ZONE_SCENE = picture(
  [
    { hold: 0, say: 'An enemy mech controls the **spaces next to it**: its **zone**.' },
    { hold: 0, say: 'Our 3 wants to walk past it…' },
    { hold: 0, say: '…but entering the zone, it **must stop**, even with steps to spare.' },
    { hold: 0, say: 'With steps left, the same move can still **attack** it.' },
  ],
  (s) => (
    <Diagram cells={GROUND} scale={2.1} label="A mech that moves next to an enemy must stop there, and can still attack it.">
      <Glow cells={GROUND} tone="plain" />
      <Glow cells={RING} tone="zone" />
      <Ship at={HERE} v={4} who="foe" />
      {s === 1 && <Path cells={ZONE_ROUTE} />}
      {s === 3 && <Path cells={[ZONE_ROUTE[1], HERE]} attack />}
      <Ship at={s >= 2 ? ZONE_ROUTE[1] : ZONE_ROUTE[0]} v={3} />
    </Diagram>
  ),
);

const CONTESTED = picture(
  [
    { hold: 0, say: 'Your 5 and 3 make **8** here…' },
    { hold: 0, say: '…but an **enemy mech** on its perimeter makes it **contested**: you can’t claim it.' },
    { hold: 0, say: 'Attack it and win: it’s **destroyed**…' },
    { hold: 0, say: '…so the 8 is open again: claim it.' },
  ],
  (s) => (
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
);

// ------------------------------------------------------------------ bringing mechs back

const DROP = picture(
  [
    { hold: 0, say: 'A destroyed mech waits in your **salvage yard**.' },
    { hold: 0, say: '**Drop** it onto an empty perimeter space of an objective with **your cube** on it.' },
    { hold: 0, say: 'It comes back with the number it rolled, ready to fight.' },
    { hold: 0, say: 'Each claim is another place to drop. Not a **contested** one, but your **home** is always open.' },
  ],
  (s) => (
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
      {s >= 2 && <Ship at={at(0, -1)} v={4} />}
    </Diagram>
  ),
);

const REFIT = picture(
  [
    { hold: 0, say: 'This **6** isn’t the number your claim needs.' },
    { hold: 1200, say: '**Refit** it: **re-roll** the die.' },
    { hold: 0, say: 'It rolls **until** it shows a number it hasn’t shown this turn. A new number is a **new mech**.' },
    { hold: 0, say: 'A mech in your **salvage yard** can be refitted too.' },
  ],
  (s) => (
    <div className="mn-refit">
      <MechKey v={s < 2 ? 6 : 2} />
      <span className={s === 1 ? 'mn-refit-arrow spin' : 'mn-refit-arrow'} aria-hidden="true">
        ↻
      </span>
    </div>
  ),
);

// ------------------------------------------------------------------ power

/** Power, step by step: wins as the attacker raise it, losses as the defender lower it, until it reaches 6. */
const POWERS = [1, 2, 3, 2, 2, 3, 4, 5, 6, 6, 1];
const POWER = picture(
  [
    { hold: 0, say: 'Your **Power** starts at **1**.' },
    { hold: 0, say: 'Win a fight as the **attacker**: **+1**.' },
    { hold: 0, say: 'And again: **+1**.' },
    { hold: 0, say: 'Lose a fight as the **defender**: **−1**.' },
    { hold: 0, say: 'Any other fight changes **nothing**.' },
    ...under('Win, win, win: **+1** each time…', [800, 800, 800]),
    { hold: 0, say: 'At **6**: **Take Over**!' },
    { hold: 0, say: 'Place a cube on **any** objective with room for yours, even a **contested** one.' },
    { hold: 0, say: 'Then your Power drops back to **1**.' },
  ],
  (s) => {
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
          <PlanetIcon n={9} size={74} cubes={s >= 9 ? ['you'] : []} />
          <small>{s >= 9 ? 'placed, free' : 'any objective'}</small>
        </div>
      </div>
    );
  },
);

// ------------------------------------------------------------------ screens with one step

/** A picture with nothing to play: one drawing, held for `hold` ms with `say` under it. */
const single = (hold: number, say: string, drawing: ReactNode) => picture([{ hold, say }], () => drawing);

/** One mech on screens of its own: who it is and how far it moves, then its ability. The drawings say it all. */
const mech = (v: number): Picture => ({ ...single(4000, '', <MechProfile v={v} part="who" />), scene: `mech${v}` });
const ability = (v: number): Picture => ({ ...single(6000, '', <MechProfile v={v} part="ability" />), scene: `mech${v}` });

const PICTURES = {
  // Long enough for the animation to place its last cube and say you win.
  goal: single(8000, 'Welcome to **Regolith**. Be the first to place **all your cubes** on **objectives**.', <GoalAnimation />),
  lineup: LINEUP,
  mech1: mech(1),
  ability1: ability(1),
  mech2: mech(2),
  ability2: ability(2),
  mech3: mech(3),
  ability3: ability(3),
  mech4: mech(4),
  ability4: ability(4),
  mech5: mech(5),
  ability5: ability(5),
  mech6: mech(6),
  ability6: ability(6),
  spaces: SPACES,
  objective: OBJECTIVE,
  perimeter: PERIMETER,
  home: HOME,
  turn: TURN,
  actions: ACTIONS,
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

/** The scene a picture shares with its neighbours, if any. */
export const pictureScene = (name: PictureName): string | undefined => (PICTURES[name] as Picture).scene;

/** A picture, played once through from its first step while `playing`, then `onEnd`. */
export function PictureView({ name, playing, onEnd }: { name: PictureName; playing: boolean; onEnd: () => void }) {
  const { steps, draw } = PICTURES[name];
  const step = useStep(steps, playing, onEnd);
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
