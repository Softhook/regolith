/**
 * The six mechs as rigs, after the mood board's Silhouettes board (docs/moodboards/regolith/Silhouettes.dc.html):
 * the same parts, cut at their joints so a mech can be posed, turned to three-quarters, or cropped close.
 * Drawn front on in the board's units (a person is 60 tall, the ground at y 0, x 0 the mech's middle); one
 * side's leg and arm are drawn, at x > 0, and mirrored for the other.
 */

/** How a part is printed: key ink and seams (`k`), a joint (`j`), a recess (`r`), a seam line (`l`), a hydraulic rod (`rod`), a light or slit in the paper's colour (`p` stroked, `pf` filled), a thin key stroke (`w`), the rifle's lighter metal (`gun`). */
type Kind = 'k' | 'j' | 'r' | 'l' | 'rod' | 'p' | 'pf' | 'w' | 'gun';
/** A part: how it's printed, its path, a stroke width where it's stroked, how far in front of (+) or behind (−) its limb or hull's middle it stands, in depth, and its own thickness front to back (default its limb's or the hull's). */
type Part = readonly [Kind, string, number?, number?, number?];

/** One segment of a limb: it turns about `pivot` (rest coordinates), carrying the segments after it. */
interface Seg {
  pivot: readonly [number, number];
  parts: readonly Part[];
}

/** A forearm in `held.hands`: where it runs from and to. */
export interface Reach {
  elbow: readonly [number, number];
  hand: readonly [number, number];
}

export interface Rig {
  /** Height to the top, for framing. */
  height: number;
  /** How deep the hull is, front to back: it shows in three-quarter view. */
  depth: number;
  /** How thick the limbs are, front to back (default: half the hull's depth). */
  limb?: number;
  /** Thigh, shin, foot of the leg at x > 0. */
  leg: readonly Seg[];
  /** Upper arm, forearm (and hand) of the arm at x > 0. */
  arm: readonly Seg[];
  /** Extra parts on the arm's segments: on the arm at x > 0 (`plain`) or the mirrored one (`mirror`, in its own coordinates). */
  armExtra?: { plain?: readonly (readonly Part[])[]; mirror?: readonly (readonly Part[])[] };
  /** The hull: its solid parts get a side face in three-quarter view; `detail` is drawn over them. */
  hull: readonly Part[];
  /** Hull parts that are round in plan (domes, a helmet), turned about the upright axis rather than pushed back; drawn after `hull`, and the `detail` on them wraps round. */
  round?: readonly Part[];
  detail: readonly Part[];
  /** Each leg segment's depth and thickness, as fractions of the limbs' thickness (default a heavy thigh, a slimmer shin, a long foot set forward). */
  legShape?: readonly { z: number; t: number }[];
  /** Each arm segment's depth and thickness, as fractions of the limbs' thickness (default heavy shoulder, forearm forward). */
  armShape?: readonly { z: number; t: number }[];
  /** Each leg pair's turn in plan, out of the front plane: + swings the legs forward (default one pair, `[0]`). */
  splay?: readonly number[];
  /** How much the arms turn in plan, out of the front plane (degrees). */
  armSplay?: number;
  /** Drawn after the arms: masts, dishes. */
  top?: readonly Part[];
  /** Held across the body (the Sniper's rifle, in its own `frame`, and the hands on it), turning about `pivot` with the pose's `aim`. Each of `hands` is a forearm and fist, and `reach` where each runs from its elbow to its hand (the arm at x > 0's first). */
  held?: {
    pivot: readonly [number, number];
    frame: string;
    gun: readonly Part[];
    hands: readonly Part[];
    reach?: readonly Reach[];
    /** Where it fires from, in its `frame`. */
    muzzle: readonly [number, number];
  };
  /** Drawn larger than the board's units (the Wisp). */
  scale?: number;
}

const circ = (cx: number, cy: number, r: number) => `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`;

export type MechKind = 'breacher' | 'behemoth' | 'tactician' | 'chameleon' | 'sniper' | 'wisp';

export const RIGS: Record<MechKind, Rig> = {
  // 1: hunched brute, shoulders over the head, heavy forearms, breaching spikes on one fist.
  breacher: {
    height: 238,
    depth: 90,
    leg: [
      {
        pivot: [38, -98],
        parts: [
          ['rod', 'M48,-92 L52,-62', 5],
          ['j', circ(38, -98, 11)],
          ['k', 'M28,-98 L48,-100 L60,-62 L64,-48 L54,-38 L40,-42 L40,-54 Z'],
          ['l', 'M40,-54 L60,-50'],
        ],
      },
      {
        pivot: [52, -56],
        parts: [
          ['j', circ(54, -16, 8)],
          ['k', 'M40,-50 L64,-50 L64,-18 L40,-18 Z'],
          ['l', 'M44,-34 L62,-34'],
        ],
      },
      {
        pivot: [54, -16],
        parts: [
          ['k', 'M26,-18 L72,-18 L82,-6 L86,0 L18,0 L22,-8 Z'],
          ['l', 'M36,-6 L36,0 M54,-6 L54,0 M70,-6 L70,0'],
        ],
      },
    ],
    arm: [
      {
        pivot: [82, -178],
        parts: [
          ['r', 'M68,-164 L100,-160 L102,-126 L70,-126 Z'],
          ['k', 'M58,-214 C78,-222 102,-210 106,-188 L104,-156 L78,-150 L64,-176 Z'],
          ['l', 'M70,-196 L100,-190'],
        ],
      },
      {
        pivot: [90, -128],
        parts: [
          ['j', circ(90, -128, 10)],
          ['k', 'M70,-132 L110,-132 L116,-80 L106,-64 L76,-64 L66,-80 Z'],
          ['k', 'M72,-66 L108,-66 L110,-46 L102,-32 L78,-32 L70,-46 Z'],
          ['l', 'M76,-120 L106,-120 M74,-106 L108,-106 M80,-50 L80,-34 M90,-52 L90,-33 M100,-50 L100,-34'],
        ],
      },
    ],
    armExtra: { mirror: [[], [['k', 'M98,-56 L92,-56 L88,10 L91,16 L94,10 Z M86,-58 L80,-58 L78,4 L81,10 L84,4 Z']]] },
    hull: [
      ['k', 'M-32,-124 L32,-124 L38,-96 L26,-84 L-26,-84 L-38,-96 Z', undefined, -4, 60],
      [
        'k',
        'M-60,-210 C-40,-228 40,-228 60,-210 L80,-180 L82,-150 L66,-126 L30,-114 L-30,-114 L-66,-126 L-82,-150 L-80,-180 Z',
        undefined,
        0,
        90,
      ],
      ['k', 'M18,-222 L46,-220 L46,-206 L18,-208 Z', undefined, -14, 40],
      ['k', 'M-20,-196 L20,-196 L26,-180 L20,-162 L-20,-162 L-26,-180 Z', undefined, 38, 26],
    ],
    detail: [
      ['l', 'M-24,-108 L24,-108 M0,-122 L0,-86'],
      ['l', 'M-44,-150 L44,-150 M-50,-138 L50,-138 M-30,-126 L30,-126 M-62,-200 L-36,-206 M62,-200 L36,-206'],
      ['p', 'M-15,-181 L15,-181', 3],
    ],
  },
  // 2: the biggest outline. A flat deck on long legs, crane arms with clamps, a container on top, a tow ring.
  behemoth: {
    height: 298,
    depth: 150,
    limb: 52,
    leg: [
      {
        pivot: [45, -188],
        parts: [
          ['rod', 'M48,-176 L52,-120', 4],
          ['r', 'M30,-198 L58,-198 L56,-176 L32,-176 Z'],
          ['k', 'M22,-182 L68,-182 L72,-120 L28,-118 Z'],
          ['l', 'M28,-156 L70,-156'],
        ],
      },
      {
        pivot: [48, -112],
        parts: [
          ['j', circ(50, -36, 11)],
          ['k', 'M26,-102 L72,-102 L70,-34 L30,-34 Z'],
          ['k', 'M18,-134 L76,-130 L80,-100 L62,-88 L24,-94 Z'],
          ['l', 'M30,-70 L70,-70 M30,-56 L70,-56'],
        ],
      },
      {
        pivot: [50, -36],
        parts: [
          ['k', 'M12,-40 L86,-40 L98,-10 L102,0 L4,0 L8,-12 Z'],
          ['l', 'M30,-10 L30,0 M50,-10 L50,0 M72,-10 L72,0'],
        ],
      },
    ],
    arm: [
      {
        pivot: [122, -226],
        parts: [
          ['rod', 'M124,-226 L154,-150', 5],
          ['k', 'M110,-244 L136,-240 L138,-208 L112,-204 Z'],
          ['k', 'M116,-222 L144,-226 L166,-158 L140,-148 Z'],
        ],
      },
      {
        pivot: [152, -155],
        parts: [
          ['k', 'M136,-148 L168,-148 L164,-74 L134,-74 Z'],
          ['k', 'M136,-172 L170,-166 L172,-138 L142,-134 Z'],
          ['l', 'M138,-120 L165,-120 M137,-100 L165,-100'],
        ],
      },
      {
        pivot: [150, -76],
        parts: [
          ['j', circ(150, -76, 9)],
          ['k', 'M124,-78 L176,-78 L182,-50 L170,-18 L160,-46 L140,-46 L130,-18 L118,-50 Z'],
        ],
      },
    ],
    hull: [
      ['k', 'M-6,-182 L6,-182 L6,-170 L-6,-170 Z', undefined, 0, 30],
      ['r', 'M-84,-198 L84,-198 L72,-180 L-72,-180 Z', undefined, 0, 120],
      [
        'k',
        'M-82,-292 L-74,-292 L-74,-250 L-82,-250 Z M74,-292 L82,-292 L82,-250 L74,-250 Z M-88,-298 L88,-298 L88,-290 L-88,-290 Z',
        undefined,
        -6,
        104,
      ],
      ['k', 'M-68,-286 L68,-286 L68,-252 L-68,-252 Z', undefined, -6, 96],
      ['k', 'M-112,-252 L112,-252 L120,-238 L120,-208 L108,-196 L-108,-196 L-120,-208 L-120,-238 Z', undefined, 0, 150],
    ],
    detail: [
      ['w', circ(0, -160, 9), 3.5],
      ['l', 'M-50,-282 L-50,-256 M-30,-282 L-30,-256 M-10,-282 L-10,-256 M10,-282 L10,-256 M30,-282 L30,-256 M50,-282 L50,-256'],
      ['l', 'M-112,-228 L112,-228 M-60,-252 L-60,-196 M60,-252 L60,-196'],
      ['p', 'M-24,-244 L24,-244 L28,-232 L-28,-232 Z', 2],
    ],
  },
  // 3: a domed command hull on crouched legs, long arms, a comms mast and a dish; a beacon under the dome.
  tactician: {
    height: 262,
    depth: 96,
    leg: [
      {
        pivot: [24, -118],
        parts: [
          ['j', circ(24, -118, 9)],
          ['rod', 'M30,-118 L46,-76', 4],
          ['k', 'M18,-122 L40,-124 L52,-80 L34,-74 Z'],
        ],
      },
      {
        pivot: [46, -76],
        parts: [
          ['j', circ(40, -25, 7)],
          ['k', 'M38,-68 L56,-68 L48,-24 L32,-24 Z'],
          ['k', 'M32,-92 L56,-90 L60,-66 L40,-60 Z'],
        ],
      },
      // A flat, splayed foot, as the others'.
      {
        pivot: [40, -25],
        parts: [
          ['k', 'M16,-26 L60,-26 L68,-10 L74,0 L8,0 L12,-10 Z'],
          ['l', 'M28,-8 L28,0 M44,-8 L44,0 M60,-8 L60,0'],
        ],
      },
    ],
    arm: [
      {
        pivot: [58, -180],
        parts: [
          ['r', 'M56,-168 L70,-168 L74,-130 L60,-128 Z'],
          ['k', 'M44,-198 L66,-192 L72,-166 L50,-160 Z'],
        ],
      },
      {
        pivot: [67, -128],
        parts: [
          ['j', circ(67, -128, 7)],
          ['k', 'M58,-132 L78,-132 L80,-82 L62,-82 Z'],
          ['k', 'M64,-84 L78,-84 L78,-70 L74,-62 L66,-62 L64,-70 Z'],
          ['l', 'M60,-110 L79,-110'],
        ],
      },
    ],
    hull: [
      ['k', 'M-36,-152 L36,-152 L28,-120 L-28,-120 Z', undefined, 0, 64],
      ['k', 'M-26,-124 L26,-124 L20,-102 L0,-94 L-20,-102 Z', undefined, 10, 40],
    ],
    round: [['k', 'M-52,-172 C-52,-212 -26,-226 0,-226 C26,-226 52,-212 52,-172 L44,-148 L-44,-148 Z']],
    detail: [
      ['l', 'M-48,-186 L48,-186 M-44,-160 L44,-160'],
      ['p', 'M-14,-204 L14,-204 L16,-194 L-16,-194 Z', 2.4],
      ['p', circ(0, -138, 7), 2],
      ['pf', circ(0, -138, 2.5)],
    ],
    top: [
      [
        'k',
        'M-62,-262 L-58,-262 L-58,-196 L-62,-196 Z M-70,-250 L-50,-250 L-50,-246 L-70,-246 Z M-68,-236 L-52,-236 L-52,-232 L-68,-232 Z M-66,-204 L-54,-204 L-54,-192 L-66,-192 Z',
      ],
      ['k', 'M54,-206 L60,-206 L60,-194 L54,-194 Z'],
      ['k', 'M40,-206 Q62,-242 100,-222 L94,-214 Q66,-230 48,-200 Z'],
    ],
  },
  // 4: the standard frame, upright and boxy on straight legs: a missile box and a long gun.
  chameleon: {
    height: 248,
    depth: 68,
    leg: [
      {
        pivot: [28, -118],
        parts: [
          ['j', circ(28, -118, 9)],
          ['rod', 'M38,-110 L40,-76', 4],
          ['k', 'M16,-120 L40,-120 L42,-76 L18,-76 Z'],
        ],
      },
      {
        pivot: [30, -72],
        parts: [
          ['j', circ(30, -19, 7)],
          ['k', 'M18,-64 L42,-64 L42,-18 L20,-18 Z'],
          ['k', 'M14,-86 L44,-86 L46,-66 L30,-58 L14,-66 Z'],
          ['l', 'M20,-40 L42,-40'],
        ],
      },
      { pivot: [30, -19], parts: [['k', 'M8,-20 L50,-20 L56,-6 L58,0 L4,0 L6,-8 Z']] },
    ],
    arm: [
      {
        pivot: [64, -196],
        parts: [
          ['r', 'M60,-184 L74,-184 L74,-148 L60,-148 Z'],
          ['k', 'M52,-212 L76,-208 L78,-180 L54,-176 Z'],
        ],
      },
      {
        pivot: [67, -148],
        parts: [
          ['j', circ(67, -148, 7)],
          ['k', 'M54,-152 L80,-152 L80,-98 L56,-98 Z'],
          ['k', 'M58,-100 L78,-100 L76,-84 L60,-84 Z'],
          ['l', 'M56,-136 L80,-136 M56,-122 L80,-122'],
        ],
      },
    ],
    armExtra: {
      plain: [
        [],
        [
          ['k', 'M52,-134 L90,-134 L92,-100 L54,-100 Z'],
          ['k', 'M66,-102 L76,-102 L76,-36 L66,-36 Z'],
          ['k', 'M63,-38 L79,-38 L79,-28 L63,-28 Z'],
          ['l', 'M58,-122 L86,-122'],
        ],
      ],
      mirror: [[], [['w', circ(67, -112, 5), 1.8]]],
    },
    hull: [
      ['k', 'M-34,-134 L34,-134 L30,-112 L-30,-112 Z', undefined, -4, 44],
      ['k', 'M-50,-214 L50,-214 L56,-202 L56,-142 L44,-128 L-44,-128 L-56,-142 L-56,-202 Z', undefined, 0, 68],
      ['k', 'M-40,-228 L-14,-228 L-12,-214 L-42,-214 Z', undefined, 8, 34],
      ['k', 'M6,-248 L54,-248 L54,-214 L6,-214 Z', undefined, 0, 68],
    ],
    detail: [
      ['l', 'M-50,-190 L50,-190 M-50,-160 L50,-160 M0,-214 L0,-190 M-30,-176 L-12,-176'],
      ['p', 'M-36,-221 L-18,-221', 2.4],
      ['pf', [18, 30, 42].flatMap((x) => [circ(x, -239, 5), circ(x, -224, 5)]).join(' ')],
    ],
  },
  // 5: a lean armoured trooper, T-visor helmet, a long scoped rifle held across the body.
  sniper: {
    height: 238,
    depth: 70,
    leg: [
      {
        pivot: [22, -112],
        parts: [
          ['j', circ(22, -112, 9)],
          ['k', 'M10,-118 L34,-118 L38,-74 L18,-70 Z'],
          ['k', 'M18,-120 L34,-116 L36,-90 L22,-94 Z'],
        ],
      },
      {
        pivot: [28, -68],
        parts: [
          ['j', circ(28, -22, 7)],
          ['k', 'M16,-62 L38,-62 L36,-20 L20,-20 Z'],
          ['k', 'M36,-58 L46,-50 L40,-24 L36,-24 Z'],
          ['k', 'M14,-84 L40,-82 L42,-60 L28,-52 L14,-60 Z'],
          ['l', 'M18,-40 L36,-40'],
        ],
      },
      {
        pivot: [28, -22],
        parts: [
          ['k', 'M8,-24 L44,-24 L52,-8 L54,0 L4,0 L6,-10 Z'],
          ['l', 'M22,-8 L22,0 M38,-8 L38,0'],
        ],
      },
    ],
    arm: [
      {
        pivot: [50, -190],
        parts: [
          ['r', 'M48,-180 L62,-180 L62,-150 L48,-150 Z'],
          ['j', circ(55, -148, 8)],
          ['k', 'M36,-214 L62,-208 L68,-184 L52,-174 L38,-186 Z'],
          ['l', 'M44,-200 L62,-196'],
        ],
      },
    ],
    hull: [
      ['k', 'M-24,-128 L24,-128 L28,-108 L16,-98 L-16,-98 L-28,-108 Z', undefined, 0, 46],
      ['r', 'M-18,-144 L18,-144 L16,-126 L-16,-126 Z', undefined, 0, 36],
      ['k', 'M-40,-206 L40,-206 L50,-190 L44,-160 L22,-140 L-22,-140 L-44,-160 L-50,-190 Z', undefined, 0, 70],
      ['r', 'M-18,-210 L18,-210 L16,-200 L-16,-200 Z', undefined, 0, 34],
    ],
    round: [['k', 'M-14,-224 C-14,-238 14,-238 14,-224 L16,-210 L8,-202 L-8,-202 L-16,-210 Z']],
    detail: [
      ['l', 'M-32,-188 L0,-176 L32,-188 M-28,-160 L28,-160 M0,-176 L0,-142'],
      ['p', 'M-9,-219 L9,-219 M0,-219 L0,-208', 2.5],
    ],
    held: {
      pivot: [0, -158],
      frame: 'translate(0,-160) rotate(-130) scale(1,-1)',
      gun: [
        ['gun', 'M-80,-6 L-50,-9 L-46,8 L-76,12 Z M-28,6 L-20,6 L-24,22 L-32,22 Z M-6,6 L8,6 L6,24 L-4,24 Z'],
        ['gun', 'M-50,-10 L30,-10 L34,6 L-50,8 Z M-30,-23 L16,-23 L16,-12 L-30,-12 Z M16,-25 L23,-25 L23,-10 L16,-10 Z'],
        ['gun', 'M30,-8 L100,-8 L100,4 L30,4 Z M100,-5 L160,-5 L160,1 L100,1 Z M160,-8 L172,-8 L172,4 L160,4 Z'],
        ['p', 'M-40,-2 L24,-2 M40,-2 L94,-2', 1.2],
      ],
      hands: [
        ['k', 'M50,-156 L62,-142 L20,-134 L14,-148 Z M6,-152 L20,-152 L20,-136 L6,-136 Z'],
        ['k', 'M-62,-150 L-48,-144 L-30,-200 L-42,-206 Z M-46,-214 L-30,-210 L-32,-196 L-46,-200 Z'],
      ],
      reach: [
        { elbow: [55, -148], hand: [13, -144] },
        { elbow: [-55, -147], hand: [-38, -205] },
      ],
      muzzle: [172, -2],
    },
  },
  // 6: a sensor dome on four tall spindly legs, splayed forward and back.
  wisp: {
    height: 138,
    depth: 60,
    limb: 10,
    scale: 1.2,
    splay: [42, -42],
    // One plane, one thickness, knee to foot: the joints line up.
    legShape: [
      { z: 0, t: 1 },
      { z: 0, t: 1 },
      { z: 0, t: 1.6 },
    ],
    leg: [
      {
        pivot: [27, -76],
        parts: [['k', 'M24,-80 L52,-100 L63,-100 L30,-72 Z']],
      },
      {
        pivot: [57, -100],
        parts: [
          ['j', circ(57, -100, 6)],
          ['k', 'M52,-100 L63,-100 L61,-8 L53,-8 Z'],
          ['l', 'M52,-60 L62,-60'],
        ],
      },
      { pivot: [57, -9], parts: [['k', 'M44,-10 L70,-10 L74,0 L40,0 Z']] },
    ],
    arm: [],
    hull: [['r', 'M-18,-74 L18,-74 L12,-62 L-12,-62 Z']],
    round: [['k', 'M-34,-84 C-34,-110 -18,-120 0,-120 C18,-120 34,-110 34,-84 L28,-72 L-28,-72 Z']],
    detail: [
      ['l', 'M-32,-94 L32,-94'],
      ['p', circ(0, -84, 6), 2],
      ['pf', circ(0, -84, 2.5)],
    ],
  },
};
