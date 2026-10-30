import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { CardDeck } from '@regolith/art';
import { MODES, RULESETS } from '@regolith/engine';
import { GAME_NAME } from '../appId';
import { ActionHex, MissileIcon } from '../components/Card';
import { PLAYER_COLORS } from '../theme';
import {
  Arrow,
  Barrier,
  CubeIcon,
  Diagram,
  DieFace,
  DieIcon,
  Dots,
  Glow,
  Icon,
  Mark,
  Note,
  Path,
  PlanetIcon,
  PlanetMarks,
  Ship,
  Tile,
  around,
  cardBackUrl,
  flower,
  line,
  reachable,
  type At,
} from './diagrams';
import { GoalKey, MechKey } from './concepts';
import { MapList } from './maps';

/**
 * The player's manual: the same text and diagrams in the in-game "How to play" dialog (dark) and on
 * the printable #rulebook page (paper), so the two can never drift apart. docs/RULES.md is the
 * developer reference behind it. The mechs' abilities and the rule sets' differences come from RULESETS.
 */

const REGOLITH = RULESETS.regolith;
const SHIPS = REGOLITH.ships;
/** How far a mech's number takes it: never more than 3 spaces. */
const MOVE_CAP = 3;

const CARD_TYPES: [deck: CardDeck, name: string, text: string][] = [
  [
    'skill',
    REGOLITH.cards!.terms.skillDeck,
    'Keep it in front of you. It works from the next player’s turn. You can hold 3; take a fourth and you must discard one.',
  ],
  ['tactic', REGOLITH.cards!.terms.tacticDeck, 'Happens the moment you take it, then goes to the discard pile.'],
  ['expansion', REGOLITH.cards!.expansion.name, REGOLITH.cards!.expansion.text],
];

const SECTIONS: [id: string, title: string][] = [
  ['mn-goal', 'Goal'],
  ['mn-ships', 'Mechs'],
  ['mn-map', 'Map'],
  ['mn-turn', 'Your turn'],
  ['mn-hold', 'Holding ground'],
  ['mn-combat', 'Combat'],
  ['mn-cards', 'Cards'],
  ['mn-modes', 'Rule sets'],
  ['mn-setup', 'Setup'],
  ['mn-maps', 'Maps'],
];

// Scroll within the page without touching location.hash, which the app uses for routing.
const jump = (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  document.getElementById(e.currentTarget.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const Tag = ({ children }: { children: ReactNode }) => <span className="mn-tag">{children}</span>;

function Cost({ n }: { n: number }) {
  const label = n ? `${n} action${n > 1 ? 's' : ''}` : 'no action';
  return (
    <span className="mn-cost" aria-label={label}>
      {Array.from({ length: n }, (_, i) => (
        <ActionHex key={i} size={16} />
      ))}
      <span>{label}</span>
    </span>
  );
}

function Action({
  name,
  cost,
  tag,
  wide,
  figure,
  children,
}: {
  name: string;
  cost: number;
  tag?: string;
  wide?: boolean;
  figure: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'mn-action mn-wide' : 'mn-action'}>
      <header>
        <h3>{name}</h3>
        {tag && <Tag>{tag}</Tag>}
        <Cost n={cost} />
      </header>
      <div className="mn-figure">{figure}</div>
      <div className="mn-action-text">{children}</div>
    </div>
  );
}

/** A 1–6 track coloured like the player panel's (Power red, Research violet), with a reward at 6. */
function Track({ at, next, end, tone }: { at: number; next?: boolean; end: ReactNode; tone: 'dom' | 'res' }) {
  return (
    <div className={`mn-track mn-track-${tone}`}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <span key={n} className={n <= at ? 'on' : n === at + 1 && next ? 'next' : ''}>
          {n}
        </span>
      ))}
      <span className="mn-track-end">→ {end}</span>
    </div>
  );
}

/** One side of the combat example: mech + die = total. */
function Side({
  role,
  ship,
  die,
  total,
  win,
}: {
  role: 'Attacker' | 'Defender';
  ship: ReactNode;
  die: ReactNode;
  total: number;
  win?: boolean;
}) {
  return (
    <div className={role === 'Attacker' ? 'mn-side mn-you-side' : 'mn-side mn-foe-side'}>
      <small>{role}</small>
      <div className="mn-eq">
        <span className="mn-eq-part">
          {ship}
          <i>mech</i>
        </span>
        <b>+</b>
        <span className="mn-eq-part">
          {die}
          <i>{role === 'Attacker' ? 'attack' : 'defence'} die</i>
        </span>
        <b>=</b>
        <span className={win ? 'mn-total win' : 'mn-total'}>{total}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ diagrams

/*
 * The diagrams' tiles, by the place of their middle space: one tile at [0, 0], and the tiles that meet it
 * to the right (a little higher) and below right, as tiles meet on a map.
 */
const HERE: At = [0, 0];
const RIGHT: At = [-2, 3];
const BELOW: At = [1, 2];

const not = (cells: readonly At[], drop: readonly At[]) => cells.filter((p) => !drop.some((q) => q[0] === p[0] && q[1] === p[1]));

function PerimeterFigure() {
  return (
    <Diagram cells={flower(HERE)} scale={1.45} label="The six spaces around an objective are its perimeter.">
      <Tile id="p8-01" at={HERE} />
      <Glow cells={around(HERE)} />
      <PlanetMarks at={HERE} n={8} />
    </Diagram>
  );
}

function MoveFigure() {
  const spaces = [...flower(HERE), ...flower(RIGHT)];
  const from: At = [1, -1];
  const friend: At = [-1, 1];
  const reach = reachable(spaces, from, MOVE_CAP, [HERE, RIGHT, friend]);
  const route: At[] = [from, [1, 0], [0, 1], [0, 2]];
  return (
    <Diagram cells={spaces} label="A 5 moves at most 3 spaces: the dots show where it can go, around the objectives and your 2.">
      <Tile id="p9-01" at={HERE} />
      <Tile id="p8-01" at={RIGHT} />
      <PlanetMarks at={HERE} n={9} />
      <PlanetMarks at={RIGHT} n={8} />
      <Dots cells={not(reach, [route[route.length - 1]])} />
      <Ship at={friend} v={2} />
      <Path cells={route} />
      <Ship at={route[route.length - 1]} v={5} ghost />
      <Ship at={from} v={5} />
    </Diagram>
  );
}

function ZoneFigure() {
  const spaces = [...flower(HERE), ...flower(RIGHT)];
  const foe: At = [-1, 2];
  const zone = around(foe).filter((p) => spaces.some((q) => q[0] === p[0] && q[1] === p[1]) && !(p[0] === RIGHT[0] && p[1] === RIGHT[1]));
  const route: At[] = [
    [1, -1],
    [1, 0],
    [0, 1],
  ];
  return (
    <Diagram
      cells={spaces}
      label="The enemy 4's zone of control is the spaces around it. Your 3 moves into it and must stop there, with a step left."
    >
      <Tile id="p7-01" at={HERE} />
      <Tile id="p8-01" at={RIGHT} />
      <PlanetMarks at={HERE} n={7} />
      <PlanetMarks at={RIGHT} n={8} />
      <Glow cells={zone} tone="zone" />
      <Ship at={foe} v={4} who="foe" />
      <Path cells={route} />
      <Ship at={route[route.length - 1]} v={3} ghost />
      <Ship at={route[0]} v={3} />
      <Mark at={[-1, 1]} ok={false} />
    </Diagram>
  );
}

function AttackFigure() {
  const route: At[] = [
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  return (
    <Diagram cells={flower(HERE)} label="A 3 moves two spaces and makes its third step into an enemy mech.">
      <Tile id="p7-01" at={HERE} />
      <PlanetMarks at={HERE} n={7} />
      <Ship at={[0, 1]} v={5} who="foe" />
      <Path cells={route} attack />
      <Ship at={route[0]} v={3} />
    </Diagram>
  );
}

function ShootFigure() {
  const spaces = [...flower(HERE), ...flower(RIGHT)];
  const sniper: At = [-1, 0];
  // Out of its lower right side: two clear spaces, then the enemy.
  const fire = line(spaces, sniper, 3).slice(0, 3);
  return (
    <Diagram
      cells={spaces}
      label="Your Sniper shoots the first mech in a clear straight line. The objective blocks the line to the other enemy."
    >
      <Tile id="p9-02" at={HERE} />
      <Tile id="blank-01" at={RIGHT} />
      <PlanetMarks at={HERE} n={9} />
      <Ship at={[1, 0]} v={2} who="foe" />
      <Ship at={fire[2]} v={3} who="foe" />
      <Path cells={[sniper, ...fire]} attack shot />
      <Ship at={sniper} v={5} />
    </Diagram>
  );
}

function BarrierFigure() {
  const spaces = [...flower(HERE), ...flower(RIGHT)];
  const wisp: At = [-1, 3];
  // Out of its upper left side, onto the objective's perimeter.
  const fire = line(spaces, wisp, 2).slice(0, 2);
  return (
    <Diagram cells={spaces} label="Your Wisp fires a barrier down a clear straight line, onto a space of the 9's perimeter.">
      <Tile id="p9-02" at={HERE} />
      <Tile id="blank-02" at={RIGHT} />
      <PlanetMarks at={HERE} n={9} />
      <Path cells={[wisp, ...fire]} shot />
      <Barrier at={fire[1]} />
      <Ship at={wisp} v={6} />
    </Diagram>
  );
}

function ClaimTile({ after }: { after?: boolean }) {
  const spaces = [...flower(HERE), ...flower(BELOW)];
  return (
    <Diagram
      cells={spaces}
      scale={1.2}
      label={
        after
          ? 'After: your cube sits on the objective.'
          : 'Before: your 6 and 3 are on the perimeter of a 9; your 2 and an enemy 4 are off it.'
      }
    >
      <Tile id="p9-01" at={HERE} />
      <Tile id="blank-01" at={BELOW} />
      {!after && <Glow cells={around(HERE)} />}
      <PlanetMarks at={HERE} n={9} cubes={after ? ['you'] : []} />
      <Ship at={[-1, 0]} v={6} />
      <Ship at={[0, 1]} v={3} />
      <Ship at={[1, 1]} v={4} who="foe" dim={!after} />
      <Ship at={[0, 2]} v={2} dim={!after} />
      {!after && (
        <>
          <Mark at={[-1, 0]} ok />
          <Mark at={[0, 1]} ok />
          <Mark at={[1, 1]} ok={false} />
          <Mark at={[0, 2]} ok={false} />
        </>
      )}
    </Diagram>
  );
}

function ClaimFigure() {
  return (
    <div className="mn-conquer">
      <figure>
        <ClaimTile />
        <figcaption>Before</figcaption>
      </figure>
      <div className="mn-sum">
        <div className="mn-eq">
          <DieIcon v={6} size={34} /> <b>+</b> <DieIcon v={3} size={34} /> <b>=</b> <PlanetIcon n={9} size={30} />
        </div>
        <div className="mn-eq-result mn-ok">exactly 9: claimed</div>
        <div className="mn-eq-arrow">⟶</div>
      </div>
      <figure>
        <ClaimTile after />
        <figcaption>After: your cube is on the objective</figcaption>
      </figure>
    </div>
  );
}

function ContestedFigure() {
  return (
    <Diagram cells={flower(HERE)} scale={1.45} label="Your 5 and 3 make 8, but the enemy 6 on the perimeter blocks the claim.">
      <Tile id="p8-01" at={HERE} />
      <Glow cells={around(HERE)} />
      <PlanetMarks at={HERE} n={8} />
      <Ship at={[-1, 0]} v={5} />
      <Ship at={[1, 0]} v={3} />
      <Ship at={[0, -1]} v={6} who="foe" />
      <Mark at={[0, -1]} ok={false} />
    </Diagram>
  );
}

function DropFigure() {
  return (
    <Diagram
      cells={flower(HERE)}
      left={78}
      label="A mech goes from your salvage yard onto an empty perimeter space of an objective holding your cube."
    >
      <rect className="mn-yard" x={-128} y={-34} width={62} height={68} rx={8} />
      <Note x={-97} y={-25}>
        SALVAGE
      </Note>
      <DieFace x={-97} y={6} v={4} />
      <Tile id="p8-02" at={HERE} />
      <PlanetMarks at={HERE} n={8} cubes={['you']} />
      <Ship at={[0, -1]} v={4} ghost />
      <Arrow x1={-78} y1={-4} x2={-46} y2={-16} curve={14} />
    </Diagram>
  );
}

function PlanetSizes() {
  return (
    <div className="mn-sizes" role="img" aria-label="A 7 holds 1 cube, an 8 holds 2, a 9 holds 3 and a 10 holds 4.">
      {[7, 8, 9, 10].map((n) => (
        <div key={n}>
          <PlanetIcon n={n} size={56} cubes={n === 9 ? ['foe'] : []} />
          <small>holds {n - 6}</small>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ the manual

export function Manual({ dark }: { dark?: boolean }) {
  return (
    <article className={dark ? 'mn mn-dark' : 'mn'} style={{ '--mn-you': PLAYER_COLORS[0], '--mn-foe': PLAYER_COLORS[1] } as CSSProperties}>
      <header className="mn-cover">
        <p className="mn-kicker">How to play</p>
        <h1>{GAME_NAME.toUpperCase()}</h1>
        <p className="mn-tagline">Mechs fight for the ice of Mars · 2–5 players · about 60 minutes</p>
      </header>

      <nav className="mn-toc" aria-label="Sections">
        {SECTIONS.map(([id, title]) => (
          <a key={id} href={`#${id}`} onClick={jump}>
            {title}
          </a>
        ))}
      </nav>

      {/* ---------------------------------------------------------------- goal */}
      <section id="mn-goal">
        <h2>The goal</h2>
        <GoalKey />
        <div className="mn-two">
          <div className="mn-route">
            <h3>Claim an objective</h3>
            <div className="mn-route-fig">
              <DieIcon v={5} /> <b>+</b> <DieIcon v={3} /> <b>=</b> <PlanetIcon n={8} size={28} />
            </div>
            <p>
              Stand mechs around an objective so their numbers add up <b>exactly</b> to its number.{' '}
              <a href="#mn-conquer" onClick={jump}>
                How →
              </a>
            </p>
          </div>
          <div className="mn-route">
            <h3>Take Over</h3>
            <div className="mn-route-fig">
              <Track at={5} next tone="dom" end={<CubeIcon size={18} />} />
            </div>
            <p>
              Every fight you win raises your Power. At 6, place a cube on any objective.{' '}
              <a href="#mn-combat" onClick={jump}>
                How →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- mechs */}
      <section id="mn-ships">
        <h2>Your mechs</h2>
        <p>
          Each die is a mech, and its number tells you two things: <b>how far it moves</b> and <b>how strong it is in a fight</b>.{' '}
          <b>Lower numbers win fights.</b> No mech moves more than {MOVE_CAP} spaces.
        </p>
        <div className="mn-scale">
          <div className="mn-scale-bar mn-strong">◀ stronger in a fight</div>
          <div className="mn-scale-dice">
            {[1, 2, 3, 4, 5, 6].map((v) => (
              <div key={v}>
                <DieIcon v={v} size={34} />
                <small>moves {Math.min(v, MOVE_CAP)}</small>
              </div>
            ))}
          </div>
          <div className="mn-scale-bar mn-fast">faster ▶</div>
        </div>
        <p>Each mech also has an ability of its own, used on your turn, once per turn:</p>
        <div className="mn-ships">
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <div key={v} className="mn-ship">
              <MechKey v={v} />
              <div>
                <span className="mn-ability">{SHIPS[v].ability.name}</span>
                <p>{SHIPS[v].ability.text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mn-two mn-map">
          <figure>
            <ShootFigure />
            <figcaption>
              <b>{SHIPS[5].ability.name}.</b> The {SHIPS[5].name} hits the first mech down a clear line. The objective blocks the line to
              the other.
            </figcaption>
          </figure>
          <figure>
            <BarrierFigure />
            <figcaption>
              <b>{SHIPS[6].ability.name}.</b> The {SHIPS[6].name}’s barrier stays put (only Kinetic Shunt moves it), and here holds a space
              of the 9’s perimeter.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ---------------------------------------------------------------- map */}
      <section id="mn-map">
        <h2>The map</h2>
        <div className="mn-two mn-map">
          <figure>
            <PerimeterFigure />
            <figcaption>
              The six spaces around an objective are its <b>perimeter</b>. Only mechs there count when you claim it.
            </figcaption>
          </figure>
          <figure>
            <PlanetSizes />
            <figcaption>
              <b>Bigger objectives hold more cubes</b>, one per player. You can never have two cubes on the same objective.
            </figcaption>
          </figure>
        </div>
        <ul className="mn-facts">
          <li>
            <b>Objectives, mechs and barriers block movement.</b> Nothing moves through them.
          </li>
          <li>
            <b>Prepared ground.</b> Some maps start with an Ice Tunnel, a wormhole (a tunnel the Ice Tunnel tactic can’t close) or barriers
            already on them, as the map shows. They work as the ones a game makes.
          </li>
          <li>
            <b>Habitat 7, Refinery 8, Ice Mine 9, Reactor 10.</b> The bigger the site, the harder it is to claim.
          </li>
          <li>
            <b>The Sinkhole</b> has no objective. <Tag>{REGOLITH.name}</Tag> At the start of your turn, gain 1 Research for each of your
            mechs on it.
          </li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- turn */}
      <section id="mn-turn">
        <h2>Your turn</h2>
        <div className="mn-flow">
          <div>
            <span className="mn-step">1</span>
            <div>
              <b>Take up to 3 actions</b>
              <small>In any order. The same action twice is fine.</small>
            </div>
          </div>
          <span className="mn-flow-arrow">→</span>
          <div>
            <span className="mn-step">2</span>
            <div>
              <b>Take the cards you earned</b>
              <small>
                One per objective claimed, plus Research.{' '}
                <a href="#mn-cards" onClick={jump}>
                  Cards →
                </a>
              </small>
            </div>
          </div>
        </div>
        <p className="mn-center">
          <b>Each mech moves only once per turn.</b> Abilities and cards can still be used after your last action.
        </p>

        <div className="mn-actions">
          <Action name="Move" cost={1} wide figure={<MoveFigure />}>
            <p>
              Move a mech <b>up to its number</b> of spaces, <b>at most {MOVE_CAP}</b>, one step at a time out of a side of its space.
              Turning is fine. Objectives, mechs and barriers are not.
            </p>
            <p className="mn-legend">
              The dots show where this 5 can go: no more than 3 spaces, and around the objectives and your 2, which are in the way.
            </p>
          </Action>

          <Action name="Attack" cost={1} figure={<AttackFigure />}>
            <p>
              An attack is a move whose <b>last step goes into an enemy mech</b>. The mech still needs the movement to get there. Then roll
              for{' '}
              <a href="#mn-combat" onClick={jump}>
                combat
              </a>
              .
            </p>
          </Action>

          <Action name="Drop" cost={1} figure={<DropFigure />}>
            <p>
              Bring a destroyed mech back. Take it from your salvage yard, <b>keeping its number</b>, and put it on an empty perimeter space
              of an objective that holds <b>your cube</b>.
            </p>
          </Action>

          <Action
            name="Refit"
            cost={1}
            figure={
              <div className="mn-reroll">
                <DieIcon v={6} size={44} />
                <span className="mn-reroll-arrow">↻</span>
                <DieIcon v={2} size={44} />
              </div>
            }
          >
            <p>
              Re-roll one of your mechs, on the map or in your salvage yard, until it shows a number it <b>hasn’t shown yet this turn</b>. A
              new number means a new mech, and it can change an objective’s sum.
            </p>
          </Action>

          <Action name="Research" cost={1} tag={REGOLITH.name} figure={<Track at={4} next tone="res" end="card" />}>
            <p>
              Move your Research up 1. When it reaches <b>6</b>, take a card at the end of your turn, and it drops back to 1.
            </p>
          </Action>

          <div id="mn-conquer" className="mn-action mn-wide mn-key">
            <header>
              <h3>Claim</h3>
              <Tag>the key move</Tag>
              <Cost n={2} />
            </header>
            <ClaimFigure />
            <div className="mn-rules">
              <p>
                Add up <b>your mechs on the objective’s perimeter</b>. If they make <b>exactly</b> its number, place one of your cubes on
                it.
              </p>
              <ul className="mn-checks">
                <li className="ok">
                  <b>All</b> your mechs on the perimeter count. You can’t leave one out, so a mech in the wrong place has to move away
                  first.
                </li>
                <li className="no">
                  No enemy mech may be on the perimeter.{' '}
                  <a href="#mn-hold" onClick={jump}>
                    Contested →
                  </a>
                </li>
                <li className="no">Mechs off the perimeter don’t count, yours or theirs.</li>
                <li className="ok">The objective needs a free cube space and none of your cubes yet.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- holding ground */}
      <section id="mn-hold">
        <h2>Holding ground</h2>
        <p>Mechs are slow and heavy. Ground is held by standing on it, not by racing across it.</p>
        <div className="mn-two mn-map">
          <figure>
            <ZoneFigure />
            <figcaption>
              <b>Zones of control.</b> A mech that moves onto a space next to an enemy mech must stop there, here short of the ✗. It may
              still attack from there, and one that starts its move there may leave. Your own mechs never stop you.
            </figcaption>
          </figure>
          <figure>
            <ContestedFigure />
            <figcaption>
              <b>Contested perimeters.</b> While an enemy mech is on an objective’s perimeter, nobody else can claim it or drop a mech onto
              its perimeter, except onto the perimeter of your own home objective. A Take Over ignores it.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ---------------------------------------------------------------- combat */}
      <section id="mn-combat">
        <h2>Combat</h2>
        <p>
          Both players roll a die and <b>add their mech’s number</b>. The <b>lower total wins</b>. Ties go to the attacker.
        </p>
        <div className="mn-fight">
          <Side role="Attacker" ship={<DieIcon v={2} size={36} />} die={<DieIcon v={3} kind="atk" size={36} />} total={5} win />
          <div className="mn-vs">vs</div>
          <Side role="Defender" ship={<DieIcon v={4} kind="foe" size={36} />} die={<DieIcon v={2} kind="def" size={36} />} total={6} />
        </div>
        <p className="mn-center mn-legend">5 is lower than 6, so the attacker wins.</p>

        <div className="mn-two">
          <div className="mn-outcome win">
            <h3>Attacker wins</h3>
            <ul>
              <li>
                The defending mech is <b>destroyed</b>. Its owner re-rolls it and puts it in their salvage yard.
              </li>
              <li>
                Attacker <b>+1 Power</b>, defender <b>−1</b>.
              </li>
              <li>The attacker moves into the space or stays where it was. A {SHIPS[5].name} that shot always stays.</li>
            </ul>
          </div>
          <div className="mn-outcome">
            <h3>Defender wins</h3>
            <ul>
              <li>
                The attacker <b>bounces back</b> to the space it attacked from.
              </li>
              <li>Nothing else happens. There’s no penalty for a failed attack.</li>
            </ul>
          </div>
        </div>

        <div className="mn-two">
          <div className="mn-box">
            <h3>Take Over</h3>
            <Track at={6} tone="dom" end={<CubeIcon size={18} />} />
            <p>
              When your Power reaches 6, place a cube right away on any objective with room and none of your cubes, contested or not. Then
              reset to 1. If there’s nowhere to place it, Power stays at 6.
            </p>
          </div>
          <div className="mn-box">
            <h3>Atomics</h3>
            <p className="mn-missile">
              <MissileIcon size={28} /> <span>→</span> <DieIcon v={1} kind="atk" size={28} /> <span>or</span>{' '}
              <DieIcon v={1} kind="def" size={28} />
            </p>
            <p>
              In a battle you are losing, spend an atomic to turn <b>your own</b> combat roll into a 1. Only the attacker and defender may
              fire. Everyone starts with one.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- cards */}
      <section id="mn-cards">
        <h2>
          Cards <Tag>{REGOLITH.name}</Tag>
        </h2>
        <div className="mn-two">
          <div className="mn-earn">
            <span className="mn-earn-icon">
              <PlanetIcon n={7} size={30} />
            </span>
            <p>
              <b>1 card for each objective</b> you claimed this turn, Take Over included.
            </p>
          </div>
          <div className="mn-earn">
            <span className="mn-earn-icon mn-earn-r">
              <Icon name="research" size={24} />
            </span>
            <p>
              <b>1 card if your Research is at 6.</b> It then drops back to 1.
            </p>
          </div>
        </div>
        <p>
          Take your cards one at a time from the face-up rows. After each pick the row slides along and refills next to the deck, so the
          card farthest from the deck is always the oldest.
        </p>
        <div className="mn-cardtypes">
          {CARD_TYPES.map(([deck, name, text]) => (
            <div key={deck} className="mn-ctype">
              <img className="mn-minicard" src={cardBackUrl(deck)} alt={`${name} card back`} />
              <div>
                <b>{name}</b>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
        <ul className="mn-facts">
          <li>
            <b>Peek.</b> If you take the oldest card in a row, you may first look at the top of that deck and take that card instead.
          </li>
          <li>Every card explains itself. When a deck runs out, shuffle its discards into a new deck.</li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- rule sets */}
      <section id="mn-modes">
        <h2>Rule sets</h2>
        <p>
          New to the game? <b>Start with Basic.</b> It is {GAME_NAME} without cards, so you can learn mechs, combat and claiming first.
          Rules tagged <Tag>{REGOLITH.name}</Tag> are only in the full game.
        </p>
        <RuleSetTable />
      </section>

      {/* ---------------------------------------------------------------- setup */}
      <section id="mn-setup">
        <h2>Setup</h2>
        <p className="mn-legend">The app sets everything up for you. To play at a table:</p>
        <ol className="mn-setup">
          <li>
            Lay out the map tiles as the chosen map shows (
            <a href="#mn-maps" onClick={jump}>
              Maps
            </a>
            ), with anything it starts with on the ground. <Tag>{REGOLITH.name}</Tag> Shuffle each card deck and deal 3 cards face up beside
            it. Lay out players + 1 {REGOLITH.cards!.expansion.name} cards as a face-up pile.
          </li>
          <li>
            Each player takes 7 dice, as many cubes as the map gives, a player board and 1 atomic. Put a die on 1 on your Power and Research
            tracks, and 2 dice aside as your reserve.
          </li>
          <li>
            <Tag>{REGOLITH.name}</Tag> Each player draws 2 {REGOLITH.cards!.terms.skillDeck}, keeps 1 and puts the other on the bottom of
            the deck.
          </li>
          <li>Roll your last 3 dice: these are your starting mechs. You may re-roll all 3 once.</li>
          <li>
            Lowest total goes first; roll off any tie. In turn order, each player places a cube on a starting objective marked on the map,
            their home objective, then their 3 mechs on its perimeter.
          </li>
        </ol>
      </section>

      {/* ---------------------------------------------------------------- fine print */}
      <section id="mn-more" className="mn-fine">
        <h2>Good to know</h2>
        <ul>
          <li>
            <b>One ability per die per turn</b>, even if the die changes mech. Abilities only work on the map, on your turn.
          </li>
          <li>
            <b>Back to your own.</b> Once every objective with room already has one of your cubes, you may claim one you’re already on. The
            sum needed rises by 3 for each of your cubes there. A Take Over can also place a cube there.
          </li>
          <li>
            <b>Cards earned on someone else’s turn</b>, such as through a Take Over, are taken after the active player’s. A bonus turn from
            a card is played at once, and any cards still owed are taken at the end of it.
          </li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- maps */}
      <section id="mn-maps">
        <h2>Maps</h2>
        <p>
          Every map, with what to lay out for it. Each tile is drawn where the map puts it, its objective on the space it sits on. Each
          player takes the cubes the map gives and starts on one of the starting objectives. New to a player count? Start with its{' '}
          <span className="mn-tag">Basic</span> map.
        </p>
        <MapList />
      </section>

      <footer className="mn-credits">
        {GAME_NAME}, a game by Christian Nold, is inspired by <i>Quantum</i> by Eric Zimmerman and its fan-made Community Edition, by{' '}
        <i>Santorini</i> by Gord! and by <i>Amazons</i> by Walter Zamkauskas.
      </footer>
    </article>
  );
}

const Yes = () => <span className="mn-yes">✓</span>;
const No = () => <span className="mn-none">—</span>;

/** What changes between rule sets, read from RULESETS so it can't disagree with the engine. */
function RuleSetTable() {
  const modes = MODES;
  const rows: [string, (m: (typeof MODES)[number]) => ReactNode][] = [
    [
      'Cards',
      (m) =>
        m.cards ? (
          `${m.cards.terms.skillDeck} & ${m.cards.terms.tacticDeck}${m.cards.expansionPile ? ` + ${m.cards.expansion.name} pile` : ''}`
        ) : (
          <No />
        ),
    ],
    ['Research action', (m) => (m.cards ? <Yes /> : <No />)],
    ['Starting card', (m) => (m.cards?.startingSkillDraft ? 'Keep 1 of 2' : <No />)],
    ['Peek at the deck', (m) => (m.cards?.peek ? <Yes /> : <No />)],
  ];
  return (
    <div className="mn-table-wrap">
      <table className="mn-modes">
        <thead>
          <tr>
            <th />
            {modes.map((m) => (
              <th key={m.id}>{m.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label}>
              <th>{label}</th>
              {modes.map((m) => (
                <td key={m.id}>{cell(m)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
