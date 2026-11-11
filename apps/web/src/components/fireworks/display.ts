import { FANFARE_HITS } from '../../gameOverSound';
import { pick, rand } from '../../random';
import { GOLD, WHITE, type Rgb } from './sprites';

// What the victory show fires (show.ts runs it): each shell's shape, and the programme timed to the fanfare.

export type Shape = 'peony' | 'brocade' | 'double' | 'ring' | 'objective' | 'galaxy' | 'willow' | 'crossette' | 'supernova';
/** The shapes a shell picks from when none is asked for (galaxies twice as often). */
export const RANDOM_SHAPES: Shape[] = ['peony', 'brocade', 'double', 'ring', 'objective', 'galaxy', 'galaxy', 'willow', 'crossette'];

/** How a spark flies and looks; show.ts fills in what's left out. */
export interface SparkStyle {
  /** Seconds it burns. */
  life?: number;
  size?: number;
  drag?: number;
  gravity?: number;
  /** Twinkles as it fades. */
  glitter?: boolean;
  /** Splits into a small star of its own when it burns out. */
  split?: boolean;
  /** Sheds golden embers as it flies (brocade and willow). */
  tail?: boolean;
}

/** A shell bursting at (x, y). */
export interface Burst {
  x: number;
  y: number;
  shape: Shape;
  rgb: Rgb;
  /** A second colour some shapes mix in. */
  alt: Rgb;
  scale: number;
  /** How loud it is (quieter under the fanfare). */
  level: number;
}

/** What a burst leaves besides its sparks: crackling, and smoke in `smoke`'s colours (`puffs` of it). */
export interface Afterglow {
  crackling?: boolean;
  smoke?: Rgb[];
  puffs?: number;
}

/** What the shapes draw with. */
export interface Kit {
  spark(s: SparkStyle & { x: number; y: number; vx: number; vy: number; rgb: Rgb }): void;
  /** Another burst, `delay` seconds from now. */
  later(delay: number, b: Burst): void;
  /** The winner's colours, gold and white. */
  palette: Rgb[];
  /** Colours from the board art's nebulae (blue to pink-purple). */
  nebulae: Rgb[];
}

export interface LaunchOptions {
  shape?: Shape;
  scale?: number;
  /** Seconds from launch to burst. */
  flight?: number;
  /** Where it bursts, as fractions of the screen. */
  x?: number;
  y?: number;
  rgb?: Rgb;
}

/** A shell that bursts `t` seconds into the show. */
export type Fire = (t: number, o?: LaunchOptions) => void;

/** A velocity (ex, ey) turned by `turn` radians. */
const turned = (ex: number, ey: number, turn: number) => ({
  vx: ex * Math.cos(turn) - ey * Math.sin(turn),
  vy: ex * Math.sin(turn) + ey * Math.cos(turn),
});

/** `n` sparks flung evenly round a circle at `speed`, squashed vertically by `tilt` (a ring seen at an angle) and turned by `turn`. */
export function sphere(
  kit: Kit,
  x: number,
  y: number,
  n: number,
  speed: number,
  rgb: (i: number) => Rgb,
  style: SparkStyle = {},
  tilt = 1,
  turn = 0,
) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.04, 0.04);
    const v = speed * (style.split || tilt !== 1 ? 1 : rand(0.72, 1.05));
    kit.spark({ x, y, ...turned(Math.cos(a) * v, Math.sin(a) * v * tilt, turn), rgb: rgb(i), ...style });
  }
}

/** Each shape's sparks, burst `b` at size `k` (its scale times the screen's). */
export const SHAPES: Record<Shape, (kit: Kit, b: Burst, k: number) => Afterglow | void> = {
  peony: (kit, { x, y, rgb }, k) => {
    const crackling = Math.random() < 0.5;
    sphere(kit, x, y, 110, 320 * k, () => rgb, { glitter: crackling });
    sphere(kit, x, y, 30, 130 * k, () => WHITE, { life: 0.9 });
    return { crackling };
  },
  brocade: (kit, { x, y, rgb }, k) => {
    sphere(kit, x, y, 80, 300 * k, () => GOLD, { tail: true, glitter: true, drag: 1.8, gravity: 90, life: rand(2, 2.6), size: 1.8 });
    sphere(kit, x, y, 36, 150 * k, () => rgb, { life: 1.2 });
    return { crackling: true };
  },
  double: (kit, { x, y, rgb, alt }, k) => {
    sphere(kit, x, y, 90, 340 * k, () => rgb);
    sphere(kit, x, y, 60, 180 * k, () => alt, { glitter: true });
  },
  ring: (kit, { x, y, rgb, alt }, k) => {
    sphere(kit, x, y, 80, 310 * k, () => rgb, { gravity: 60, life: rand(1.3, 1.6) }, rand(0.35, 1), rand(-0.6, 0.6));
    sphere(kit, x, y, 20, 80 * k, () => alt, { gravity: 60, life: 1 });
  },
  // A glowing world with a tilted ring round it.
  objective: (kit, { x, y, rgb, alt }, k) => {
    sphere(kit, x, y, 70, 140 * k, () => rgb, { gravity: 40, drag: 2.2, life: rand(1.6, 2) });
    const ring = { gravity: 40, glitter: true, life: rand(1.6, 2) };
    sphere(kit, x, y, 100, 340 * k, (i) => (i % 2 ? GOLD : alt), ring, 0.28, rand(-0.45, 0.45));
  },
  // Spiral arms winding out from a white core, blue-violet at their tips, seen at a slant.
  galaxy: (kit, { x, y, rgb }, k) => {
    const arms = pick([2, 3]);
    const turn = rand(0, Math.PI);
    const tilt = rand(0.45, 0.7);
    const swirl = pick([-1, 1]);
    const tip = pick(kit.nebulae);
    for (let i = 0; i < 160; i++) {
      const t = rand(0.06, 1);
      const dir = ((i % arms) / arms) * Math.PI * 2 + swirl * (t * 2.8 + 0.9) + rand(-0.14, 0.14);
      const v = (50 + 330 * t) * k;
      kit.spark({
        x,
        y,
        ...turned(Math.cos(dir) * v, Math.sin(dir) * v * tilt, turn),
        rgb: t < 0.3 ? WHITE : t < 0.65 ? rgb : tip,
        gravity: 30,
        drag: 1.6,
        life: rand(1.6, 2.3),
        glitter: t > 0.6,
        size: t < 0.3 ? 2.6 : 2,
      });
    }
    sphere(kit, x, y, 30, 60 * k, () => WHITE, { gravity: 20, drag: 2, life: 1.4, size: 3 });
    return { crackling: true, smoke: [tip, rgb, pick(kit.nebulae), tip], puffs: 5 };
  },
  willow: (kit, { x, y }, k) => {
    sphere(kit, x, y, 140, 280 * k, () => GOLD, { drag: 2.4, gravity: 70, life: rand(2.6, 3.4), glitter: true, tail: true, size: 1.5 });
    return { crackling: true, smoke: [GOLD, pick(kit.nebulae)] };
  },
  crossette: (kit, { x, y, rgb }, k) => {
    sphere(kit, x, y, 18, 300 * k, () => rgb, { split: true, life: rand(0.55, 0.75), size: 2.6, drag: 0.8 });
  },
  // The big one: a blinding core, a glittering shell, a tilted ring and a vast golden canopy,
  // then a chain of smaller bursts round its edge.
  supernova: (kit, b, k) => {
    const { x, y, rgb, alt } = b;
    sphere(kit, x, y, 70, 220 * k, () => WHITE, { life: 0.7, size: 3.2 });
    sphere(kit, x, y, 170, 430 * k, () => rgb, { glitter: true, tail: true, life: rand(1.6, 2.1) });
    sphere(kit, x, y, 110, 470 * k, (i) => (i % 2 ? alt : GOLD), { glitter: true, gravity: 50, life: 1.9 }, 0.3, rand(-0.3, 0.3));
    sphere(kit, x, y, 140, 560 * k, () => GOLD, { drag: 2, gravity: 60, life: rand(2.8, 3.6), glitter: true, size: 1.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rand(-0.3, 0.3);
      const d = rand(200, 280) * k;
      const echo = {
        ...b,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d * 0.8,
        shape: 'peony' as const,
        scale: 0.45,
        rgb: pick(kit.palette),
        level: b.level * 0.5,
      };
      kit.later(rand(0.45, 0.9), echo);
    }
    return { crackling: true, smoke: [rgb, ...kit.nebulae, alt], puffs: 9 };
  },
};

/**
 * The programme, timed to the fanfare (gameOverSound.ts): three quick bursts on the pickups, one on each long note,
 * galaxies on the climb, a supernova on the last chord, a dense finale ending in a second supernova. Returns when
 * the slower display that follows starts.
 */
export function programme(fire: Fire, player: Rgb): number {
  const H = FANFARE_HITS;
  H.pickups.forEach((t, i) => fire(t, { shape: 'peony', scale: 0.6, flight: 0.65, x: 0.25 + i * 0.25, y: 0.2 }));
  fire(H.first, { shape: 'double', x: 0.3, y: 0.28, scale: 1.1 });
  fire(H.first, { shape: 'ring', x: 0.72, y: 0.22 });
  fire(H.second, { shape: 'objective', x: 0.5, y: 0.18, scale: 1.15 });
  fire(H.second + 0.1, { shape: 'crossette', x: 0.15, y: 0.35 });
  fire(H.second + 0.1, { shape: 'crossette', x: 0.85, y: 0.35 });
  fire(H.rise[0], { shape: 'galaxy', x: 0.25, y: 0.25 });
  fire(H.rise[1], { shape: 'galaxy', x: 0.75, y: 0.25 });
  fire(H.final, { shape: 'supernova', x: 0.5, y: 0.26, scale: 1.4, rgb: player, flight: 1.2 });
  fire(H.final + 0.25, { shape: 'willow', x: 0.12, y: 0.3 });
  fire(H.final + 0.25, { shape: 'willow', x: 0.88, y: 0.3 });
  [4.3, 4.7, 5.2].forEach((t) => fire(t, { shape: pick<Shape>(['brocade', 'objective', 'galaxy', 'double']) }));
  for (let i = 0; i < 16; i++) fire(5.9 + i * 0.15 + rand(0, 0.08), { scale: rand(0.85, 1.2) });
  fire(8.6, { shape: 'supernova', x: rand(0.35, 0.65), y: 0.24, scale: 1.3 });
  fire(8.8, { shape: 'willow', x: 0.2, y: 0.32 });
  fire(8.8, { shape: 'willow', x: 0.8, y: 0.32 });
  return 10.5;
}
