import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { CardDeck } from '@regolith/art';
import { MODES, RULESETS } from '@regolith/engine';
import { ActionHex, MissileIcon } from '../components/Card';
import { PLAYER_COLORS } from '../theme';
import {
  Arrow,
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
  cardBackUrl,
  reachable,
  type At,
} from './diagrams';

/**
 * The player's manual: the same text and diagrams in the in-game "How to play" dialog (dark) and on
 * the printable #rulebook page (paper), so the two can never drift apart. docs/RULES.md is the
 * developer reference behind it. Rule-set differences come from RULESETS.
 */

const SHIP_TEXT: Record<number, string> = {
  1: 'Attack an enemy ship next to it without using its move. It can attack twice in one turn this way.',
  2: 'As part of a move, pick up one of your ships from a surrounding space, travel, then set it down in any space around you. The flagship can’t attack on that move.',
  3: 'Swap places with any of your other ships on the map.',
  4: 'Turn the die to 3 or 5.',
  5: 'May move and attack diagonally as part of its move.',
  6: 'Re-roll itself to a new number, without spending an action.',
};

const CARD_TYPES: [deck: CardDeck, name: string, classicName: string | undefined, text: string][] = [
  [
    'skill',
    'Skills',
    'Command',
    'Keep it in front of you. It works from the next player’s turn. You can hold 3; take a fourth and you must discard one.',
  ],
  ['tactic', 'Tactics', 'Gambit', 'Happens the moment you take it, then goes to the discard pile.'],
  [
    'expansion',
    'Expansion',
    undefined,
    'Roll one of your 2 reserve dice and add it to your fleet: in orbit of a planet with your cube, or in your scrapyard.',
  ],
];

const SECTIONS: [id: string, title: string][] = [
  ['mn-goal', 'Goal'],
  ['mn-ships', 'Ships'],
  ['mn-map', 'Map'],
  ['mn-turn', 'Your turn'],
  ['mn-combat', 'Combat'],
  ['mn-cards', 'Cards'],
  ['mn-modes', 'Rule sets'],
  ['mn-setup', 'Setup'],
];

// Scroll within the page without touching location.hash, which the app uses for routing.
const jump = (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  document.getElementById(e.currentTarget.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const Tag = ({ children }: { children: ReactNode }) => <span className="mn-tag">{children}</span>;

function Cost({ n }: { n: number }) {
  const label = `${n} action${n > 1 ? 's' : ''}`;
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

/** A 1–6 track coloured like the player panel's (Dominance red, Research violet), with a reward at 6. */
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

const ORBIT: At[] = [
  [0, 1],
  [1, 0],
  [1, 2],
  [2, 1],
];

/** One side of the combat example: ship + die = total. */
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
          <i>ship</i>
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

function MoveFigure() {
  const blocked: At[] = [
    [1, 1],
    [1, 4],
    [2, 2],
  ];
  const reach = reachable(3, 6, [1, 2], 3, blocked).filter(([r, c]) => !(r === 2 && c === 4));
  return (
    <Diagram rows={3} cols={6} label="A 3 can reach every dotted space; the space behind the 8 is out of reach.">
      <Tile id="p9-01" />
      <Tile id="p8-01" at={[0, 3]} />
      <PlanetMarks at={[1, 1]} n={9} />
      <PlanetMarks at={[1, 4]} n={8} />
      <Dots cells={reach} />
      <Ship at={[2, 2]} v={5} />
      <Path
        cells={[
          [1, 2],
          [1, 3],
          [2, 3],
          [2, 4],
        ]}
      />
      <Ship at={[2, 4]} v={3} ghost />
      <Ship at={[1, 2]} v={3} />
      <Mark at={[1, 5]} ok={false} />
    </Diagram>
  );
}

function AttackFigure() {
  return (
    <Diagram rows={3} cols={3} label="A 3 moves two spaces and makes its third step into an enemy ship.">
      <Tile id="p7-01" />
      <PlanetMarks at={[1, 1]} n={7} />
      <Ship at={[0, 1]} v={5} who="foe" />
      <Path
        cells={[
          [2, 0],
          [1, 0],
          [0, 0],
          [0, 1],
        ]}
        attack
      />
      <Ship at={[2, 0]} v={3} />
    </Diagram>
  );
}

function ConquerTile({ after }: { after?: boolean }) {
  return (
    <Diagram
      rows={3}
      cols={3}
      scale={1.45}
      label={
        after ? 'After: your cube sits on the planet.' : 'Before: your 6 and 3 orbit a 9; an enemy 4 orbits too; your 2 sits on a corner.'
      }
    >
      <Tile id="p9-01" />
      {!after && <Glow cells={ORBIT} />}
      <PlanetMarks at={[1, 1]} n={9} cubes={after ? ['you'] : []} />
      <Ship at={[0, 1]} v={6} />
      <Ship at={[1, 2]} v={3} />
      <Ship at={[2, 1]} v={4} who="foe" dim={!after} />
      <Ship at={[0, 0]} v={2} dim={!after} />
      {!after && (
        <>
          <Mark at={[0, 1]} ok />
          <Mark at={[1, 2]} ok />
          <Mark at={[2, 1]} ok={false} />
          <Mark at={[0, 0]} ok={false} />
        </>
      )}
    </Diagram>
  );
}

function ConquerFigure() {
  return (
    <div className="mn-conquer">
      <figure>
        <ConquerTile />
        <figcaption>Before</figcaption>
      </figure>
      <div className="mn-sum">
        <div className="mn-eq">
          <DieIcon v={6} size={34} /> <b>+</b> <DieIcon v={3} size={34} /> <b>=</b> <PlanetIcon n={9} size={30} />
        </div>
        <div className="mn-eq-result mn-ok">exactly 9: conquered</div>
        <div className="mn-eq-arrow">⟶</div>
      </div>
      <figure>
        <ConquerTile after />
        <figcaption>After: your cube is on the planet</figcaption>
      </figure>
    </div>
  );
}

function DeployFigure() {
  return (
    <Diagram rows={3} cols={3} left={84} label="A ship moves from your scrapyard to an empty orbit space of a planet holding your cube.">
      <rect className="mn-yard" x={-80} y={26} width={62} height={68} rx={8} />
      <Note x={-49} y={37}>
        SCRAPYARD
      </Note>
      <DieFace x={-49} y={66} v={4} />
      <Tile id="p8-02" />
      <PlanetMarks at={[1, 1]} n={8} cubes={['you']} />
      <Ship at={[1, 0]} v={4} ghost />
      <Arrow x1={-30} y1={56} x2={4} y2={58} curve={16} />
    </Diagram>
  );
}

function OrbitFigure() {
  return (
    <Diagram rows={3} cols={3} scale={1.35} label="The four spaces touching a planet's sides are its orbit; the corners are not.">
      <Tile id="p8-01" />
      <Glow cells={ORBIT} />
      <PlanetMarks at={[1, 1]} n={8} />
      {ORBIT.map(([r, c]) => (
        <Note key={`${r}${c}`} x={c * 40 + 20} y={r * 40 + 20}>
          orbit
        </Note>
      ))}
    </Diagram>
  );
}

function PlanetSizes() {
  return (
    <div className="mn-sizes" role="img" aria-label="A 7 holds 1 cube, an 8 holds 2, a 9 holds 3 and a 10 holds 4.">
      {[7, 8, 9, 10].map((n) => (
        <div key={n}>
          <PlanetIcon n={n} size={n * 7.2 - 16} slots cubes={n === 9 ? ['foe'] : []} />
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
        <h1>CUBIC</h1>
        <p className="mn-tagline">Every die is a starship · 2–4 players · about 60 minutes</p>
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
        <div className="mn-hero">
          <div className="mn-hero-cubes" aria-label="Four cubes placed, one to go">
            {[1, 2, 3, 4, 5].map((n) => (
              <CubeIcon key={n} size={34} empty={n === 5} />
            ))}
          </div>
          <p className="mn-lead">
            Be the first to place <b>all your cubes</b> on planets.
          </p>
          <p className="mn-hero-sub">Most maps give each player 5. You win the moment your last one lands.</p>
        </div>
        <div className="mn-two">
          <div className="mn-route">
            <h3>Conquer a planet</h3>
            <div className="mn-route-fig">
              <DieIcon v={5} /> <b>+</b> <DieIcon v={3} /> <b>=</b> <PlanetIcon n={8} size={28} />
            </div>
            <p>
              Park ships around a planet so their numbers add up <b>exactly</b> to the planet’s number.{' '}
              <a href="#mn-conquer" onClick={jump}>
                How →
              </a>
            </p>
          </div>
          <div className="mn-route">
            <h3>Become infamous</h3>
            <div className="mn-route-fig">
              <Track at={5} next tone="dom" end={<CubeIcon size={18} />} />
            </div>
            <p>
              Every fight you win raises your Dominance. At 6, place a cube on any planet.{' '}
              <a href="#mn-combat" onClick={jump}>
                How →
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- ships */}
      <section id="mn-ships">
        <h2>Your ships</h2>
        <p>
          Each die is a ship, and its number tells you two things: <b>how far it moves</b> and <b>how strong it is in a fight</b>.{' '}
          <b>Lower numbers win fights.</b>
        </p>
        <div className="mn-scale">
          <div className="mn-scale-bar mn-strong">◀ stronger in a fight</div>
          <div className="mn-scale-dice">
            {[1, 2, 3, 4, 5, 6].map((v) => (
              <div key={v}>
                <DieIcon v={v} size={34} />
                <small>moves {v}</small>
              </div>
            ))}
          </div>
          <div className="mn-scale-bar mn-fast">faster ▶</div>
        </div>
        <p>Each ship also has a special ability, usable once per turn on your turn:</p>
        <div className="mn-ships">
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <div key={v} className="mn-ship">
              <DieIcon v={v} size={64} shipIllustration />
              <div>
                <b>{RULESETS.regolith.ships[v].name}</b> <span className="mn-ability">{RULESETS.regolith.ships[v].ability.name}</span>
                <p>{SHIP_TEXT[v]}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- map */}
      <section id="mn-map">
        <h2>The map</h2>
        <div className="mn-two mn-map">
          <figure>
            <OrbitFigure />
            <figcaption>
              <b>Orbit</b> means the four spaces touching a planet’s sides. Only ships there count when you conquer it. Corners don’t count.
            </figcaption>
          </figure>
          <figure>
            <PlanetSizes />
            <figcaption>
              <b>Bigger planets hold more cubes</b>, one per player. You can never have two cubes on the same planet.
            </figcaption>
          </figure>
        </div>
        <ul className="mn-facts">
          <li>
            <b>Planets and ships block movement.</b> Nothing moves through them.
          </li>
          <li>
            <b>The void tile</b> has no planet. At the start of your turn, gain 1 Research for each of your ships on it.
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
                One per planet conquered, plus Research.{' '}
                <a href="#mn-cards" onClick={jump}>
                  Cards →
                </a>
              </small>
            </div>
          </div>
        </div>
        <p className="mn-center">
          <b>Each ship moves only once per turn.</b> Ship abilities and cards can still be used after your last action.
        </p>

        <div className="mn-actions">
          <Action name="Move" cost={1} figure={<MoveFigure />}>
            <p>
              Move a ship <b>up to its number</b> of spaces, one straight step at a time. Turning is fine. Diagonals, planets and other
              ships are not.
            </p>
            <p className="mn-legend">
              The dots show where this 3 can go. Planets and ships are in the way, so the space behind the 8 is out of reach.
            </p>
          </Action>

          <Action name="Attack" cost={1} figure={<AttackFigure />}>
            <p>
              An attack is a move whose <b>last step goes into an enemy ship</b>. The ship still needs the movement to get there. Then roll
              for{' '}
              <a href="#mn-combat" onClick={jump}>
                combat
              </a>
              .
            </p>
          </Action>

          <Action name="Deploy" cost={1} figure={<DeployFigure />}>
            <p>
              Bring a destroyed ship back. Take it from your scrapyard, <b>keeping its number</b>, and put it in an empty orbit space of a
              planet that holds <b>your cube</b>.
            </p>
          </Action>

          <Action
            name="Reconfigure"
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
              Re-roll one of your ships, on the map or in your scrapyard, until it shows a <b>different number</b>. A new number means a new
              ship type, and it can change a planet’s sum.
            </p>
            <p className="mn-legend">Community rules: it must show a number it hasn’t shown yet this turn.</p>
          </Action>

          <Action name="Research" cost={1} figure={<Track at={4} next tone="res" end="card" />}>
            <p>
              Move your Research up 1. When it reaches <b>6</b>, take a card at the end of your turn, and it drops back to 1.
            </p>
          </Action>

          <div id="mn-conquer" className="mn-action mn-wide mn-key">
            <header>
              <h3>Conquer</h3>
              <Tag>the key move</Tag>
              <Cost n={2} />
            </header>
            <ConquerFigure />
            <div className="mn-rules">
              <p>
                Add up <b>your ships in the planet’s orbit</b>. If they make <b>exactly</b> the planet’s number, place one of your cubes on
                it.
              </p>
              <ul className="mn-checks">
                <li className="ok">
                  <b>All</b> your ships in orbit count. You can’t leave one out, so a ship in the wrong place has to move away first.
                </li>
                <li className="no">Enemy ships don’t count, and they don’t stop you.</li>
                <li className="no">Ships on the corners aren’t in orbit.</li>
                <li className="ok">The planet needs a free cube space and none of your cubes yet.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- combat */}
      <section id="mn-combat">
        <h2>Combat</h2>
        <p>
          Both players roll a die and <b>add their ship’s number</b>. The <b>lower total wins</b>. Ties go to the attacker.
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
                The defending ship is <b>destroyed</b>. Its owner re-rolls it and puts it in their scrapyard.
              </li>
              <li>
                Attacker <b>+1 Dominance</b>, defender <b>−1</b>.
              </li>
              <li>The attacker moves into the space or stays where it was.</li>
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
            <h3>Infamy</h3>
            <Track at={6} tone="dom" end={<CubeIcon size={18} />} />
            <p>
              When your Dominance reaches 6, place a cube right away on any planet with room and none of your cubes. Then reset to 1. If
              there’s nowhere to place it, Dominance stays at 6.
            </p>
          </div>
          <div className="mn-box">
            <h3>
              Missiles <Tag>Community</Tag>
            </h3>
            <p className="mn-missile">
              <MissileIcon size={28} /> <span>→</span> <DieIcon v={1} kind="atk" size={28} /> <span>or</span>{' '}
              <DieIcon v={1} kind="def" size={28} />
            </p>
            <p>
              In a battle you are losing, spend a missile to turn <b>your own</b> combat roll into a 1. Only the attacker and defender may
              fire. Everyone starts with one.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- cards */}
      <section id="mn-cards">
        <h2>Cards</h2>
        <div className="mn-two">
          <div className="mn-earn">
            <span className="mn-earn-icon">
              <PlanetIcon n={7} size={30} />
            </span>
            <p>
              <b>1 card for each planet</b> you conquered this turn, Infamy included.
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
          {CARD_TYPES.map(([deck, name, classic, text]) => (
            <div key={deck} className="mn-ctype">
              <img className="mn-minicard" src={cardBackUrl(deck)} alt={`${name} card back`} />
              <div>
                <b>{name}</b> {classic && <small>Classic: {classic}</small>}
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
        <ul className="mn-facts">
          <li>
            <b>Peek</b> <Tag>Community</Tag> If you take the oldest card in a row, you may first look at the top of that deck and take that
            card instead.
          </li>
          <li>
            <b>Refresh</b> <Tag>Classic</Tag> Instead of taking a card, you may discard all six face-up cards and deal six new ones.
          </li>
          <li>Every card explains itself. When a deck runs out, shuffle its discards into a new deck.</li>
        </ul>
      </section>

      {/* ---------------------------------------------------------------- rule sets */}
      <section id="mn-modes">
        <h2>Rule sets</h2>
        <p>
          New to the game? <b>Start with Basic.</b> It has no cards, so you can learn ships, combat and conquering first. This manual
          describes all three rule sets; tags like <Tag>Community</Tag> mark rules that only one of them uses.
        </p>
        <RuleSetTable />
      </section>

      {/* ---------------------------------------------------------------- setup */}
      <section id="mn-setup">
        <h2>Setup</h2>
        <p className="mn-legend">The app sets everything up for you. To play at a table:</p>
        <ol className="mn-setup">
          <li>
            Lay out the map tiles as the chosen map shows. Shuffle each card deck and deal 3 cards face up beside it. <Tag>Community</Tag>{' '}
            Lay out players + 1 Expansion cards as a face-up pile.
          </li>
          <li>
            Each player takes 7 dice, their cubes, a player board and, <Tag>Community</Tag>, 1 missile. Put a die on 1 on your Dominance and
            Research tracks, and 2 dice aside as your reserve.
          </li>
          <li>
            <Tag>Community</Tag> Each player draws 2 Skills, keeps 1 and puts the other on the bottom of the deck.
          </li>
          <li>Roll your last 3 dice: these are your starting ships. You may re-roll all 3 once.</li>
          <li>
            Lowest total goes first; roll off any tie. In turn order, each player places a cube on a starting planet marked on the map, then
            their 3 ships in its orbit.
          </li>
        </ol>
      </section>

      {/* ---------------------------------------------------------------- fine print */}
      <section id="mn-more" className="mn-fine">
        <h2>Good to know</h2>
        <ul>
          <li>
            <b>One ability per die per turn</b>, even if the die changes type. Abilities only work on the map, on your turn.
          </li>
          <li>
            <b>Quantum Entanglement.</b> Once every planet with room already has one of your cubes, you may conquer a planet you’re already
            on. The sum needed rises by 3 for each of your cubes there. Infamy can also place a cube there.
          </li>
          <li>
            <b>Cards earned on someone else’s turn</b>, such as through Infamy, are taken after the active player’s. A bonus turn from
            Momentum is played at once, and any cards still owed are taken at the end of it.
          </li>
          <li>
            <b>Classic:</b> an Expansion can’t be taken once both your reserve dice are in play.
          </li>
        </ul>
      </section>

      <footer className="mn-credits">
        Regolith by Christian Nold is a non-commercial game inspired by <i>Quantum</i> by Eric Zimmerman (FunForge, 2013) and its fan-made
        Community Edition. Quantum is a trademark of its owners; this manual is an independent text.
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
        m.cards ? `${m.cards.terms.skillDeck} & ${m.cards.terms.tacticDeck}${m.cards.expansionPile ? ' + Expansion pile' : ''}` : <No />,
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
              <th key={m.id}>
                {m.name}
                <small>{m.summary}</small>
              </th>
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
