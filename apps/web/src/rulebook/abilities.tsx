import type { CSSProperties } from 'react';
import { RULESETS } from '@regolith/engine';
import { Canvas, DieFace, type Who } from './diagrams';

/**
 * Each mech's ability, acted out in a little loop: a row of spaces, the mechs in it, and what the ability does
 * to them. Drawn on a simple row rather than the map (the board's hexes zigzag), so a line of spaces reads as a
 * line. The animations are in rulebook.css (`sp-`), which fades them out and back in to start over.
 */

const NAME = (v: number) => RULESETS.regolith.ships[v].name;

/** Pointy hexes in a row, sharing sides: the radius, a space's width and the row's top and middle. */
const R = 18;
const W = Math.sqrt(3) * R;
const MID = R + 6;
const PAD = 8;
const x = (i: number) => PAD + W / 2 + i * W;
const hex = (i: number) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k + 30);
    return `${x(i) + R * Math.cos(a)},${MID + R * Math.sin(a)}`;
  }).join(' ');

function Row({ spaces, label, children }: { spaces: number; label: string; children: React.ReactNode }) {
  return (
    <Canvas w={spaces * W + PAD * 2} h={MID * 2} label={label}>
      <g style={{ '--w': `${W}px` } as CSSProperties}>
        {Array.from({ length: spaces }, (_, i) => (
          <polygon key={i} className="sp-hex" points={hex(i)} />
        ))}
        {children}
      </g>
    </Canvas>
  );
}

/** A mech on space `i` of the row, moving with the keyframes `play` (if any). */
function Mech({ at, v, who = 'you', play }: { at: number; v: number; who?: Who; play?: string }) {
  return (
    <g className="sp-d" style={play ? { animationName: play } : undefined}>
      <DieFace x={x(at)} y={MID} v={v} size={W * 0.78} kind={who} />
    </g>
  );
}

/** The line a shot takes, from one space's edge to another's. */
function Shot({ from, to, play }: { from: number; to: number; play?: string }) {
  return (
    <line
      className="sp-shot"
      pathLength={1}
      x1={x(from) + W * 0.4}
      x2={x(to) - W * 0.4}
      y1={MID}
      y2={MID}
      style={play ? { animationName: play } : undefined}
    />
  );
}

/** What the mech's ability does, in a few seconds: the Breacher hits, the Behemoth carries, and so on. */
export function AbilityFigure({ v }: { v: number }) {
  const label = `${NAME(v)}: ${RULESETS.regolith.ships[v].ability.name}`;
  switch (v) {
    case 1:
      return (
        <Row spaces={3} label={label}>
          <Mech at={1} v={4} who="foe" play="sp-hit" />
          <Mech at={0} v={1} play="sp-lunge" />
        </Row>
      );
    case 2:
      return (
        <Row spaces={5} label={label}>
          <Mech at={0} v={2} play="sp-carry" />
          <Mech at={1} v={5} play="sp-ride" />
        </Row>
      );
    case 3:
      return (
        <Row spaces={4} label={label}>
          <Mech at={3} v={5} play="sp-under" />
          <Mech at={0} v={3} play="sp-over" />
        </Row>
      );
    case 4:
      // The 4 in the middle, a 3 to its left and a 5 to its right: it slides one way and takes that face, then the other.
      return (
        <Row spaces={3} label={label}>
          <DieFace x={x(0)} y={MID} v={3} size={W * 0.78} ghost />
          <DieFace x={x(2)} y={MID} v={5} size={W * 0.78} ghost />
          <path className="sp-arrow" d={`M${x(0.5) + 3},${MID - 6} l-6,6 l6,6`} />
          <path className="sp-arrow" d={`M${x(1.5) - 3},${MID - 6} l6,6 l-6,6`} />
          <g className="sp-d sp-slide">
            {[
              [4, 'sp-face-a'],
              [3, 'sp-face-b'],
              [5, 'sp-face-c'],
            ].map(([face, play]) => (
              <g key={face} className="sp-d" style={{ animationName: play as string, animationDuration: '6s' }}>
                <DieFace x={x(1)} y={MID} v={face as number} size={W * 0.78} />
              </g>
            ))}
          </g>
        </Row>
      );
    case 5:
      return (
        <Row spaces={6} label={label}>
          <Mech at={5} v={3} who="foe" />
          <Mech at={3} v={4} who="foe" play="sp-hit-far" />
          <Shot from={0} to={3} play="sp-shot-far" />
          <Mech at={0} v={5} />
        </Row>
      );
    default:
      return (
        <Row spaces={6} label={label}>
          <Mech at={5} v={2} who="foe" play="sp-halt" />
          <Shot from={0} to={3} />
          <circle className="sp-bubble" cx={x(3)} cy={MID} r={W * 0.44} />
          <Mech at={0} v={6} />
        </Row>
      );
  }
}
