import { useEffect, useRef, useState } from 'react';
import { RULESETS } from '@regolith/engine';
import { CubeIcon, Diagram, DieIcon, PlanetMarks, Tile, cubeSpot, flower, type At, type Who } from './diagrams';
import { AbilityFigure } from './abilities';

/**
 * One idea, one picture. Each concept here is the simplest drawing of a single rule idea, with its name on it,
 * and is used by both the manual and the tutorial, so what a newcomer sees in the demo is what the
 * manual shows afterwards. New concepts go here, one at a time.
 */

const SHIPS = RULESETS.regolith.ships;
/** How far a mech's number takes it: never more than 3 spaces. */
const MOVE_CAP = 3;

/**
 * "This die is this mech": the die face as it looks on the map (pips), equals the mech's drawing, with its name.
 * `who` colours the pips die; the drawing is the same for both players.
 */
export function MechKey({ v, who = 'you', size = 64 }: { v: number; who?: Who; size?: number }) {
  return (
    <figure className="mn-mech" aria-label={`Die ${v} is the ${SHIPS[v].name}`}>
      <div className="mn-mech-pair">
        <DieIcon v={v} kind={who} size={size} />
        <span className="mn-mech-eq" aria-hidden="true">
          =
        </span>
        <span className="mn-mech-art">
          <DieIcon v={v} size={size} shipIllustration portrait />
        </span>
      </div>
      <figcaption>
        <b>{SHIPS[v].name}</b>
      </figcaption>
    </figure>
  );
}

/** The key for some of the mechs, or for all six. */
export function MechKeys({ values = [1, 2, 3, 4, 5, 6], who }: { values?: readonly number[]; who?: Who }) {
  return (
    <div className="mn-mechs">
      {values.map((v) => (
        <MechKey key={v} v={v} who={who} />
      ))}
    </div>
  );
}

/** "The goal": all your cubes on objectives. The manual opens with it and so does the demo. */
export function GoalKey({ cubes = 5, placed = cubes - 1, size = 34 }: { cubes?: number; placed?: number; size?: number }) {
  return (
    <div className="mn-hero">
      <div className="mn-hero-cubes" aria-label={`${placed} cubes placed, ${cubes - placed} to go`}>
        {Array.from({ length: cubes }, (_, i) => (
          <CubeIcon key={i} size={size} empty={i >= placed} />
        ))}
      </div>
      <p className="mn-lead">
        Be the first to place <b>all your cubes</b>.
      </p>
      <p className="mn-hero-sub">You win the moment your last one is placed.</p>
    </div>
  );
}

/** The objectives the goal's animation fills: a Habitat has room for one cube of yours. */
const GOAL_SITES: At[] = [
  [0, 0],
  [-1, 3],
  [2, 2],
];
const GOAL_SPACES = GOAL_SITES.flatMap(flower);
const CUBE_PX = 36;

/**
 * "The goal", acted out on a few hexes of the map: three objectives, three cubes in your tray. The cubes fly out
 * one at a time into the objectives' cube spaces, and when every space is full the screen says you win, then it
 * starts again. Where a cube lands is read off the drawing, so it drops into the objective's own space. Still
 * and already won, if motion is reduced.
 */
export function GoalAnimation() {
  const root = useRef<HTMLDivElement>(null);
  const trayCube = useRef<(HTMLSpanElement | null)[]>([]);
  const flier = useRef<HTMLSpanElement>(null);
  const [launched, setLaunched] = useState(0);
  const [placed, setPlaced] = useState(0);
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = GOAL_SITES.length;

  useEffect(() => {
    if (still) return;
    let dead = false;
    let timer = 0;
    let anim: Animation | undefined;
    const next = (k: number) => {
      if (dead) return;
      if (k === count) {
        timer = window.setTimeout(() => {
          setLaunched(0);
          setPlaced(0);
          next(0);
        }, 4200);
        return;
      }
      timer = window.setTimeout(() => {
        const from = trayCube.current[k];
        const frame = root.current;
        const svg = frame?.querySelector<SVGSVGElement>('.mn-svg');
        const ctm = svg?.getScreenCTM();
        const el = flier.current;
        if (!from || !frame || !svg || !ctm || !el) return;
        const spot = cubeSpot(GOAL_SITES[k], 7);
        const to = new DOMPoint(spot.x, spot.y).matrixTransform(ctm);
        const f = frame.getBoundingClientRect();
        const a = from.getBoundingClientRect();
        // The flier's top left, from the tray cube's to the cube space's.
        const [x0, y0] = [a.left - f.left, a.top - f.top];
        const [x1, y1] = [to.x - f.left - CUBE_PX / 2, to.y - f.top - CUBE_PX / 2];
        // The cube's square fills 3/4 of its icon; it ends as wide as the space.
        const end = (spot.size * ctm.a) / (CUBE_PX * 0.75);
        // Out and up over the map in an arc: a quadratic curve whose control point is above the straight line.
        const [cx, cy] = [(x0 + x1) / 2, Math.min(y0, y1) - 70];
        const keys = Array.from({ length: 49 }, (_, i) => {
          const t = i / 48;
          const e = t * t * (3 - 2 * t);
          const u = 1 - e;
          const [x, y] = [u * u * x0 + 2 * u * e * cx + e * e * x1, u * u * y0 + 2 * u * e * cy + e * e * y1];
          // It is lifted towards the viewer on the way up and set down as it arrives.
          const scale = 1 + (end - 1) * e + 0.3 * Math.sin(Math.PI * e);
          return { transform: `translate(${x}px, ${y}px) scale(${scale})`, offset: t };
        });
        setLaunched(k + 1);
        el.style.display = 'block';
        anim = el.animate(keys, { duration: 1500, easing: 'linear', fill: 'forwards' });
        anim.onfinish = () => {
          // The cube on the objective is drawn first, and only then does the flier go, so there is no gap.
          setPlaced(k + 1);
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              el.style.display = 'none';
              anim?.cancel();
            }),
          );
          next(k + 1);
        };
      }, 900);
    };
    next(0);
    return () => {
      dead = true;
      window.clearTimeout(timer);
      anim?.cancel();
    };
  }, [still, count]);

  const done = still ? count : placed;
  const out = still ? count : launched;
  const won = done === count;
  return (
    <div className={won ? 'mn-goalanim won' : 'mn-goalanim'} ref={root}>
      <div className="mn-goalanim-side">
        <div className="mn-goalanim-tray" aria-label="Your cubes">
          {Array.from({ length: count }, (_, i) => (
            <span key={i} ref={(e) => void (trayCube.current[i] = e)} className={i < out ? 'gone' : ''}>
              <CubeIcon size={CUBE_PX} />
            </span>
          ))}
        </div>
        <small>Your cubes</small>
      </div>
      <div className="mn-goalanim-map">
        <Diagram cells={GOAL_SPACES} scale={1.9} label="Three objectives, each with a space for one of your cubes.">
          {GOAL_SITES.map((at) => (
            <Tile key={at.join()} id="p7-01" at={at} />
          ))}
          {GOAL_SITES.map((at, k) => (
            <PlanetMarks key={at.join()} at={at} n={7} cubes={k < done ? ['you'] : []} />
          ))}
        </Diagram>
        <div className="mn-goalanim-win" aria-live="polite">
          {won && <strong>You win!</strong>}
        </div>
      </div>
      <span className="mn-goalanim-flier" ref={flier}>
        <CubeIcon size={CUBE_PX} />
      </span>
    </div>
  );
}

/** Each mech's ability in a line, for a screen with room for one. The manual has the rules text in full. */
const POWER_LINE: Record<number, string> = {
  1: 'Attacks an adjacent enemy for free, without using its move.',
  2: 'Carries a nearby mech of yours as it moves, then sets it down beside it.',
  3: 'Swaps places with any other mech of yours.',
  4: 'Refits itself as a Tactician (3) or a Sniper (5).',
  5: 'Shoots the first mech in a straight line, at any distance, without moving.',
  6: 'Fires a barrier down a line. Nothing can pass it.',
};

/**
 * One mech on a screen of its own, its drawing below, in two parts so each has room: first its die (the mech as
 * the map shows it) with its name and how far it moves, then its ability. The same for each of the six, so they
 * can be compared.
 */
export function MechProfile({ v, part }: { v: number; part: 'who' | 'ability' }) {
  const steps = Math.min(v, MOVE_CAP);
  return (
    <div className="mn-profile">
      {part === 'who' ? (
        <div className="mn-profile-who">
          <figure className="mn-profile-die">
            <DieIcon v={v} size={72} />
            <figcaption>
              <b>{SHIPS[v].name}</b>
            </figcaption>
          </figure>
          <p className="mn-profile-move">
            Moves up to <b>{steps}</b> {steps > 1 ? 'spaces' : 'space'}
          </p>
        </div>
      ) : (
        <div className="mn-profile-power">
          <small>{SHIPS[v].name}’s ability</small>
          <span className="mn-ability">{SHIPS[v].ability.name}</span>
          <p>{POWER_LINE[v]}</p>
          <AbilityFigure v={v} />
        </div>
      )}
      <span className="mn-profile-art mn-mech-art" aria-hidden="true">
        <DieIcon v={v} size={340} shipIllustration portrait />
      </span>
    </div>
  );
}
