import { NEBULA_HUES } from '@regolith/art';
import { FANFARE_HITS, fireworkSound } from '../../gameOverSound';
import { pick, rand } from '../../random';
import { RANDOM_SHAPES, SHAPES, programme, sphere, type Burst, type Fire, type Kit, type LaunchOptions, type SparkStyle } from './display';
import { GOLD, WHITE, glowSprite, lift, nebulaSprite, rgba, tint, toRgb, type Rgb } from './sprites';

// The victory show's engine: it fires what display.ts programmes. Rockets climb and burst into sparks; every
// burst lights the sky, sends out a shock wave and leaves its smoke glowing as a nebula, swirled like the
// nebulae in the board art, that drifts and fades. Drawn on two canvases: the glow (redrawn each frame)
// under the sparks (which leave trails).

interface Spark extends Required<SparkStyle> {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds it started with (`life` is what's left). */
  max: number;
  rgb: Rgb;
}

interface Rocket extends Burst {
  vx: number;
  vy: number;
  /** Its own deceleration, so it reaches its peak in exactly the flight time asked for. */
  g: number;
  /** Seconds until it bursts. */
  life: number;
}

/** A puff of glowing smoke: one nebula sprite, growing, turning and fading. */
interface Cloud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r0: number;
  r1: number;
  rot: number;
  spin: number;
  life: number;
  max: number;
  peak: number;
  img: HTMLCanvasElement;
}

/** The sky lit up by a burst, or the shock wave racing out from it. */
interface Light {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  rgb: Rgb;
}

const GRAVITY = 140;
/** Nebula sprites to vary the smoke with. */
const NEBULAE = 4;
/** The sky can only hold so much smoke: past this, the oldest goes first. */
const MAX_CLOUDS = 70;

/** Takes `dt` off each item's life and keeps those still alive, calling `each` on them (and `died` on the rest). */
function age<T extends { life: number }>(xs: T[], dt: number, each: (x: T) => void, died?: (x: T) => void): T[] {
  return xs.filter((x) => {
    x.life -= dt;
    if (x.life > 0) each(x);
    else died?.(x);
    return x.life > 0;
  });
}

/** Moves a spark on by `dt`, slowed by drag and pulled down by gravity. */
function fly(s: Spark, dt: number) {
  const slow = Math.exp(-s.drag * dt);
  s.vx *= slow;
  s.vy = s.vy * slow + s.gravity * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

function drawCloud(ctx: CanvasRenderingContext2D, c: Cloud) {
  const since = c.max - c.life;
  const t = since / c.max;
  const r = c.r0 + (c.r1 - c.r0) * (1 - (1 - Math.min(1, t * 2)) ** 3);
  ctx.globalAlpha = c.peak * Math.min(1, since / 0.4) * (1 - t) ** 1.3;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.rot);
  ctx.drawImage(c.img, -r, -r, 2 * r, 2 * r);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFlash(ctx: CanvasRenderingContext2D, f: Light) {
  const a = (f.life / f.max) ** 2;
  const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
  grad.addColorStop(0, rgba(f.rgb, 0.45 * a));
  grad.addColorStop(0.3, rgba(f.rgb, 0.16 * a));
  grad.addColorStop(1, rgba(f.rgb, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(f.x - f.r, f.y - f.r, 2 * f.r, 2 * f.r);
}

function drawWave(ctx: CanvasRenderingContext2D, v: Light) {
  const p = 1 - v.life / v.max;
  const grow = 1 - (1 - p) ** 3;
  ctx.strokeStyle = rgba(v.rgb, 0.55 * (1 - p) ** 1.5);
  ctx.lineWidth = 1 + 7 * (1 - p);
  ctx.beginPath();
  ctx.ellipse(v.x, v.y, v.r * grow, v.r * 0.8 * grow, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function streak(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, style: string, width: number) {
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** Starts the show on the two canvases, in the winner's `color`. Returns what stops it. */
export function startShow(glowCanvas: HTMLCanvasElement, sparkCanvas: HTMLCanvasElement, color: string): () => void {
  const bg = glowCanvas.getContext('2d');
  const fg = sparkCanvas.getContext('2d');
  if (!bg || !fg) return () => {};

  const player = lift(toRgb(fg, color), 0.2);
  const [lo, hi] = NEBULA_HUES;
  const nebulaColours = Array.from({ length: 4 }, (_, i) => toRgb(fg, `hsl(${lo + ((hi - lo) * i) / 3} 80% 58%)`));
  const palette: Rgb[] = [player, player, GOLD, WHITE, lift(player, 0.6)];

  let w = 0;
  let h = 0;
  let maxSparks = 2500;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = sparkCanvas.clientWidth;
    h = sparkCanvas.clientHeight;
    for (const [c, ctx] of [
      [glowCanvas, bg],
      [sparkCanvas, fg],
    ] as const) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    maxSparks = Math.round(Math.min(4500, Math.max(1600, ((w * h) / (1280 * 800)) * 3800)));
  };
  resize();
  window.addEventListener('resize', resize);
  // Bursts scale with the screen, so a phone isn't swamped and a monitor isn't sparse.
  const unit = () => Math.min(Math.max(Math.min(w, h) / 700, 0.55), 1.4);

  // The nebula sprites take a moment each to make, so they are made one a frame (the first one now).
  const nebulae: HTMLCanvasElement[] = [nebulaSprite(Math.floor(rand(1, 1e6)))];
  const glow = glowSprite();

  let rockets: Rocket[] = [];
  let sparks: Spark[] = [];
  let clouds: Cloud[] = [];
  let flashes: Light[] = [];
  let waves: Light[] = [];
  let queue: { at: number; fn: () => void }[] = [];
  let clock = 0;
  const at = (t: number, fn: () => void) => queue.push({ at: t, fn });
  /** The fireworks stay quieter while the fanfare plays. */
  const level = () => (clock < FANFARE_HITS.final + 2.5 ? 0.45 : 1);

  const kit: Kit = {
    spark: (s) => {
      if (sparks.length >= maxSparks) return;
      const life = s.life ?? rand(1.1, 1.8);
      sparks.push({ size: 2.2, drag: 1.4, gravity: GRAVITY, glitter: false, split: false, tail: false, ...s, life, max: life });
    },
    later: (delay, b) => at(clock + delay, () => burst(b)),
    palette,
    nebulae: nebulaColours,
  };

  /** Glowing smoke round (x, y): `n` nebula puffs about `size` across, in `colours`. */
  const smoke = (x: number, y: number, size: number, n: number, colours: Rgb[], peak: number) => {
    for (let i = 0; i < n; i++) {
      const life = rand(4.5, 7.5);
      clouds.push({
        x: x + rand(-0.35, 0.35) * size,
        y: y + rand(-0.3, 0.3) * size,
        vx: rand(-14, 14),
        vy: rand(-16, 2),
        r0: size * 0.35,
        r1: size * rand(0.85, 1.3),
        rot: rand(0, Math.PI * 2),
        spin: rand(-0.12, 0.12),
        life,
        max: life,
        peak: peak * rand(0.75, 1.2),
        img: tint(pick(nebulae), colours[i % colours.length]),
      });
    }
    if (clouds.length > MAX_CLOUDS) clouds = clouds.slice(clouds.length - MAX_CLOUDS);
  };

  const burst = (b: Burst) => {
    const { x, y, rgb } = b;
    const big = b.shape === 'supernova';
    const k = b.scale * unit();
    const after = SHAPES[b.shape](kit, b, k) ?? {};
    // The sky lights up, a shock wave races out, and the smoke is left glowing as a nebula.
    const reach = (big ? 2 : 1) * 320 * k;
    const flash = big ? 0.8 : 0.45;
    const wave = big ? 1.2 : 0.7;
    flashes.push({ x, y, r: reach * 1.6, life: flash, max: flash, rgb: lift(rgb, 0.4) });
    waves.push({ x, y, r: reach * 1.1, life: wave, max: wave, rgb: lift(rgb, 0.6) });
    if (b.scale >= 0.6)
      smoke(x, y, reach * 0.9, after.puffs ?? 3, after.smoke ?? [rgb, pick(nebulaColours), pick(nebulaColours)], big ? 0.3 : 0.22);
    fireworkSound.burst(Math.min(1.5, b.scale * (big ? 1.3 : 1)), {
      crackling: !!after.crackling,
      level: b.level,
      distance: big ? 0.05 : rand(0.1, 0.9),
    });
  };

  const launch = (o: LaunchOptions = {}) => {
    const flight = o.flight ?? rand(0.95, 1.35);
    const x = (o.x ?? rand(0.12, 0.88)) * w;
    // Climbing `rise` in `flight` seconds, slowing to a stop: v = 2·rise/t, g = 2·rise/t².
    const rise = h + 4 - (o.y ?? rand(0.12, 0.42)) * h;
    const vx = rand(-25, 25);
    const rgb = o.rgb ?? pick(palette);
    rockets.push({
      x: x - vx * flight,
      y: h + 4,
      vx,
      vy: (-2 * rise) / flight,
      g: (2 * rise) / (flight * flight),
      life: flight,
      shape: o.shape ?? pick(RANDOM_SHAPES),
      rgb,
      alt: rgb === GOLD ? WHITE : pick([GOLD, WHITE, player, pick(nebulaColours)]),
      scale: o.scale ?? rand(0.9, 1.15),
      level: level(),
    });
    fireworkSound.launch(flight, level() * 0.6);
  };

  /** Launched as late as it can be, to burst on time. */
  const fire: Fire = (t, o = {}) => {
    const flight = Math.min(o.flight ?? rand(0.95, 1.3), Math.max(t, 0.35));
    at(t - flight, () => launch({ ...o, flight }));
  };
  let next = programme(fire, player);

  const halo = (x: number, y: number, rgb: Rgb, a: number, size: number) => {
    bg.globalAlpha = a;
    bg.drawImage(tint(glow, rgb), x - size, y - size, 2 * size, 2 * size);
    bg.globalAlpha = 1;
  };

  /** The glow layer, redrawn from scratch: nebulae, lit sky and shock waves (the sparks add their halos). */
  const drawGlow = (dt: number) => {
    bg.globalCompositeOperation = 'source-over';
    bg.clearRect(0, 0, w, h);
    bg.globalCompositeOperation = 'lighter';
    clouds = age(clouds, dt, (c) => {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.spin * dt;
      drawCloud(bg, c);
    });
    flashes = age(flashes, dt, (f) => drawFlash(bg, f));
    waves = age(waves, dt, (v) => drawWave(bg, v));
  };

  /** The spark layer, which fades rather than clears so every spark leaves a short trail. */
  const drawSparks = (dt: number) => {
    fg.globalCompositeOperation = 'destination-out';
    fg.fillStyle = 'rgba(0,0,0,0.22)';
    fg.fillRect(0, 0, w, h);
    fg.globalCompositeOperation = 'lighter';
    fg.lineCap = 'round';

    rockets = age(
      rockets,
      dt,
      (r) => {
        const [px, py] = [r.x, r.y];
        r.vy += r.g * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        streak(fg, px, py, r.x, r.y, 'rgba(255, 220, 160, 0.95)', 2.2);
        halo(r.x, r.y, GOLD, 0.7, 10);
        if (Math.random() < 0.7)
          kit.spark({ x: r.x, y: r.y, vx: rand(-20, 20), vy: rand(10, 50), rgb: GOLD, life: rand(0.3, 0.6), size: 1.2, gravity: 60 });
      },
      burst,
    );

    const split: Spark[] = [];
    const embers: Spark[] = [];
    sparks = age(
      sparks,
      dt,
      (s) => {
        const [px, py] = [s.x, s.y];
        fly(s, dt);
        const t = s.life / s.max;
        let a = Math.min(1, t * 1.6);
        if (s.glitter && t < 0.6) a *= Math.random() < 0.5 ? 0.15 : 1;
        // Hot sparks burn white before they cool to their colour.
        streak(fg, px, py, s.x, s.y, rgba(lift(s.rgb, Math.max(0, (t - 0.88) / 0.12)), a), s.size);
        if (s.size >= 1.5 && a > 0.3) halo(s.x, s.y, s.rgb, a * 0.35, s.size * 4);
        if (s.tail && t > 0.15 && Math.random() < 0.3) {
          const life = rand(0.3, 0.6);
          embers.push({
            ...s,
            vx: s.vx * 0.1 + rand(-10, 10),
            vy: s.vy * 0.1 + rand(0, 15),
            rgb: GOLD,
            life,
            max: life,
            size: 1,
            drag: 2,
            gravity: 50,
            tail: false,
            glitter: false,
            split: false,
          });
        }
      },
      (s) => {
        if (s.split) split.push(s);
      },
    );
    for (const e of embers) if (sparks.length < maxSparks) sparks.push(e);
    for (const s of split) sphere(kit, s.x, s.y, 10, 120 * unit(), () => pick([s.rgb, WHITE, GOLD]), { life: rand(0.5, 0.8), size: 1.5 });
    if (split.length) fireworkSound.pops(level());
  };

  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    // A long gap (a hidden tab) shouldn't fling everything at once.
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    clock += dt;
    if (nebulae.length < NEBULAE) nebulae.push(nebulaSprite(Math.floor(rand(1, 1e6))));

    const due = queue.filter((q) => q.at <= clock);
    queue = queue.filter((q) => q.at > clock);
    due.forEach((q) => q.fn());
    if (clock > next) {
      launch();
      if (Math.random() < 0.3) launch({ scale: rand(0.7, 1) });
      next = clock + rand(1, 2);
    }
    drawGlow(dt);
    drawSparks(dt);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
