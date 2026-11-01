import { n } from '../svg';
import { mono, type MechInk } from './inks';
import { RIGS, type MechKind, type Reach, type Rig } from './mechs';

/**
 * A mech posed and printed (mechs.ts has the rigs). Angles are in degrees on the page, clockwise positive,
 * for the limb at x > 0 (`plus`, the viewer's right when front on) and the mirrored one (`minus`); each
 * segment's angle is added to the one before it, so a leg's `[hip, knee]` bends at the knee. The feet stay
 * flat unless given, and the mech stands on its lowest foot.
 *
 * Turned (`yaw`), it is drawn in 3D and seen from a little above (`pitch`): every part is its front-view outline
 * pushed back through its depth (the hull's, or its limb's thickness), or, for the rig's `round` parts, turned
 * about the upright axis; legs can splay out of the front plane; and each group (a leg, the hull, an arm) is
 * drawn far to near. Of a part's walls only those facing the viewer print: the upward ones in the top ink, the
 * rest in the side ink, its front over them.
 *
 * `legs` and `arms` turn a limb in the mech's front plane, out to its side. A limb that steps or reaches goes fore
 * and aft instead (`swing`, `plant`), hinged on the joint's cross axis: it stays clear of the hull beside it.
 */
export interface Pose {
  /** Turned towards the viewer: + brings its `plus` side nearer, − its `minus` side. ±35 reads well. */
  yaw?: number;
  /** How far the viewer looks down on it, in degrees (default 14 when turned, 0 front on). */
  pitch?: number;
  /** The upper body leaning about the hips: + clockwise. */
  lean?: number;
  /** The upper body bowing about the hip axis: + forward, − back. */
  tilt?: number;
  legs?: { plus?: readonly number[]; minus?: readonly number[] };
  arms?: { plus?: readonly number[]; minus?: readonly number[] };
  /** Limbs hinged fore and aft, each segment's added to the one before: + forward, so a knee bends −, an elbow +. */
  swing?: {
    legs?: { plus?: readonly number[]; minus?: readonly number[] };
    arms?: { plus?: readonly number[]; minus?: readonly number[] };
  };
  /** Both feet flat on the ground and the knees worked out to suit (instead of `swing.legs`): the hips dropped by `crouch`, each foot forward (+) of its hip, as fractions of the leg's length. */
  plant?: { crouch: number; plus: number; minus: number };
  /** The held rifle's turn about its grip (the Sniper): + clockwise. */
  aim?: number;
  /** The rifle brought up (the Sniper): turned this far forward in plan, the leading arm's hand at the muzzle end and the arms reaching to their grips wherever it points. */
  shoulder?: number;
  /** Mid-refit: one arm off, drawn as the mech without it (`mech`) or as that arm alone (`arm`). */
  detach?: { arm: 'plus' | 'minus'; show: 'mech' | 'arm' };
}

/** How a mech is placed: its feet's middle at `x`, `y` (mm), `size` mm per board unit, mirrored when `flip`. */
export interface Placing {
  x: number;
  y: number;
  size: number;
  flip?: boolean;
  pose?: Pose;
  ink: MechInk;
  /** A colour plate printed under it, offset by `dx`, `dy` mm: the misregistered second pass. */
  plate?: { colour: string; dx: number; dy: number };
}

type Part = Rig['hull'][number];
type Pt = [number, number];
type P3 = [number, number, number];
/** An affine map in 3D, by columns: x' = a x + d y + g z + j, and so on. */
type M = readonly [number, number, number, number, number, number, number, number, number, number, number, number];

const I: M = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
/** `m` after `k`: k applied first. */
const mul = (m: M, k: M): M => {
  const col = (i: number, w: 0 | 1) => [0, 1, 2].map((r) => m[r] * k[i] + m[3 + r] * k[i + 1] + m[6 + r] * k[i + 2] + (w ? m[9 + r] : 0));
  return [...col(0, 0), ...col(3, 0), ...col(6, 0), ...col(9, 1)] as unknown as M;
};
const shift = (x: number, y: number, z = 0): M => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
/** The linear map `l` about the point (`x`, `y`, `z`). */
const about = (l: M, x: number, y: number, z = 0): M => mul(shift(x, y, z), mul(l, shift(-x, -y, -z)));
const trig = (deg: number) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
/** Turned on the page about (cx, cy). */
const turn = (deg: number, cx = 0, cy = 0): M => {
  const [c, s] = trig(deg);
  return about([c, s, 0, -s, c, 0, 0, 0, 1, 0, 0, 0], cx, cy);
};
/** Hinged about the cross axis at height `cy`: + takes what hangs below it forward. */
const hinge = (deg: number, cy = 0): M => {
  const [c, s] = trig(deg);
  return about([1, 0, 0, 0, c, s, 0, -s, c, 0, 0, 0], 0, cy);
};
/** Turned in plan about the upright through (cx, cz): + takes x > 0 forward. */
const inPlan = (deg: number, cx = 0, cz = 0): M => {
  const [c, s] = trig(deg);
  return about([c, 0, s, 0, 1, 0, -s, 0, c, 0, 0, 0], cx, 0, cz);
};
const at = (m: M, [x, y, z = 0]: readonly [number, number, number?]): P3 => [
  m[0] * x + m[3] * y + m[6] * z + m[9],
  m[1] * x + m[4] * y + m[7] * z + m[10],
  m[2] * x + m[5] * y + m[8] * z + m[11],
];

const minus = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: P3): P3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** The shortest turn taking direction `a` to direction `b`. */
function align(a: P3, b: P3): M {
  const [p, q] = [unit(a), unit(b)];
  const [x, y, z] = [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const k = 1 / (1 + dot(p, q));
  return [
    1 - k * (y * y + z * z),
    z + k * x * y,
    -y + k * x * z,
    -z + k * x * y,
    1 - k * (x * x + z * z),
    x + k * y * z,
    y + k * x * z,
    -x + k * y * z,
    1 - k * (x * x + y * y),
    0,
    0,
    0,
  ];
}
/** A rigid limb's elbow, lengths `a` then `b` from `s` to `g`, bent towards `pole` (the limb straight where `g` is out of reach). */
function elbow(s: P3, g: P3, a: number, b: number, pole: P3): P3 {
  const v = minus(g, s);
  const d = Math.min(Math.hypot(...v), a + b);
  const u = unit(v);
  const c = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - c * c));
  const k = dot(pole, u);
  const up = unit([pole[0] - u[0] * k, pole[1] - u[1] * k, pole[2] - u[2] * k]);
  return [0, 1, 2].map((i) => s[i] + u[i] * c + up[i] * h) as unknown as P3;
}

/** An SVG transform list of `translate`, `rotate` and `scale`, as a map. */
function transform(list: string): M {
  let m = I;
  for (const [, fn, args] of list.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const [p, q] = args.split(/[ ,]+/).map(Number);
    m = mul(m, fn === 'translate' ? shift(p, q ?? 0) : fn === 'rotate' ? turn(p) : [p, 0, 0, 0, q ?? p, 0, 0, 0, 1, 0, 0, 0]);
  }
  return m;
}

/** A path's outlines as points: lines, Béziers and the rigs' half-circle arcs, sampled. */
function outlines(d: string): { pts: Pt[]; closed: boolean }[] {
  const tokens = d.match(/[MLCQZAmlcqza]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const out: { pts: Pt[]; closed: boolean }[] = [];
  let cur: Pt[] = [];
  let p: Pt = [0, 0];
  let cmd = '';
  let i = 0;
  const num = () => Number(tokens[i++]);
  const start = () => {
    if (cur.length) out.push({ pts: cur, closed: false });
    cur = [];
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === 'M') {
      start();
      p = [num(), num()];
      cur.push(p);
      cmd = 'L';
    } else if (cmd === 'L') {
      p = [num(), num()];
      cur.push(p);
    } else if (cmd === 'C' || cmd === 'Q') {
      const ctrl: Pt[] =
        cmd === 'C'
          ? [
              [num(), num()],
              [num(), num()],
            ]
          : [[num(), num()]];
      const end: Pt = [num(), num()];
      const all = [p, ...ctrl, end];
      for (let k = 1; k <= 8; k++) {
        const t = k / 8;
        // De Casteljau.
        let level = all;
        while (level.length > 1)
          level = level.slice(1).map((q, j) => [level[j][0] + (q[0] - level[j][0]) * t, level[j][1] + (q[1] - level[j][1]) * t] as Pt);
        cur.push(level[0]);
      }
      p = end;
    } else if (cmd === 'a') {
      const r = num();
      i += 3;
      const sweep = num();
      const dx = num();
      const dy = num();
      const c: Pt = [p[0] + dx / 2, p[1] + dy / 2];
      const a0 = Math.atan2(p[1] - c[1], p[0] - c[0]);
      for (let k = 1; k <= 10; k++) {
        const a = a0 + (sweep ? 1 : -1) * Math.PI * (k / 10);
        cur.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
      }
      p = [p[0] + dx, p[1] + dy];
    } else if (cmd === 'Z' || cmd === 'z') {
      if (cur.length) out.push({ pts: cur, closed: true });
      cur = [];
      cmd = '';
    } else i++;
  }
  if (cur.length) out.push({ pts: cur, closed: false });
  return out;
}

const OUTLINES = new Map<string, ReturnType<typeof outlines>>();
const outlinesOf = (d: string) => {
  if (!OUTLINES.has(d)) OUTLINES.set(d, outlines(d));
  return OUTLINES.get(d)!;
};

/** Trims the base of a shin so it meets the foot in a level line parallel to the ground. */
function levelAnkle(d: string, ankle: readonly [number, number], angle: number): string {
  if (!angle) return d;
  const rad = (angle * Math.PI) / 180;
  const [ca, sa] = [Math.cos(rad), Math.sin(rad)];
  return outlinesOf(d)
    .map((o) => {
      const pts = o.pts.map(([x, y]) => {
        if (y < ankle[1] - 4) return [x, y] as Pt;
        const [dx, dy] = [x - ankle[0], y - ankle[1]];
        return [ankle[0] + dx * ca - dy * sa, ankle[1] + dx * sa + dy * ca] as Pt;
      });
      return path(pts, o.closed);
    })
    .join(' ');
}

/** A part placed for drawing: its map in the front plane, the middle of its depth, its thickness, its turn in plan (degrees, about the upright axis), whether it's round (turned about that axis rather than pushed back), and where it lies on a round hull (its depth at a point, in its own coordinates). */
interface Item {
  part: Part;
  m: M;
  z: number;
  t: number;
  h: number;
  /** The map to order it by, where its own would tip it out of its stack (a hull's parts lean together). */
  rest?: M;
  round?: boolean;
  wrap?: (p: Pt) => number;
  /** Part of a leg's foot: the rest of the leg stands on it. */
  foot?: boolean;
  /** Limb type ('leg' | 'arm'). */
  limb?: 'leg' | 'arm';
  /** Limb segment index (0 = thigh/upper arm, 1 = shin/forearm, 2 = foot/hand). */
  seg?: number;
}

/** A group drawn together (a leg, the hull, an arm): how far out to the side it hangs, its order when level, and its parts. */
interface Group {
  x: number;
  z: number;
  seq: number;
  items: Item[];
}

/** A leg's segments' depth and thickness by default, as fractions of the limbs' thickness: a heavy thigh, a slimmer shin, a long foot set forward. */
const LEG = [
  { z: 0, t: 1.15 },
  { z: 0, t: 0.85 },
  { z: 0.3, t: 1.7 },
];

/** An arm's segments' depth and thickness by default: a heavy shoulder pauldron, a slimmer forearm. */
const ARM = [
  { z: 0, t: 1.15 },
  { z: 0, t: 0.95 },
  { z: 0, t: 0.85 },
];

const FILLS = new Set(['k', 'j', 'r', 'pf', 'gun']);
/** Lines printed on the front of the part they're drawn with (a rod runs through its middle). */
const ON_FACE = new Set(['l', 'p', 'w']);

/** A leg's angles with the foot kept flat when not given. */
const legAngles = (a: readonly number[] = [], segs: number) => {
  const out = Array.from({ length: segs }, (_, i) => a[i] ?? 0);
  if (segs > 2 && a[2] === undefined) out[2] = -(out[0] + out[1]);
  return out;
};

/** The maps of a limb's segments, each turned about its pivot and carrying the next. */
function chainMaps(segs: Rig['leg'], angles: readonly number[], base: M, swings: readonly number[] = []): M[] {
  const maps: M[] = [];
  let m = base;
  segs.forEach((s, i) => {
    m = mul(mul(m, turn(angles[i] ?? 0, s.pivot[0], s.pivot[1])), hinge(swings[i] ?? 0, s.pivot[1]));
    maps.push(m);
  });
  return maps;
}

/** A leg's fore-and-aft hip and knee, its hips dropped by `crouch` and its ankle `forward` of them, as fractions of its length. */
function plantLeg(rig: Rig, crouch: number, forward: number): [number, number] {
  const a = Math.abs(rig.leg[1].pivot[1] - rig.leg[0].pivot[1]);
  const b = Math.abs(rig.leg[2].pivot[1] - rig.leg[1].pivot[1]);
  const [down, on] = [(a + b) * (1 - crouch), (a + b) * forward];
  const d = Math.min(Math.hypot(down, on), a + b - 0.01);
  const deg = 180 / Math.PI;
  const thigh = Math.acos((a * a + d * d - b * b) / (2 * a * d)) * deg;
  const shin = Math.acos((b * b + d * d - a * a) / (2 * b * d)) * deg;
  return [Math.atan2(on, down) * deg + thigh, -(thigh + shin)];
}

/** The mech's parts placed, in groups, in board units. */
function groups(rig: Rig, pose: Pose): Group[] {
  const hullT = rig.depth;
  const limbT = rig.limb ?? rig.depth / 2;
  const legA = (s: 1 | -1) => legAngles(s > 0 ? pose.legs?.plus : pose.legs?.minus, rig.leg.length).map((a) => a * s);
  const armA = (s: 1 | -1) =>
    Array.from({ length: rig.arm.length }, (_, i) => ((s > 0 ? pose.arms?.plus : pose.arms?.minus)?.[i] ?? 0) * s);
  const mirror = (s: 1 | -1): M => [s, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  // Fore and aft: a planted leg's thigh and knee from where its foot stands, the foot left flat.
  const legSwing = (s: 1 | -1): readonly number[] => {
    const side = s > 0 ? 'plus' : 'minus';
    const set = pose.plant ? plantLeg(rig, pose.plant.crouch, pose.plant[side]) : (pose.swing?.legs?.[side] ?? []);
    return legAngles(set, rig.leg.length);
  };
  const armSwing = (s: 1 | -1) => pose.swing?.arms?.[s > 0 ? 'plus' : 'minus'] ?? [];
  // Stand on the lowest foot: how far each ankle rises.
  const ankleRise = (s: 1 | -1) => {
    if (rig.leg.length < 3) return 0;
    const maps = chainMaps(rig.leg, legA(s), I, legSwing(s));
    const ankle = rig.leg[rig.leg.length - 1].pivot;
    return at(maps[rig.leg.length - 2], ankle)[1] - ankle[1];
  };
  const ground = shift(0, -Math.max(ankleRise(1), ankleRise(-1)));
  const hipY = rig.leg[0].pivot[1];
  const upper = mul(mul(ground, turn(pose.lean ?? 0, 0, hipY)), hinge(-(pose.tilt ?? 0), hipY));
  const item = (part: Part, m: M, z: number, t: number, h = 0): Item => ({
    part,
    m,
    z: z + (part[3] ?? 0) + (ON_FACE.has(part[0]) ? t / 2 : 0),
    t: FILLS.has(part[0]) ? (part[4] ?? (part[0] === 'r' ? t * 0.85 : t)) : 0,
    h,
  });

  const out: Group[] = [];
  // The legs stand a little behind the hull's middle, so the hull's front covers the hips.
  const shape = rig.leg.map((_, i) => rig.legShape?.[i] ?? LEG[i] ?? { z: 0, t: 1 });
  (rig.splay ?? [0]).forEach((splay, pair) => {
    for (const s of [1, -1] as const) {
      const maps = chainMaps(rig.leg, legA(s), mul(ground, mirror(s)), legSwing(s));
      const h = (s * splay * Math.PI) / 180;
      const x = s * rig.leg[0].pivot[0];
      const hipZ = limbT * 0.2;
      out.push({
        x: x * Math.cos(h) + hipZ * Math.sin(h),
        z: x * Math.sin(h) - hipZ * Math.cos(h),
        seq: pair * 2 + (s > 0 ? 0 : 1) - 10,
        items: rig.leg.flatMap((seg, i) => {
          const ankle = rig.leg.length > 2 && i === 1 ? rig.leg[2].pivot : undefined;
          const a2 = ankle ? (legA(s)[2] ?? 0) : 0;
          return seg.parts
            .filter((p) => p[0] !== 'j')
            .map((p) => {
              const part = ankle && p[0] === 'k' ? ([p[0], levelAnkle(p[1], ankle, a2), ...p.slice(2)] as unknown as Part) : p;
              return {
                ...item(part, maps[i], shape[i].z * limbT, shape[i].t * limbT, s * splay),
                foot: rig.leg.length > 2 && i === rig.leg.length - 1,
                limb: 'leg',
                seg: i,
              };
            });
        }),
      });
    }
  });
  // Seams and lights on the front of the part they're printed over: wrapped round where it's round, else on the nearest flat face.
  const radius = roundRadius(rig.round ?? []);
  const faces = rig.hull.map((p) => ({ o: outlinesOf(p[1]).filter((o) => o.closed), front: (p[3] ?? 0) + (p[4] ?? hullT) / 2 }));
  const wrap = (p: Pt) => {
    const r = radius(p[1]);
    if (r !== undefined && Math.abs(p[0]) < r) return Math.sqrt(r * r - p[0] * p[0]);
    const over = faces.filter((f) => f.o.some((o) => inside(o.pts, p))).map((f) => f.front);
    return over.length ? Math.max(...over) : hullT / 2;
  };
  out.push({
    x: 0,
    z: 0,
    seq: 2,
    items: [
      ...rig.hull.map((p) => ({ ...item(p, upper, 0, hullT), rest: ground })),
      ...(rig.round ?? []).map((p) => ({ ...item(p, upper, 0, hullT), round: true, rest: ground })),
      ...rig.detail.map((p) => ({ ...item(p, upper, hullT / 2, 0), wrap })),
    ],
  });
  const armShape = rig.arm.map((_, i) => rig.armShape?.[i] ?? ARM[i] ?? { z: 0, t: 1 });
  const armSplay = rig.armSplay ?? 0;
  const detached = pose.detach && (pose.detach.arm === 'plus' ? 1 : -1);
  // The rifle's map, and, brought up, each arm reaching for the other's grip: the leading arm to the muzzle end.
  const rifleZ = hullT / 2 + 6;
  const held = rig.held;
  const aimed = held ? turn(pose.aim ?? 0, held.pivot[0], held.pivot[1]) : I;
  const grip = held ? mul(mul(upper, pose.shoulder ? inPlan(pose.shoulder, held.pivot[0], rifleZ) : I), aimed) : I;
  const brought = pose.shoulder && held?.reach;
  const reachFor = (grips: readonly Reach[], s: 1 | -1) => {
    const [mine, other] = s > 0 ? grips : [grips[1], grips[0]];
    const handZ = rifleZ + 2;
    const shoulder = at(mul(upper, mirror(s)), rig.arm[0].pivot);
    const [elbow0, hand0] = [at(upper, [...mine.elbow, handZ]), at(upper, [...mine.hand, handZ])];
    const upperArm0 = at(upper, mine.elbow);
    const target = at(grip, [...other.hand, handZ]);
    const bend = elbow(shoulder, target, Math.hypot(...minus(upperArm0, shoulder)), Math.hypot(...minus(hand0, elbow0)), [
      s * 0.5,
      1,
      -0.2,
    ]);
    return {
      arm: mul(about(align(minus(upperArm0, shoulder), minus(bend, shoulder)), ...shoulder), mul(upper, mirror(s))),
      hand: mul(
        mul(shift(...bend), mul(align(minus(hand0, elbow0), minus(target, bend)), shift(-elbow0[0], -elbow0[1], -elbow0[2]))),
        upper,
      ),
    };
  };
  // The arm at x > 0's, then the mirrored one's, as `held.hands` are.
  const reached = brought ? [reachFor(brought, 1), reachFor(brought, -1)] : undefined;
  for (const s of [1, -1] as const) {
    if (!rig.arm.length || (s === detached && pose.detach?.show === 'mech')) continue;
    const reach = reached?.[s > 0 ? 0 : 1];
    const maps = reach ? [reach.arm] : chainMaps(rig.arm, armA(s), mul(upper, mirror(s)), armSwing(s));
    const extra = s > 0 ? rig.armExtra?.plain : rig.armExtra?.mirror;
    const h = (s * armSplay * Math.PI) / 180;
    const x = s * rig.arm[0].pivot[0];
    out.push({
      x: x * Math.cos(h),
      z: x * Math.sin(h),
      seq: s > 0 ? 3 : 4,
      items: rig.arm.flatMap((seg, i) =>
        [...seg.parts, ...(extra?.[i] ?? [])]
          .filter((p) => p[0] !== 'j')
          .map((p) => ({ ...item(p, maps[i], armShape[i].z * limbT, armShape[i].t * limbT, s * armSplay), limb: 'arm', seg: i })),
      ),
    });
  }
  if (pose.detach?.show === 'arm') return out.filter((g) => g.seq === (detached === 1 ? 3 : 4));
  if (held) {
    const gun = mul(grip, transform(held.frame));
    const gunRest = mul(mul(ground, aimed), transform(held.frame));
    const hands = held.hands.map((p, i) => {
      const reach = reached?.[i];
      return { ...item(p, reach?.hand ?? grip, rifleZ + 2, 8), rest: reach ? undefined : mul(ground, aimed) };
    });
    const rifle = held.gun.map((p) => ({ ...item(p, gun, rifleZ, 8), rest: gunRest }));
    if (brought) out.push({ x: 0, z: rifleZ, seq: 5, items: rifle }, { x: 0, z: rifleZ + 1, seq: 5, items: hands });
    else out.push({ x: 0, z: rifleZ, seq: 5, items: [...rifle, ...hands] });
  }
  if (rig.top) out.push({ x: 0, z: 0, seq: 6, items: rig.top.map((p) => ({ ...item(p, upper, 0, limbT * 0.5), rest: ground })) });
  return out;
}

const path = (ps: Pt[], closed: boolean) => 'M' + ps.map(([x, y]) => `${n(x)},${n(y)}`).join(' L') + (closed ? ' Z' : '');

/** Twice the signed area: each side wall is wound the same way, so they fill together. */
const area = (ps: Pt[]) => ps.reduce((s, p, i) => s + p[0] * ps[(i + 1) % ps.length][1] - ps[(i + 1) % ps.length][0] * p[1], 0);

/** The half-width of the round parts at a height, in their own coordinates; undefined where there are none. */
function roundRadius(parts: readonly Part[]): (y: number) => number | undefined {
  const edges = parts.flatMap((p) => outlinesOf(p[1]).flatMap((o) => o.pts.map((a, i) => [a, o.pts[(i + 1) % o.pts.length]] as const)));
  return (y) => {
    let r: number | undefined;
    for (const [a, b] of edges)
      if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
        const x = Math.abs(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        r = Math.max(r ?? 0, x);
      }
    return r;
  };
}

/** Whether a point lies within an outline (or on its edge, give or take). */
function inside(ps: Pt[], [x, y]: Pt): boolean {
  let n = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) n = !n;
  }
  return (
    n ||
    ps.some((a, i) => {
      const b = ps[(i + 1) % ps.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len)));
      return Math.hypot(a[0] + t * (b[0] - a[0]) - x, a[1] + t * (b[1] - a[1]) - y) < 1.5;
    })
  );
}

/** An outline's points with each straight run cut in `k`, so it can bend over a round hull. */
const finer = (ps: Pt[], closed: boolean, k = 6): Pt[] =>
  ps.flatMap((a, i) => {
    const b = ps[(i + 1) % ps.length];
    if (!closed && i === ps.length - 1) return [a];
    return Array.from({ length: k }, (_, j) => [a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k] as Pt);
  });

/** The convex hull of points, wound one way. */
function hull(ps: Pt[]): Pt[] {
  const s = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const h: Pt[] = [];
    for (const p of list) {
      while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(s), ...half([...s].reverse())];
}

/** A part of several pieces (a frame's posts and bar) as one item each, so each finds its own depth. */
const pieces = (it: Item): Item[] => {
  const subs = FILLS.has(it.part[0]) ? it.part[1].split(/(?=M)/).filter((d) => d.trim()) : [];
  return subs.length > 1 ? subs.map((d) => ({ ...it, part: [it.part[0], d, ...it.part.slice(2)] as unknown as Part })) : [it];
};

/**
 * A group's parts in layers far to near: each layer's walls, then its fronts, so a part further back never prints
 * over a nearer one's sides. A part goes after any `before` it, then by the depth of its front (the hull's seams
 * and lights last); parts at one depth share a layer.
 */
function layers(items: Item[], before: (a: Item, b: Item) => boolean, depth: (it: Item) => number): Item[][] {
  const front = (it: Item) => (it.wrap ? Infinity : Math.round(depth(it)));
  const rest = [...items].sort((a, b) => front(a) - front(b));
  const out: Item[][] = [];
  while (rest.length) {
    // The first not waiting on another; in a cycle, the first.
    const i = Math.max(
      0,
      rest.findIndex((x) => !rest.some((y) => y !== x && before(y, x))),
    );
    const [it] = rest.splice(i, 1);
    const last = out[out.length - 1];
    if (last && !last.some((y) => before(y, it)) && front(last[0]) === front(it)) last.push(it);
    else out.push([it]);
  }
  return out;
}

/** How a pose is seen: turned, then looked down on. */
function camera(pose: Pose) {
  const deg = Math.PI / 180;
  const yaw = (pose.yaw ?? 0) * deg;
  const pitch = (pose.pitch ?? (pose.yaw ? 14 : 0)) * deg;
  const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
  // Turned about the upright axis (+ yaw brings x > 0 nearer), then seen from above: nearer drops down the page.
  const view = ([x, y, z]: P3): Pt => [x * cy - z * sy, y * cp + (x * sy + z * cy) * sp];
  const nearness = ([x, y, z]: P3) => (x * sy + z * cy) * cp - y * sp;
  return { sy, cy, pitch, view, nearness };
}

/** The mech drawn in board units in `c`. */
function drawn(rig: Rig, pose: Pose, c: MechInk): string {
  const deg = Math.PI / 180;
  const { sy, cy, pitch, view, nearness } = camera(pose);
  // A point of a part at depth `w`, placed, then turned in plan by its splay.
  const space = (it: Item, [px, py]: Pt, pw: number): P3 => {
    const [x, y, w] = at(it.m, [px, py, pw]);
    const h = it.h * deg;
    return [x * Math.cos(h) - w * Math.sin(h), y, x * Math.sin(h) + w * Math.cos(h)];
  };
  const fill: Record<string, string> = { k: c.key, j: c.joint, r: c.recess, pf: c.light, gun: c.gun };
  const ordered = groups(rig, pose)
    .map((g) => ({ g, near: g.x * sy + g.z * cy }))
    .sort((a, b) => a.near - b.near || a.g.seq - b.g.seq);
  let out = '';
  // A part's extent in the front plane and in depth.
  const boxes = new Map<Item, { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }>();
  const box = (it: Item) => {
    if (!boxes.has(it)) {
      const m = it.rest ?? it.m;
      const ps = outlinesOf(it.part[1]).flatMap((o) =>
        o.pts.flatMap(([x, y]) => [at(m, [x, y, it.z - it.t / 2]), at(m, [x, y, it.z + it.t / 2])]),
      );
      const [xs, ys, zs] = [0, 1, 2].map((i) => ps.map((p) => p[i]));
      boxes.set(it, {
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        y0: Math.min(...ys),
        y1: Math.max(...ys),
        z0: Math.min(...zs),
        z1: Math.max(...zs),
      });
    }
    return boxes.get(it)!;
  };
  // Whether `a` must print before `b`: wholly behind it; or, where their depths overlap, the foot under the leg that
  // stands on it, wholly below it (seen from above), or wholly on its far side.
  const before = (a: Item, b: Item) => {
    if (a.wrap || b.wrap) return false;
    const [A, B] = [box(a), box(b)];
    if (A.z1 <= B.z0 + 0.5 && A.z0 < B.z0) return true;
    if (B.z1 <= A.z0 + 0.5 && B.z0 < A.z0) return false;
    if (a.seg !== undefined && b.seg !== undefined && a.seg !== b.seg) {
      // Distal prints before proximal: foot before shin, shin before thigh; hand/forearm before upper arm.
      return a.seg > b.seg;
    }
    if (pitch && A.y0 >= B.y1 - 3) return true;
    if (pitch && B.y0 >= A.y1 - 3) return false;
    return (sy > 0.01 && A.x1 <= B.x0 + 0.5) || (sy < -0.01 && A.x0 >= B.x1 - 0.5);
  };
  // Front on, the parts print in the rig's order, as drawn.
  const turned = Math.abs(sy) > 0.01 || !!pitch;
  for (const { g } of ordered)
    for (const items of turned || g.items.some((it) => it.h) ? layers(g.items.flatMap(pieces), before, (it) => box(it).z1) : [g.items]) {
      // The layer's walls facing the viewer first, far to near, then its fronts over them.
      const walls: { q: Pt[]; near: number; top: boolean }[] = [];
      if (turned || items.some((it) => it.h))
        for (const it of items) {
          if (!it.t || it.round || it.part[0] === 'pf' || it.part[0] === 'j') continue;
          for (const o of outlinesOf(it.part[1])) {
            if (!o.closed) continue;
            const body = o.pts;
            const sign = area(body) > 0 ? 1 : -1;
            const back = body.map((p) => space(it, p, it.z - it.t / 2));
            const front = body.map((p) => space(it, p, it.z + it.t / 2));
            const origin = space(it, [0, 0], 0);
            body.forEach((a, i) => {
              const b = body[(i + 1) % body.length];
              const [nx, ny] = [(b[1] - a[1]) * sign, (a[0] - b[0]) * sign];
              const len = Math.hypot(nx, ny) || 1;
              const out = minus(space(it, [nx / len, ny / len], 0), origin);
              if (nearness(out) <= 0.01) return;
              const j = (i + 1) % body.length;
              const q = [back[i], back[j], front[j], front[i]];
              const page = q.map(view);
              walls.push({
                q: area(page) < 0 ? page.reverse() : page,
                near: q.reduce((s, p) => s + nearness(p), 0) / 4,
                top: it.part[0] === 'r' ? false : out[1] < -0.55,
              });
            });
          }
        }
      walls.sort((a, b) => a.near - b.near);
      // In runs of one ink.
      for (let i = 0; i < walls.length;) {
        let j = i;
        while (j < walls.length && walls[j].top === walls[i].top) j++;
        out += `<path d="${walls
          .slice(i, j)
          .map((w) => path(w.q, true))
          .join(' ')}" fill="${walls[i].top ? c.top : c.side}"/>`;
        i = j;
      }
      for (const it of items) {
        if (it.part[0] === 'j') continue;
        const [kind, d, w] = it.part;
        let face: string;
        if (it.round) {
          // Turned about the upright axis: each band between two heights of its outline's right half is the hull of two rings.
          const half = outlinesOf(d).flatMap((o) => o.pts.filter((p) => p[0] >= -0.01));
          const ring = ([r, y]: Pt) =>
            Array.from({ length: 24 }, (_, k) => {
              const a = (k / 24) * 2 * Math.PI;
              return view(space(it, [r * Math.cos(a), y], it.z + r * Math.sin(a)));
            });
          const bands = half.slice(1).map((p, i) => ({ d: path(hull([...ring(half[i]), ...ring(p)]), true), a: half[i], b: p }));
          face = bands.map((b) => b.d).join(' ');
          // Seen from above, the bands that face up print in the top ink: a lit cap.
          const sign = area(outlinesOf(d)[0].pts) > 0 ? 1 : -1;
          const cap = pitch
            ? bands.filter(({ a, b }) => ((a[0] - b[0]) * sign) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) < -0.55).map((b) => b.d)
            : [];
          if (cap.length) {
            out += `<path d="${face}" fill="${fill[kind]}"/><path d="${cap.join(' ')}" fill="${c.top}"/>`;
            continue;
          }
        } else {
          // Its front, or, hinged past facing the viewer, its back.
          const facing = nearness(minus(space(it, [0, 0], 1), space(it, [0, 0], 0))) >= 0 ? 1 : -1;
          face = outlinesOf(d)
            .map((o) =>
              path(
                (it.wrap ? finer(o.pts, o.closed) : o.pts).map((p) =>
                  view(space(it, p, it.wrap ? it.wrap(p) : it.z + (facing * it.t) / 2)),
                ),
                o.closed,
              ),
            )
            .join(' ');
        }
        if (FILLS.has(kind)) {
          const seam =
            // Turned, the blocks read by their inks alone: no line round a front.
            !turned && ((kind === 'k' && !it.round) || kind === 'gun')
              ? ` stroke="${kind === 'k' ? c.seam : c.recess}" stroke-width="1.4" stroke-linejoin="round"`
              : '';
          out += `<path d="${face}" fill="${fill[kind]}"${seam}/>`;
        } else {
          const colour = kind === 'l' ? c.seam : kind === 'rod' ? c.rod : kind === 'p' ? c.light : c.key;
          const width = w ?? (kind === 'l' ? 1.4 : kind === 'rod' ? 4 : 2.5);
          out += `<path d="${face}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
      }
    }
  return out;
}

/** Where a mech's held gun fires from on the page, in mm; undefined for a mech that holds none. */
export function muzzle(kind: MechKind, o: Pick<Placing, 'x' | 'y' | 'size' | 'flip' | 'pose'>): Pt | undefined {
  const rig = RIGS[kind];
  const pose = o.pose ?? {};
  const { held } = rig;
  if (!held) return undefined;
  const gun = groups(rig, pose)
    .flatMap((g) => g.items)
    .find((it) => it.part === held.gun[0]);
  if (!gun) return undefined;
  const [x, y] = camera(pose).view(at(gun.m, [...held.muzzle, gun.z]));
  const s = o.size * (rig.scale ?? 1);
  return [o.x + (o.flip ? -s : s) * x, o.y + s * y];
}

/** A mech posed and placed, with its colour plate under it. */
export function mech(kind: MechKind, o: Placing): string {
  const rig = RIGS[kind];
  const pose = o.pose ?? {};
  const s = o.size * (rig.scale ?? 1);
  const place = (dx: number, dy: number, body: string) =>
    `<g transform="translate(${n(o.x + dx)},${n(o.y + dy)}) scale(${n(o.flip ? -s : s)},${n(s)})">${body}</g>`;
  const plate = o.plate ? place(o.plate.dx, o.plate.dy, drawn(rig, pose, mono(o.plate.colour))) : '';
  return plate + place(0, 0, drawn(rig, pose, o.ink));
}
