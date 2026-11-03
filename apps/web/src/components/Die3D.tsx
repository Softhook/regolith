import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { DICE, HOP_EASING, HOP_LANDS } from '../beats';
import { playRoll } from '../sound';
import { APPLE_TOUCH } from '../platform';
import { useEffectEvent } from '../game/useEffectEvent';
import { PIP } from '../theme';
import type { World } from '@regolith/art';
import { castShadow, pieceShadowLength } from './board/shadows';

/**
 * A CSS 3D die. Faces sit on a cube; the cube rotates so the face for `value` points at
 * the viewer. When `rolls` changes the die tumbles: several extra full turns on both
 * axes with an ease-out, plus a hop, so it always lands on the engine's result.
 *
 * At rest only the front face shows, so a still die is that one face, drawn flat: a cube is ten
 * composited layers, and a map of them made every frame of a zoom or pan slower. The cube is built
 * when the die starts to move (at the face it showed) and goes again once it has landed. Dice that
 * tumble on mount (the fleet, battle and lobby rolls) keep theirs: they roll again under a modal's
 * backdrop-filter, where layers made mid-roll can flash a white frame.
 *
 * On an iPhone or iPad every die keeps its cube. Safari draws a cube's new layers wrong for a frame or two
 * (a hard-edged die that then turns into the real one) and skips the start of a tumble while it makes them,
 * and its flat face doesn't quite match the cube's, so building one per roll and dropping it after showed.
 * A newly built cube also waits two frames before it moves, so the tumble starts once it is on screen.
 *
 * The cube isn't a CSS 3D scene (preserve-3d): each face carries the whole turn, perspective included, and hides
 * when it faces away. A cube is convex, so the faces that show never overlap and nothing needs sorting by depth.
 * Chrome splits and sorts a 3D scene's planes, and a scene's new layers drew a face stretched far out of the die
 * now and then mid-tumble.
 */

// Rotation that brings each face to the front (front=1, top=2, right=3, left=4, bottom=5, back=6).
const FACE_ROTATION: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

/** Lit pips per face, as indices into a 3 × 3 grid (row by row). */
export const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * The cube's planes, in the order they're drawn, each with where it sits after the cube's turn (`at`). First the
 * die's solid inside (`face` unset: three planes crossing at its centre, seen through the gaps the faces' rounded
 * corners leave at the cube's corners), then the faces over it. One list renders the cube and turns it (Die3D's
 * `turn` goes by child index), so the two can't drift apart.
 */
const PLANES: { face?: number; at: string }[] = [
  { at: 'rotateY(90deg)' },
  { at: 'rotateX(90deg)' },
  { at: '' },
  { face: 1, at: 'translateZ(var(--half))' },
  { face: 6, at: 'rotateY(180deg) translateZ(var(--half))' },
  { face: 3, at: 'rotateY(90deg) translateZ(var(--half))' },
  { face: 4, at: 'rotateY(-90deg) translateZ(var(--half))' },
  { face: 2, at: 'rotateX(90deg) translateZ(var(--half))' },
  { face: 5, at: 'rotateX(-90deg) translateZ(var(--half))' },
];

/** How high a rolled die hops at each of its hop's keyframes (`HOP_AT`), in sizes. */
const HOP_HEIGHTS = [0, 0.55, 0, 0.12, 0];
/** It lands back at HOP_LANDS: heard as the clatter starts (beats.ts). */
const HOP_AT = [0, 0.28, HOP_LANDS, 0.78, 1];

export interface Die3DProps {
  value: number;
  rolls?: number;
  size: number;
  color: string;
  pip?: string;
  /** Tumble when first shown (combat dice, setup fleet). */
  tumbleOnMount?: boolean;
  /** Changes when the die jumps to another position of the game instead of following play (looking
   * back at it): a roll since then turns it to its face, without tumbling or a sound. */
  scene?: string;
  /** Seconds to wait before the tumble (to stagger several dice). */
  delay?: number;
  sound?: boolean;
  /** No soft shadow under it: its shadow is drawn elsewhere (a cast one on the ground, `DieShadow`). */
  shadowless?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
}

/** Memoised: the map re-renders on every move, and a moving die is nine planes and 21 pips. */
export const Die3D = memo(function Die3D({
  value,
  rolls = 0,
  size,
  color,
  pip = PIP,
  tumbleOnMount,
  scene,
  delay = 0,
  sound = true,
  shadowless,
  className = '',
  title,
  onClick,
}: Die3DProps) {
  const cube = useRef<HTMLDivElement>(null);
  const hop = useRef<HTMLDivElement>(null);
  const spins = useRef({ x: 0, y: 0 });
  const lastRolls = useRef(rolls);
  const lastValue = useRef(value);
  const lastScene = useRef(scene);
  const mounted = useRef(false);
  /** Whether the cube goes once the die has landed. */
  const flatten = !tumbleOnMount && !APPLE_TOUCH;
  const [moving, setMoving] = useState(!flatten);
  const settle = useRef<number>();
  const clatter = useRef<number>();
  const frame = useRef<number>();
  const hopAnimation = useRef<Animation | undefined>(undefined);
  /** The cube element that has been turned (a cube just built hasn't been). */
  const turned = useRef<HTMLDivElement | null>(null);
  /** Drop a move still waiting on a new cube. */
  const cancelFrame = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  };
  useEffect(
    () => () => {
      clearTimeout(settle.current);
      clearTimeout(clatter.current);
      cancelFrame();
      hopAnimation.current?.cancel();
    },
    [],
  );
  /** Run `go` once the cube just built has been on screen for a frame. */
  const afterPaint = (go: () => void) => {
    cancelFrame();
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => {
        frame.current = undefined;
        go();
      });
    });
  };

  /** Turn the cube (its planes, each on its own) to `rotate`. */
  const turn = (el: HTMLDivElement, transition: string, rotate: string) => {
    Array.from(el.children as HTMLCollectionOf<HTMLElement>).forEach((plane, i) => {
      plane.style.transition = transition;
      plane.style.transform = `perspective(calc(var(--die-size) * 7)) ${rotate} ${PLANES[i].at}`;
    });
    turned.current = el;
  };

  const stillPlanes = (el: HTMLDivElement) => {
    for (const plane of el.children as HTMLCollectionOf<HTMLElement>) plane.style.transition = 'none';
  };

  const rotation = (v: number) => {
    const [bx, by] = FACE_ROTATION[v] ?? [0, 0];
    return `rotateX(${bx + spins.current.x}deg) rotateY(${by + spins.current.y}deg)`;
  };

  /** Turn the cube to `value` over `duration` ms, then lay the die flat again (unless it keeps its cube). */
  const setRotation = (duration: number) => {
    const el = cube.current;
    if (!el) return;
    turn(el, `transform ${duration}ms cubic-bezier(.12,.72,.22,1) ${delay}s`, rotation(value));
    clearTimeout(settle.current);
    // Once landed, either the cube goes or it stops easing: its turn holds the die's size (its perspective, --half), so
    // a transition left on would play on every zoom, the die catching up long after the map.
    settle.current = window.setTimeout(() => (flatten ? setMoving(false) : stillPlanes(el)), delay * 1000 + duration + 50);
  };

  const tumble = () => {
    const turns = () => (2 + Math.floor(Math.random() * 2)) * 360 * (Math.random() < 0.5 ? -1 : 1);
    spins.current = { x: spins.current.x + turns(), y: spins.current.y + turns() };
    setRotation(DICE.turn);
    hopAnimation.current?.cancel();
    hopAnimation.current = hop.current?.animate(
      [1, 1.12, 0.96, 1.02, 1].map((scale, i) => ({
        transform: `translateY(${-size * HOP_HEIGHTS[i]}px) scale(${scale})`,
        offset: HOP_AT[i],
      })),
      { duration: DICE.hop, delay: delay * 1000, easing: HOP_EASING },
    );
    clearTimeout(clatter.current); // a roll still waiting to sound is overtaken by this one
    if (sound) clatter.current = window.setTimeout(() => playRoll(), delay * 1000);
  };

  const animate = useEffectEvent(() => {
    const el = cube.current;
    if (!mounted.current) {
      mounted.current = true;
      if (!el) return;
      if (tumbleOnMount) {
        // Start from a random orientation, then tumble to the value.
        turn(el, 'none', `rotateX(${Math.random() * 360}deg) rotateY(${Math.random() * 360}deg)`);
        afterPaint(tumble);
      } else turn(el, 'none', rotation(value));
      return;
    }
    const rolled = rolls !== lastRolls.current;
    if (!rolled && value === lastValue.current) {
      lastScene.current = scene;
      return;
    }
    // A still die builds its cube first; this runs again once it's there (before anything is painted).
    if (!el) return setMoving(true);
    const built = turned.current !== el;
    // Just built: start from the face the die was showing.
    if (built) turn(el, 'none', rotation(lastValue.current));
    const jumped = scene !== lastScene.current;
    lastRolls.current = rolls;
    lastValue.current = value;
    lastScene.current = scene;
    const go = rolled && !jumped ? tumble : () => setRotation(450);
    if (built) afterPaint(go);
    else {
      // A move still waiting on a new cube is overtaken by this one.
      cancelFrame();
      go();
    }
  });
  useLayoutEffect(() => animate(), [value, rolls, moving, scene, animate]);

  const style = {
    '--die-size': `${size}px`,
    '--die-color': color,
    '--die-pip': pip,
  } as CSSProperties;

  return (
    <div className={`die3d ${className}`} style={style} title={title} onClick={onClick}>
      {!shadowless && <div className="die3d-shadow" />}
      <div className={moving ? 'die3d-hop moving' : 'die3d-hop'} ref={hop}>
        {moving ? (
          <div className="die3d-cube" ref={cube}>
            {PLANES.map((p, i) => (p.face ? <Face key={i} n={p.face} size={size} /> : <div key={i} className="die3d-core" />))}
          </div>
        ) : (
          <Face n={value} size={size} className="still" />
        )}
      </div>
    </div>
  );
});

/** Where pip `i` of the 3 × 3 grid goes (row / column). */
const PIP_AREA = Array.from({ length: 9 }, (_, i) => ({ gridArea: `${Math.floor(i / 3) + 1} / ${(i % 3) + 1}` }));

/** The size, px, a face's pips are laid out at (.die3d-pips). */
const PIPS_BOX = 100;

/** A face: its lit pips only, each in its cell of the grid (a cube is six faces, and a map has many dice). */
function Face({ n, size, className }: { n: number; size: number; className?: string }) {
  return (
    <div className={className ? `die3d-face ${className}` : 'die3d-face'}>
      <div className="die3d-pips" style={{ transform: `scale(${size / PIPS_BOX})` }}>
        {PIPS[n].map((i) => (
          <span key={i} className="pip on" style={PIP_AREA[i]} />
        ))}
      </div>
    </div>
  );
}

/**
 * The hard shadow a die `size` across casts on `world`'s ground (board/shadows.ts): its rounded footprint swept down and
 * to the right, blurred `blur` px, with a hint of the die's `color`. Opaque, so where shadows meet they don't darken each
 * other: the layer they're all in sets how dark they are. While its die hops on a roll (`rolls`, as Die3D's) it
 * falls that much further away; not when the die only jumps to another position (`scene`).
 */
export const DieShadow = memo(function DieShadow({
  size,
  world,
  blur,
  color,
  rolls = 0,
  scene,
}: {
  size: number;
  world: World;
  blur: number;
  color: string;
  rolls?: number;
  scene?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const last = useRef({ rolls, scene });
  useEffect(() => {
    const was = last.current;
    last.current = { rolls, scene };
    if (rolls === was.rolls || scene !== was.scene) return;
    const away = (h: number) => size * h * pieceShadowLength(world);
    const hop = el.current?.animate(
      HOP_HEIGHTS.map((h, i) => ({ transform: `translate(${away(h)}px, ${away(h)}px)`, offset: HOP_AT[i] })),
      { duration: DICE.hop, easing: HOP_EASING },
    );
    return () => hop?.cancel();
  }, [rolls, scene, size, world]);
  // Its corners rounded as the faces' are (16%).
  const far = size * pieceShadowLength(world);
  return (
    <div className="die3d-cast" ref={el} style={{ width: size, height: size }}>
      <svg width={size + far} height={size + far} style={{ filter: `blur(${blur}px)` }}>
        <polygon {...castShadow(0, 0, size, size * 0.16, far, color)} />
      </svg>
    </div>
  );
});
