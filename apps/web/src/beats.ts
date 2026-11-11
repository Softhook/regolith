// The timings of the board's effects that a sound or the staging keeps time with, in ms, set here alone. Each
// effect is a group. An animation in styles.css reads its group as custom properties (`CUBE.fall` as
// `--cube-fall`, set on the document: `setBeatVars`; only the groups in `CSS_BEATS`, and all of them read
// there); one played from code (Die3D) reads it here, as do its sound (sound.ts) and the staging
// (game/staging, game/strike). An animation with a moment in it to meet (a landing, a hit) is split there, so the moment is where
// one part ends. Change a beat and the animation, its sound and whatever waits on it move together. Timings
// only the eye sees (a trail's fade, a second ring) stay in styles.css, as offsets from these where they follow one.

/** A mech moving to another space (.mech): it glides there, heard as its engine's rumble. */
export const MECH = { glide: 600 } as const;

/**
 * A mech blowing up (Explosions), heard as a boom. Several go off one after another, this far apart, up to
 * `MOST_BOOMS` (the rest with the last).
 */
const BOOM = { stagger: 160 } as const;
export const MOST_BOOMS = 3;

/** When the `i`th of several mechs blowing up together goes, in ms. */
export const boomAt = (i: number) => Math.min(i, MOST_BOOMS - 1) * BOOM.stagger;

/**
 * A mech arriving (from the reserve, or one a card brings), heard as a shimmer rising to its landing:
 * `land` after the sound starts, or when the card's effect brings it (game/staging).
 */
export const ARRIVE = { land: 330 } as const;

/** A placed cube (.cube): it falls, lands (its clack, and the claim's shockwave, .fx-claim), and squashes. */
export const CUBE = { fall: 240, squash: 160 } as const;

/** Show of Force (.cfx-lance): its reticle locks on, its lance strikes the mech (it blows up), then thins away. */
export const LANCE = { delay: 120, strike: 180, fade: 220 } as const;

/** Expansion (.cfx-expansion): its golden lance reaches the space (the new mech appears, its rings spread), then thins away. */
export const EXPANSION = { strike: 270, fade: 330 } as const;

/** Dangerous (.cfx-arc): its arc reaches across to join the two mechs (they blow up), then fades. */
export const ARC = { span: 200, fade: 300 } as const;

/** The easing of a beam's spark riding across (.cfx-ray > i), as a CSS cubic-bezier's four numbers. */
const RIDE_EASE = [0.5, 0, 0.3, 1] as const;

/** How far along its ride the spark is when what it carries starts to land. */
const ARRIVED = 0.8;

/** The moment, as a share of the time, an ease's progress first reaches `progress`. */
function timeAt([x1, y1, x2, y2]: readonly [number, number, number, number], progress: number) {
  const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid, y1, y2) < progress) lo = mid;
    else hi = mid;
  }
  return at(lo, x1, x2);
}

/** A beam (.cfx-ray): it spans the way and fades, a spark riding along it: a relocated cube carried to its new objective, or Ice Tunnels joined. */
const BEAM = { span: 340, fade: 510, ride: 600 } as const;

/** When the beam's spark is all but there and the cube it carries starts its fall, from the ride's ease. */
export const BEAM_ARRIVES = Math.round(BEAM.ride * timeAt(RIDE_EASE, ARRIVED));

/** A die's tumble (Die3D): its hop's ease (CSS's ease-out), and the share of the hop at which it first lands back. */
const HOP_EASE = [0, 0, 0.58, 1] as const;
export const HOP_LANDS = 0.6;
export const HOP_EASING = `cubic-bezier(${HOP_EASE.join(',')})`;

/**
 * A die rolled (Die3D): it hops and turns over, landing back (the clatter starts) and settling as the hop ends,
 * still turning to its face until the turn ends.
 */
export const DICE = {
  hop: 1000,
  turn: 1100,
  lands: Math.round(1000 * timeAt(HOP_EASE, HOP_LANDS)),
} as const;

/** Nomadic (.cfx-blink): the mech folds away, and opens out at its new objective this long after. */
export const BLINK = { open: 300 } as const;

/** A missile shot (.shot-*): its flight across the map (it hits, and the battle opens, as it lands), then the impact's flash. */
export const SHOT = { flight: 600, hit: 350 } as const;

/**
 * A battle's screen (CombatOverlay): its dice tumble until `reveal`, when its result shows and is heard. An atomic
 * falls for `atomic`, its die turning to 1 meanwhile, then goes off as the result shows afresh.
 */
export const BATTLE = { reveal: 1250, atomic: 800 } as const;

/** A shot in a battle's strip (.arena-tracer): it reaches the target `hit` after the reveal fires it. */
export const ARENA = { hit: 180 } as const;

/** The groups animations in styles.css read, by the name their custom properties take. */
export const CSS_BEATS = {
  mech: MECH,
  cube: CUBE,
  lance: LANCE,
  expansion: EXPANSION,
  arc: ARC,
  beam: BEAM,
  blink: BLINK,
  shot: SHOT,
  arena: ARENA,
};

/** The CSS beats as custom properties, for the effects' animations; and the eases they share with a beat. */
export const beatVars: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(CSS_BEATS).flatMap(([group, beats]) => Object.entries(beats).map(([name, ms]) => [`--${group}-${name}`, `${ms}ms`])),
  ),
  '--beam-ease': `cubic-bezier(${RIDE_EASE.join(',')})`,
};

/**
 * Sets the beats on the document's root, once at startup, so every effect reads them wherever it is mounted (a
 * missing one would void its whole animation, leaving an effect that starts hidden hidden).
 */
export function setBeatVars(root = document.documentElement) {
  for (const [name, value] of Object.entries(beatVars)) root.style.setProperty(name, value);
}
