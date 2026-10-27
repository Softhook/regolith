import type { World } from '@regolith/art';
import { REGOLITH_SHADOW } from '@regolith/art';
import { PIECE_SHADOW_LENGTH, PIECE_SHADOW_OPACITY, pieceShadowTint } from './shadows';

/**
 * A barrier, as the Wisp makes it: a soft glass bubble on the planet's surface. The drone's flash-thermal
 * pulse superheats surface regolith and volatile gases, blowing a vitreous blister that instantly flash-freezes
 * in the cold atmosphere into a seamless, translucent silica dome. It belongs to no one once blown, so it is
 * drawn in the ground's own mineral glass, caustic light and shadow, not a player's colour.
 */

/** How high the bubble stands: a cube is 1.0 high; the bubble is a low dome. */
const HEIGHT = 0.22;

interface Tint {
  glass: string;
  rim: string;
  caustic: string;
  bounce: string;
  fused: string;
}

/** Tints for different world surfaces, drawing from the planet's own minerals. */
const WORLD_TINTS: Record<World, Tint> = {
  mars: {
    glass: 'rgba(246, 232, 212, 0.22)',
    rim: '#ffe3c2',
    caustic: '#fff4de',
    bounce: '#e28850',
    fused: 'rgba(42, 24, 14, 0.34)',
  },
  phobos: {
    glass: 'rgba(218, 234, 248, 0.20)',
    rim: '#d2e8ff',
    caustic: '#f0f6ff',
    bounce: '#9db4c8',
    fused: 'rgba(28, 26, 24, 0.36)',
  },
  deimos: {
    glass: 'rgba(242, 224, 218, 0.22)',
    rim: '#f6ddd4',
    caustic: '#fff0eb',
    bounce: '#d89b82',
    fused: 'rgba(44, 28, 22, 0.32)',
  },
};

/** Neutral crystal tint for deep-space boards. */
const SPACE_TINT: Tint = {
  glass: 'rgba(224, 238, 255, 0.18)',
  rim: '#bce0ff',
  caustic: '#e8f4ff',
  bounce: '#7098c8',
  fused: 'rgba(18, 24, 34, 0.28)',
};

/** Deterministic pseudo-random generator so a barrier keeps its subtle organic shape across renders. */
function seeded(r: number, c: number) {
  let t = (r * 7919 + c * 104729 + 1) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a fused scorched base patch where molten regolith bonded to the planet surface. */
function fusedBasePatch(R: number, rand: () => number) {
  const n = 8;
  const turn = rand() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = turn + (i * 2 * Math.PI) / n + (rand() - 0.5) * 0.3;
    const len = R * (1.08 + rand() * 0.12);
    return [Math.cos(a) * len, Math.sin(a) * len] as [number, number];
  });
  const midOf = (i: number): [number, number] => {
    const [p, q] = [pts[i], pts[(i + 1) % n]];
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  };
  const f = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  return `M${f(midOf(n - 1))}` + pts.map((p, i) => `Q${f(p)} ${f(midOf(i))}`).join('') + 'Z';
}

/** Arc along the bottom-right perimeter for ground bounce light reflection. */
function bounceArc(R: number): string {
  const a0 = (20 * Math.PI) / 180;
  const a1 = (125 * Math.PI) / 180;
  const p0 = [Math.cos(a0) * R, Math.sin(a0) * R];
  const p1 = [Math.cos(a1) * R, Math.sin(a1) * R];
  return `M ${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`;
}

export interface BarrierBubbleProps {
  r: number;
  c: number;
  x: number;
  y: number;
  cell: number;
  mm: number;
  cast: boolean;
  world?: World;
}

/**
 * A barrier on the space centered on (x, y): a soft glass bubble resting on the planet's surface.
 * `cast`: on a world's ground, it casts a lens-focused shadow and caustic hotspot.
 */
export function BarrierBubble({ r, c, x, y, cell, mm, cast, world }: BarrierBubbleProps) {
  const rand = seeded(r, c);
  const tint = world ? WORLD_TINTS[world] : SPACE_TINT;

  // Slight organic variation in dome radius and highlight angle
  const R = cell * (0.375 + (rand() - 0.5) * 0.015);
  const specAngle = -42 + (rand() - 0.5) * 6;

  // Tiny internal micro-bubble inclusion in the vitrified silica
  const incAngle = rand() * Math.PI * 2;
  const incDist = R * (0.22 + rand() * 0.4);
  const incX = Math.cos(incAngle) * incDist;
  const incY = Math.sin(incAngle) * incDist;
  const incR = cell * (0.009 + rand() * 0.005);

  const patch = fusedBasePatch(R, rand);
  const bouncePath = bounceArc(R);

  // Cast shadow offset along the light direction (top-left to bottom-right)
  const far = cell * HEIGHT * PIECE_SHADOW_LENGTH;
  const id = `barrier-b-${r}-${c}`;

  return (
    <g className="barrier" transform={`translate(${x} ${y})`}>
      <defs>
        {/* Soft volumetric glass body: translucent center, denser rim */}
        <radialGradient id={`${id}-body`} cx="36%" cy="32%" r="66%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="50%" stopColor={tint.glass} stopOpacity="0.22" />
          <stop offset="82%" stopColor={tint.glass} stopOpacity="0.45" />
          <stop offset="96%" stopColor={tint.rim} stopOpacity="0.65" />
          <stop offset="100%" stopColor={tint.rim} stopOpacity="0.82" />
        </radialGradient>

        {/* Fresnel edge luminescence: grazing angles glow softly against sky/ambient */}
        <radialGradient id={`${id}-fresnel`} cx="50%" cy="50%" r="50%">
          <stop offset="75%" stopColor={tint.rim} stopOpacity="0" />
          <stop offset="92%" stopColor={tint.rim} stopOpacity="0.4" />
          <stop offset="98%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="100%" stopColor={tint.rim} stopOpacity="0.3" />
        </radialGradient>

        {/* Focused optical caustic light pool on the ground inside the shadow */}
        <radialGradient id={`${id}-caustic`} cx="48%" cy="48%" r="52%">
          <stop offset="0%" stopColor={tint.caustic} stopOpacity="0.72" />
          <stop offset="45%" stopColor={tint.caustic} stopOpacity="0.38" />
          <stop offset="100%" stopColor={tint.caustic} stopOpacity="0" />
        </radialGradient>

        {/* Primary specular highlight gradient */}
        <linearGradient id={`${id}-spec`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>

        {/* Fused scorched contact ring gradient */}
        <radialGradient id={`${id}-fused`} cx="50%" cy="50%" r="50%">
          <stop offset="78%" stopColor={tint.fused} stopOpacity="0.4" />
          <stop offset="94%" stopColor={tint.fused} stopOpacity="0.2" />
          <stop offset="100%" stopColor={tint.fused} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1. Fused scorched patch on the ground where the bubble melted the dust */}
      <path d={patch} fill={tint.fused} style={{ filter: `blur(${cell * 0.025}px)` }} />

      {/* 2. Cast ground shadow and focused caustic spot */}
      {cast && (
        <g transform={`translate(${far} ${far})`}>
          {/* Soft diffuse dome shadow */}
          <ellipse
            cx={0}
            cy={0}
            rx={R * 1.06}
            ry={R * 0.88}
            transform="rotate(45)"
            fill={pieceShadowTint(tint.glass)}
            opacity={PIECE_SHADOW_OPACITY * 0.72}
            style={{ filter: `blur(${REGOLITH_SHADOW.blur * mm * 0.65}px)` }}
          />
          {/* Optical caustic spot: sunlight refracted and concentrated through the dome */}
          <ellipse
            cx={far * 0.4}
            cy={far * 0.4}
            rx={R * 0.36}
            ry={R * 0.22}
            transform="rotate(45)"
            fill={`url(#${id}-caustic)`}
            style={{ filter: `blur(${cell * 0.02}px)` }}
          />
        </g>
      )}

      {/* 3. Fused contact ring right at the base of the bubble */}
      <circle cx={0} cy={0} r={R * 1.05} fill={`url(#${id}-fused)`} />

      {/* 4. Translucent glass dome body */}
      <circle cx={0} cy={0} r={R} fill={`url(#${id}-body)`} />

      {/* 5. Micro-bubble seed in the glass */}
      <circle cx={incX} cy={incY} r={incR} fill="#ffffff" opacity={0.4} />

      {/* 6. Lower-right ground bounce / back light reflection */}
      <path
        d={bouncePath}
        fill="none"
        stroke={tint.bounce}
        strokeWidth={cell * 0.022}
        strokeOpacity={0.42}
        strokeLinecap="round"
        style={{ filter: `blur(${cell * 0.012}px)` }}
      />

      {/* 7. Fresnel edge glow (luminous perimeter) */}
      <circle cx={0} cy={0} r={R} fill={`url(#${id}-fresnel)`} />

      {/* 8. Soft outer meniscus outline */}
      <circle cx={0} cy={0} r={R} fill="none" stroke={tint.rim} strokeWidth={cell * 0.014} strokeOpacity={0.45} />

      {/* 9. Primary specular highlight (Key light, top-left) */}
      <g transform={`rotate(${specAngle.toFixed(1)} ${(-R * 0.35).toFixed(1)} ${(-R * 0.35).toFixed(1)})`}>
        {/* Soft wide bloom reflection */}
        <ellipse
          cx={-R * 0.35}
          cy={-R * 0.35}
          rx={R * 0.34}
          ry={R * 0.14}
          fill={`url(#${id}-spec)`}
          style={{ filter: `blur(${cell * 0.018}px)` }}
        />
        {/* Crisp pinpoint glint */}
        <ellipse cx={-R * 0.38} cy={-R * 0.38} rx={R * 0.13} ry={R * 0.048} fill="#ffffff" opacity={0.88} />
        {/* Secondary faint pinpoint */}
        <circle cx={-R * 0.2} cy={-R * 0.46} r={R * 0.032} fill="#ffffff" opacity={0.55} />
      </g>

      <title>A barrier: nothing moves, drops or shoots through it</title>
    </g>
  );
}
