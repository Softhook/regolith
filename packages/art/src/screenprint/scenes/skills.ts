/** The Regolith Skills' screenprint scenes (scenes.ts). */
import { icon } from '../../icons';
import { n } from '../../svg';
import { INKS, ON_NIGHT, ON_PAPER, mono } from '../inks';
import {
  GROUND,
  flash,
  ht,
  label,
  land,
  mech,
  paperGround,
  person,
  plated,
  print,
  rays,
  rect,
  rings,
  sky,
  smoke,
  sparks,
  stencil,
  storm,
  type Stage,
} from '../kit';
import { outdoors, path, stroke, sideInk, wreck, glove, flag, hexOnGround, dropping } from './props';
import type { SpScene } from '../scenes';

export const SKILL_SCENES: Record<string, SpScene> = {
  'r-tune-up': {
    world: 'deimos',
    caption: "a mechanic on a step ladder, a wrench on a Wisp's knee joint, sparks flying",
    draw: (s) =>
      paperGround(s) +
      rays(36, 16, 26, s.plate) +
      land(s, 36, { rims: false }) +
      mech(s, 'wisp', 24, 39, 0.19, { yaw: -28 }) +
      // the step ladder, the mechanic on it, the wrench on the knee
      stroke('M44,39 L48,22 M52,39 L48,22 M45.2,34 L50.8,34 M46.4,29 L49.6,29', s.key, 0.7) +
      `<g transform="rotate(16 37 15.6)">${rect(37, 14.4, 9, 2.4, s.key)}</g>` +
      person(48, 29, 0.2, { facing: -1, arms: [124, 112], elbows: [-10, -6], lean: -6, legs: [6, -6] }, s.key, s.paper) +
      sparks(s.r, 37, 15.6, 16, 8) +
      flash(37, 15.6, 2, 8),
  },

  'r-final-push': {
    world: 'mars',
    caption: 'a Breacher pushed past its limit',
    draw: (s) =>
      paperGround(s) +
      rays(30, 14, 30, s.plate, 180, 360) +
      land(s, 34) +
      mech(s, 'breacher', 30, 36, 0.12, {
        yaw: -32,
        lean: 10,
        legs: { plus: [-20, 26], minus: [18, 8] },
        arms: { plus: [-30, -20], minus: [26, 10] },
      }),
  },
  'r-science-survey': {
    world: 'phobos',
    caption: 'a radar station on the surface, its dish on the roof, its pulses going down through the strata',
    draw: (s) => {
      const g = GROUND[s.world];
      // the ground cut away under the station: strata, and the pulses going down through them
      let strata = '';
      for (let i = 0; i < 4; i++) {
        const y = 21 + i * 5;
        strata += stroke(`M-3,${n(y)} q8,${n(-1 + (i % 2) * 2)} 16,0 t16,0 t16,0 t16,0 t16,0`, g.shade, 0.5, ' opacity="0.8"');
      }
      return (
        paperGround(s) +
        sky(s, { planet: { x: 54, y: 6, r: 6 } }) +
        land(s, 16, { marks: false }) +
        rect(-3, 17.5, 70, 28, ht(s, 'shade'), ' opacity="0.6"') +
        strata +
        rings(26, 16.5, 3, 4, 6, INKS.amber, 0.6, 20, 160) +
        print(s, 'containers', 9, 16.5, { size: 0.08 }) +
        print(s, 'workshop', 26, 16.5, { size: 0.12 }) +
        print(s, 'dish', 21, 9.4, { size: 0.08 }) +
        print(s, 'mast', 41, 16.5, { size: 0.1 })
      );
    },
  },
  'r-paired-cannons': {
    world: 'deimos',
    caption: 'a Breacher front on, firing both fists at the viewer, two muzzle flashes',
    draw: (s) =>
      paperGround(s) +
      rays(32, 20, 32, s.plate) +
      land(s, 36, { rims: false }) +
      mech(s, 'breacher', 32, 40, 0.13, { arms: { plus: [-16, -10], minus: [16, 10] } }) +
      flash(14, 31.5, 4.2, 10) +
      flash(50, 31.5, 4.2, 10, 12) +
      sparks(s.r, 14, 31.5, 12, 10) +
      sparks(s.r, 50, 31.5, 12, 10),
  },
  'r-remodel': {
    world: 'phobos',
    caption: 'the salvage yard crane lowering one chassis beside a wreck',
    draw: (s) =>
      outdoors(s, 32, { planet: { x: 14, y: 9, r: 7 } }) +
      print(s, 'rocks', 12, 36, { size: 0.16, plate: GROUND.phobos.shade }) +
      wreck(s, 'tactician', 28, 34, 0.08, -78) +
      print(s, 'crane', 54, 34, { size: 0.16, flip: true }) +
      stroke('M41.2,14.8 L41.2,22', s.key, 0.4) +
      stroke('M40,22 q1.2,2 2.4,0', s.key, 0.6) +
      mech(s, 'chameleon', 41, 32, 0.045, { yaw: -25 }, { plate: INKS.oxide }),
  },
  'r-engineering': {
    world: 'mars',
    caption: 'a Chameleon in a gantry, one arm off and hanging from the hoist beside its open shoulder',
    draw: (s) =>
      outdoors(s, 36, { planet: { x: 54, y: 8, r: 8 } }) +
      print(s, 'gantry', 32, 38, { size: 0.24 }) +
      mech(s, 'chameleon', 28, 38, 0.115, { detach: { arm: 'plus', show: 'mech' } }) +
      stroke('M42.4,5.6 L42.4,16', s.key, 0.35, ' stroke-dasharray="0.6 0.4"') +
      mech(s, 'chameleon', 35, 38.5, 0.115, { detach: { arm: 'plus', show: 'arm' } }) +
      sparks(s.r, 35.4, 15.5, 10, 5),
  },
  'r-stand-down': {
    world: 'phobos',
    caption: 'a Chameleon powered down in a low crouch, a radar dish beside it sweeping the sky',
    draw: (s) =>
      outdoors(s, 32, { planet: { x: 34, y: 8, r: 6 } }) +
      smoke(s, 18, 14, 10, GROUND.phobos.light) +
      mech(s, 'chameleon', 18, 40, 0.12, {
        yaw: -12,
        legs: { plus: [-34, 62], minus: [34, -62] },
        arms: { plus: [4, 0], minus: [-4, 0] },
      }) +
      // the dish: its sweep fanning out from the feed
      `<path d="M51.4,15.4 L38,-4 L64,-4 Z" fill="${INKS.amber}" opacity="0.22"/>` +
      rings(51.4, 15.4, 3, 3, 5, INKS.amber, 0.6, 235, 305) +
      print(s, 'dish', 48, 34, { size: 0.3 }),
  },
  'r-boost': {
    world: 'deimos',
    caption: 'a Tactician with its ability pulsing out twice, dotted rings to its left and right',
    draw: (s) => {
      // dotted arcs, one set each side: the ability used a second time
      const pulse = (from: number, to: number) =>
        [7, 12, 17, 22, 27, 32]
          .map((r, i) => {
            const a1 = (from * Math.PI) / 180;
            const a2 = (to * Math.PI) / 180;
            return `<path d="M${n(32 + Math.cos(a1) * r)},${n(24 + Math.sin(a1) * r)} A${r},${r} 0 0,1 ${n(32 + Math.cos(a2) * r)},${n(24 + Math.sin(a2) * r)}" fill="none" stroke="${INKS.ice}" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="0.01 2.6" opacity="${n(1 - i * 0.1)}"/>`;
          })
          .join('');
      return (
        outdoors(s, 36, { planet: { x: 54, y: 8, r: 6 } }) +
        pulse(140, 220) +
        pulse(-40, 40) +
        mech(s, 'tactician', 32, 39, 0.1, { yaw: 20 })
      );
    },
  },
  'r-prospectors': {
    world: 'phobos',
    caption: 'a Wisp working a core drill on its tripod over cracked ice',
    draw: (s) =>
      outdoors(s, 30) +
      `<ellipse cx="26" cy="38" rx="22" ry="3.4" fill="${INKS.ice}"/>` +
      stroke('M26,38 l-6,1.5 l-5,-0.6 M26,38 l4,2 l7,0.4 M26,38 l2,-1.6 l8,-0.8', s.key, 0.35) +
      // the tripod, its drill string and motor, a core coming up
      stroke('M26,14 L17,39 M26,14 L35,39 M26,14 L27,40', s.key, 0.8) +
      rect(25.3, 14, 1.4, 24, s.key) +
      rect(22.6, 18, 6.8, 4.4, s.plate, ` stroke="${s.key}" stroke-width="0.5"`) +
      `<circle cx="26" cy="13.6" r="1.4" fill="${INKS.amber}"/>` +
      rect(9, 34.6, 8, 1.6, INKS.ice, ` stroke="${s.key}" stroke-width="0.35"`) +
      mech(s, 'wisp', 49, 40, 0.13, { yaw: 42 }),
  },
  'r-unstable-reactor': {
    world: 'mars',
    caption: 'a Breacher with charges strapped across its chest',
    draw: (s) => {
      const charges = [-30, -10, 10, 30]
        .map(
          (x) =>
            `<rect x="${x - 7}" y="-152" width="14" height="20" fill="${INKS.amber}" stroke="${s.key}" stroke-width="1.4"/><path d="M${x - 7},-142 h14" stroke="${s.key}" stroke-width="1.2"/>`,
        )
        .join('');
      // diagonal stripes behind it, like a hazard board
      let stripes = '';
      for (let x = -48; x < 72; x += 10) stripes += path(`M${x},-4 l5,0 l46,46 l-5,0 Z`, s.plate);
      return (
        paperGround(s) +
        stripes +
        land(s, 38, { rims: false }) +
        mech(s, 'breacher', 32, 44, 0.165, { arms: { plus: [10, -10], minus: [10, -10] } }) +
        `<g transform="translate(32,44) scale(0.165)">${charges}</g>`
      );
    },
  },
  'r-sneak': {
    world: 'deimos',
    caption: 'a Wisp ducking between an enemy Behemoth’s legs',
    draw: (s) =>
      outdoors(s, 36, { planet: { x: 32, y: 10, r: 7 } }) +
      mech(s, 'behemoth', 31, 44, 0.38, { yaw: 12, legs: { plus: [-14, 20], minus: [18, -14] } }, { plate: INKS.oxide }) +
      mech(s, 'wisp', 30.5, 40.5, 0.08, { yaw: -40, legs: { plus: [24, -24], minus: [-24, 24] } }, { ink: ON_NIGHT }) +
      stroke('M34,39 l5,0 M33,41 l6,0', s.key, 0.45, ' opacity="0.6"'),
  },
  'r-armour-piercing': {
    world: 'mars',
    caption: 'a Chameleon firing its long gun level, the barrel red hot, a round leaving it',
    draw: (s) =>
      paperGround(s) +
      rays(42, 19.6, 26, s.plate, 120, 240) +
      land(s, 34) +
      mech(s, 'chameleon', 18, 38, 0.12, { arms: { plus: [-10, -80] } }) +
      rect(30, 18.4, 11, 2.4, ht(s, 'plate')) +
      flash(42, 19.6, 4, 11) +
      stroke('M46,19.6 L66,19.6', INKS.amber, 0.7, ' stroke-dasharray="3 1.4"'),
  },

  'r-field-refit': {
    world: 'phobos',
    caption: "a repair arm on its floor mount welding at a Tactician's hip joint",
    draw: (s) => {
      const joint = (x: number, y: number, r: number) =>
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${s.key}"/><circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="${s.plate}"/>`;
      return (
        outdoors(s, 34, { planet: { x: 12, y: 8, r: 8 } }) +
        mech(s, 'tactician', 22, 40, 0.11, { yaw: 24 }) +
        // the arm: a floor mount, two booms with their hydraulics, a welding head at the hip
        plated(s, (ink) => rect(48, 36.4, 12, 3.6, ink) + rect(51, 32, 6, 4.6, ink)) +
        stroke('M54,32 L49,14', s.key, 3) +
        stroke('M56,31 L51.6,17', s.ink.rod, 0.6) +
        stroke('M49,14 L36,24', s.key, 2.4) +
        stroke('M47,17 L38.6,23', s.ink.rod, 0.5) +
        joint(54, 32, 2.4) +
        joint(49, 14, 2) +
        `<g transform="rotate(38 36 24)">${rect(32, 22.8, 5, 2.4, s.key)}${rect(30.4, 23.4, 1.8, 1.2, INKS.amber)}</g>`
      );
    },
  },

  'r-breakthrough': {
    world: 'mars',
    caption: 'a Chameleon striding on past a smoking wreck, already turning to the next target',
    draw: (s) =>
      outdoors(s, 32, { planet: { x: 54, y: 8, r: 7 } }) +
      smoke(s, 9, 37, 30, GROUND.mars.shade) +
      wreck(s, 'tactician', 8, 39, 0.07, 84, false) +
      mech(s, 'chameleon', 34, 40, 0.115, { yaw: 34, legs: { plus: [-26, 36], minus: [24, 6] }, arms: { plus: [-60, -24] }, lean: -4 }),
  },
  'r-free-drop': {
    world: 'deimos',
    caption: 'two mechs coming down side by side on their booster flames',
    draw: (s) =>
      outdoors(s, 37, { planet: { x: 54, y: 8, r: 7 } }) +
      // face on, standing straight
      dropping(s, 'breacher', 19, 24, 0.075, 0, {}) +
      dropping(s, 'chameleon', 44, 19, 0.075, 0, {}),
  },
  'r-hacking': {
    world: 'mars',
    caption: "a hand terminal spliced into an objective's panel, its 8 flickering to 7 and 9",
    draw: (s) =>
      paperGround(s) +
      rect(6, 4, 40, 34, s.key) +
      rect(10, 8, 32, 20, s.ink.recess) +
      stencil('7', 18, 24, 15, INKS.oxide) +
      stencil('9', 34, 24, 15, INKS.ice) +
      stencil('8', 26.4, 24.6, 16, INKS.amber) +
      rect(10, 8, 32, 20, ht(s, 'key'), ' opacity="0.4"') +
      [12, 18, 24, 30].map((x) => rect(x, 31, 4, 3, s.ink.seam)).join('') +
      stroke('M44,30 C52,30 50,38 56,36', INKS.oxide, 1) +
      stroke('M44,33 C50,34 48,40 56,38', INKS.amber, 0.8) +
      `<g transform="rotate(-14 57 30)">${rect(52, 22, 11, 17, s.key)}${rect(53.5, 24, 8, 7, INKS.ice)}${label('ACCESS', 57.5, 28.2, 1.2, s.key)}${[33, 35.5].map((y) => rect(53.5, y, 8, 1.4, s.ink.seam)).join('')}</g>` +
      glove(60, 44, 9, -20, s.key),
  },
  'r-strategic-plan': {
    world: 'phobos',
    caption: 'two mechanical robot claws holding a creased hex map of mech battle movements out in the field',
    draw: (s) => {
      const bg = outdoors(s, 20, { planet: { x: 50, y: 7, r: 6 } });
      const mw = 48;
      const mh = 30;
      const mx = (63.5 - mw) / 2;
      const my = 6.0;

      const mapStage: Stage = {
        ...s,
        dark: false,
        paper: INKS.bone,
        key: INKS.key,
        ink: ON_PAPER,
      };

      const R = 4.1;
      const SQ = 0.88;
      const ROW = Math.sqrt(3) * R * SQ;
      const cell = (col: number, row: number): [number, number] => [mx + 3.8 + col * 1.5 * R, my + 4.2 + row * ROW + (col % 2) * (ROW / 2)];

      let grid = '';
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 7; col++) {
          grid += hexOnGround(...cell(col, row), R, SQ, INKS.grey, 0.3);
        }
      }

      const dot = ([x, y]: [number, number], ink: string) =>
        `<circle cx="${n(x)}" cy="${n(y)}" r="0.85" fill="none" stroke="${ink}" stroke-width="0.55"/>`;

      const arrow = (from: [number, number], to: [number, number], bow: number, ink: string) => {
        const [x1, y1] = [from[0], from[1] - 1.3];
        const [mx1, my1] = [(x1 + to[0]) / 2, (y1 + to[1]) / 2];
        const len = Math.hypot(to[0] - x1, to[1] - y1);
        const [cx, cy] = [mx1 + ((to[1] - y1) / len) * bow, my1 - ((to[0] - x1) / len) * bow];
        const dl = Math.hypot(to[0] - cx, to[1] - cy);
        const [ux, uy] = [(to[0] - cx) / dl, (to[1] - cy) / dl];
        const [ex, ey] = [to[0] - ux * 1.3, to[1] - uy * 1.3];
        const [bx, by] = [ex - ux * 1.7, ey - uy * 1.7];
        return (
          stroke(`M${n(x1 + ux * 2)},${n(y1 + uy * 2)} Q${n(cx)},${n(cy)} ${n(bx)},${n(by)}`, ink, 0.55, ' stroke-dasharray="1.1 0.7"') +
          path(`M${n(ex)},${n(ey)} L${n(bx - uy * 0.95)},${n(by + ux * 0.95)} L${n(bx + uy * 0.95)},${n(by - ux * 0.95)} Z`, ink)
        );
      };

      const at = (kind: Parameters<typeof mech>[1], [x, y]: [number, number], size: number, o: Parameters<typeof mech>[6] = {}) =>
        mech(mapStage, kind, x, y + 1.9, size, {}, o);

      const clipId = `${s.id}-map-sheet`;
      const dogEar = 2.4;
      const paperOutline =
        `M${n(mx)},${n(my)} ` +
        `L${n(mx + mw - dogEar)},${n(my)} ` +
        `L${n(mx + mw)},${n(my + dogEar)} ` +
        `L${n(mx + mw)},${n(my + mh)} ` +
        `L${n(mx)},${n(my + mh)} Z`;

      const dogEarFlap =
        `<path d="M${n(mx + mw - dogEar)},${n(my)} L${n(mx + mw - dogEar)},${n(my + dogEar)} L${n(mx + mw)},${n(my + dogEar)} Z" fill="${ON_NIGHT.recess}"/>` +
        `<path d="M${n(mx + mw - dogEar)},${n(my)} L${n(mx + mw)},${n(my + dogEar)}" stroke="${ON_NIGHT.seam}" stroke-width="0.3"/>`;

      const mapBody =
        `<path d="${paperOutline}" fill="${INKS.key}" opacity="0.65" transform="translate(0.8, 1.2)"/>` +
        `<path d="${paperOutline}" fill="${INKS.bone}"/>` +
        `<clipPath id="${clipId}"><path d="${paperOutline}"/></clipPath>` +
        `<g clip-path="url(#${clipId})">` +
        grid +
        arrow(cell(1, 1), cell(3, 1), -2.2, INKS.key) +
        arrow(cell(1, 3), cell(4, 2), 2.5, INKS.key) +
        arrow(cell(2, 0), cell(4, 0), 0, INKS.key) +
        stroke(`M${n(cell(5, 1)[0] - 3)},${n(cell(5, 1)[1] - 1)} L${n(cell(3, 1)[0] + 2)},${n(cell(3, 1)[1])}`, INKS.oxide, 0.45) +
        stroke(`M${n(cell(5, 3)[0] - 3)},${n(cell(5, 3)[1] - 1)} L${n(cell(4, 2)[0] + 2)},${n(cell(4, 2)[1])}`, INKS.oxide, 0.45) +
        dot(cell(3, 1), INKS.key) +
        dot(cell(4, 2), INKS.key) +
        dot(cell(4, 0), INKS.key) +
        `<path d="M${n(cell(4, 2)[0])},${n(cell(4, 2)[1] - 1.8)} l1.2,1.2 l-1.2,1.2 l-1.2,-1.2 Z" fill="none" stroke="${INKS.amber}" stroke-width="0.45"/>` +
        at('breacher', cell(1, 1), 0.026) +
        at('sniper', cell(1, 3), 0.024) +
        at('tactician', cell(2, 0), 0.024) +
        at('behemoth', cell(5, 1), 0.024, { ink: mono(INKS.oxide) }) +
        at('chameleon', cell(5, 3), 0.024, { ink: mono(INKS.oxide) }) +
        label('PLAN B', mx + 3.0, my + 3.0, 1.3, INKS.key, 'start') +
        label('SEC-04', mx + mw - 4.5, my + 3.0, 1.0, ON_PAPER.gun, 'end') +
        `</g>` +
        stroke(`M${mx},${my + mh * 0.5} h${mw}`, INKS.paper, 0.4) +
        stroke(`M${mx},${my + mh * 0.5 + 0.25} h${mw}`, INKS.bone, 0.25) +
        stroke(`M${mx + mw * 0.5},${my} v${mh}`, INKS.paper, 0.4) +
        stroke(`M${mx + mw * 0.5 + 0.25},${my} v${mh}`, INKS.bone, 0.25) +
        `<path d="${paperOutline}" fill="none" stroke="${ON_NIGHT.side}" stroke-width="0.35"/>` +
        dogEarFlap;

      const gripY = my + mh - 6.5;

      const renderSide = (isRight: boolean) => {
        const edgeX = isRight ? mx + mw : mx;
        const sign = isRight ? -1 : 1;
        const armBaseX = isRight ? 65.5 : -2.0;

        const wristX = edgeX - sign * 3.5;
        const wristY = gripY + 4.8;

        const arm =
          `<path d="M${n(armBaseX - sign * 4.2)},44 L${n(wristX - sign * 2.5)},${n(wristY + 1.2)} L${n(wristX + sign * 1.8)},${n(wristY - 1.0)} L${n(armBaseX + sign * 5.0)},44 Z" fill="${INKS.key}"/>` +
          `<path d="M${n(armBaseX - sign * 1.8)},44 L${n(wristX - sign * 1.6)},${n(wristY + 0.8)} L${n(wristX + sign * 0.8)},${n(wristY - 0.4)} L${n(armBaseX + sign * 3.2)},44 Z" fill="${s.key}"/>` +
          stroke(`M${n(armBaseX + sign * 0.8)},43 L${n(wristX - sign * 0.2)},${n(wristY + 0.2)}`, INKS.oxide, 0.7) +
          stroke(`M${n(armBaseX - sign * 2.2)},43 L${n(wristX - sign * 1.6)},${n(wristY + 1.0)}`, s.ink.seam, 0.35);

        const tilt = isRight ? -22 : 22;
        const wrist =
          `<g transform="translate(${n(wristX)},${n(wristY)}) rotate(${tilt})">` +
          `<polygon points="-2.6,-1.8 2.6,-1.8 3.2,1.8 -3.2,1.8" fill="${INKS.night}" stroke="${s.ink.seam}" stroke-width="0.3"/>` +
          `<rect x="-2.2" y="-0.5" width="4.4" height="1.0" rx="0.3" fill="${INKS.dust}"/>` +
          `</g>`;

        const claw =
          `<g transform="translate(${n(edgeX)},${n(gripY)}) scale(${sign}, 1) rotate(-10)">` +
          `<path d="M1.5,-4.0 L4.5,-2.8 L4.5,-0.8 L2.0,-1.0 Z" fill="${INKS.key}" opacity="0.3" transform="translate(0.3, 0.5)"/>` +
          `<path d="M1.5,4.0 L4.5,2.8 L4.5,0.8 L2.0,1.0 Z" fill="${INKS.key}" opacity="0.3" transform="translate(0.3, 0.5)"/>` +
          `<polygon points="-4.5,-4.2 -0.8,-4.8 -0.8,4.8 -4.5,4.2 -5.0,0" fill="${INKS.key}" stroke="${s.ink.seam}" stroke-width="0.3"/>` +
          `<polygon points="-4.0,-2.6 -1.6,-3.0 -1.6,3.0 -4.0,2.6" fill="${INKS.oxide}"/>` +
          `<path d="M-1.8,-4.2 L1.8,-5.2 L4.2,-3.8 L4.2,-1.8 L2.0,-1.8 L-0.6,-2.8 Z" fill="${s.key}" stroke="${s.ink.seam}" stroke-width="0.3"/>` +
          `<rect x="2.0" y="-3.4" width="2.2" height="1.6" rx="0.3" fill="${INKS.key}"/>` +
          stroke(`M2.6,-3.4 V-1.8 M3.6,-3.4 V-1.8`, ON_PAPER.recess, 0.25) +
          `<circle cx="-0.8" cy="-3.6" r="0.6" fill="${INKS.dust}" stroke="${INKS.key}" stroke-width="0.25"/>` +
          `<path d="M-1.8,4.2 L1.8,5.2 L4.2,3.8 L4.2,1.8 L2.0,1.8 L-0.6,2.8 Z" fill="${s.key}" stroke="${s.ink.seam}" stroke-width="0.3"/>` +
          `<rect x="2.0" y="1.8" width="2.2" height="1.6" rx="0.3" fill="${INKS.key}"/>` +
          stroke(`M2.6,1.8 V3.4 M3.6,1.8 V3.4`, ON_PAPER.recess, 0.25) +
          `<circle cx="-0.8" cy="3.6" r="0.6" fill="${INKS.dust}" stroke="${INKS.key}" stroke-width="0.25"/>` +
          `<line x1="-0.8" y1="-2.6" x2="-0.8" y2="2.6" stroke="${INKS.amber}" stroke-width="0.65"/>` +
          `<rect x="-1.5" y="-0.8" width="1.4" height="1.6" rx="0.3" fill="${INKS.night}" stroke="${INKS.dust}" stroke-width="0.25"/>` +
          `</g>`;

        return { arm: arm + wrist, claw };
      };

      const left = renderSide(false);
      const right = renderSide(true);

      return bg + left.arm + right.arm + mapBody + left.claw + right.claw;
    },
  },
  'r-science': {
    world: 'mars',
    caption: 'a survey flag with the research flask on it flying over a refinery',
    draw: (s) =>
      outdoors(s, 32, { planet: { x: 12, y: 8, r: 8 } }) +
      print(s, 'refinery', 42, 33, { size: 0.16 }) +
      print(s, 'tanks', 18, 33, { size: 0.12 }) +
      flag(s, 26, 42, 28, s.plate) +
      icon('research', 30.6, 19, 6.5, s.key, 2.6) +
      person(20, 42, 0.22, { facing: 1, arms: [120, 20], elbows: [-10, 10] }, s.key, s.paper),
  },
  'r-exploit': {
    world: 'deimos',
    caption: 'a salvage drone hovering over a wreck, scanning it in amber lines',
    draw: (s) => {
      const drone = `<g transform="translate(38,10)"><ellipse cx="0" cy="0" rx="4.4" ry="2" fill="${s.key}"/><path d="M-4,-1 L-9,-3 M4,-1 L9,-3" stroke="${s.key}" stroke-width="0.6"/><ellipse cx="-9" cy="-3.4" rx="3.6" ry="0.6" fill="${s.key}"/><ellipse cx="9" cy="-3.4" rx="3.6" ry="0.6" fill="${s.key}"/><circle cx="0" cy="1.6" r="1" fill="${INKS.amber}"/></g>`;
      return (
        outdoors(s, 32, { planet: { x: 12, y: 9, r: 8 } }) +
        `<path d="M38,11.6 L22,35 L52,35 Z" fill="${INKS.amber}" opacity="0.25"/>` +
        [24, 30, 36, 42, 48].map((x) => stroke(`M38,11.6 L${x},35`, INKS.amber, 0.25)).join('') +
        wreck(s, 'sniper', 36, 37, 0.06, 80) +
        smoke(s, 44, 34, 10, GROUND.deimos.shade) +
        drone
      );
    },
  },
  'r-rush-research': {
    world: 'phobos',
    caption: 'two surveyors running back to camp with a sample case',
    draw: (s) =>
      outdoors(s, 31, { planet: { x: 14, y: 9, r: 8 } }) +
      print(s, 'habitat', 52, 31, { size: 0.12 }) +
      print(s, 'beacon', 6, 40, { size: 0.12 }) +
      person(22, 41, 0.27, { facing: 1, arms: [60, -50], elbows: [-60, 40], legs: [40, -40], knees: [-50, 30], lean: 18 }, s.key, s.paper) +
      person(34, 40, 0.27, { facing: 1, arms: [-20, -60], elbows: [30, 40], legs: [36, -36], knees: [-40, 30], lean: 18 }, s.key, s.paper) +
      `<g transform="rotate(4 28 31)">${rect(25, 30, 7, 4, INKS.amber)}${rect(27.4, 29.2, 2.2, 1, s.key)}</g>`,
  },
  'r-stolen-flag': {
    world: 'deimos',
    caption: 'a victorious Chameleon holding up a flag over a downed mech',
    draw: (s) =>
      outdoors(s, 34, { planet: { x: 52, y: 9, r: 9 } }) +
      smoke(s, 17, 36, 22, GROUND.deimos.shade) +
      wreck(s, 'tactician', 24, 40, 0.07, -82, false) +
      mech(s, 'chameleon', 40, 41, 0.1, { yaw: -20, arms: { plus: [-100, -40] } }) +
      flag(s, 57.6, 17, 12.5, INKS.ice, '', -1),
  },
  'r-arms-deal': {
    world: 'mars',
    caption: 'a strike beacon on its tripod, the atomic it bought landing on the horizon',
    draw: (s) =>
      outdoors(s, 26, { planet: false }) +
      // the strike: a beam from orbit, its flash and smoke on the horizon
      rect(46, -4, 3, 30, INKS.amber) +
      rect(47, -4, 1, 30, INKS.bone) +
      smoke(s, 47.5, 26, 10, GROUND.mars.shade) +
      flash(47.5, 25, 5, 12) +
      // the beacon on its tripod, calling it down
      stroke('M20,40 L23,28 M26,40 L23,28 M23,40 L23,28', s.key, 0.7) +
      rect(20.6, 22, 4.8, 7, s.key) +
      rect(21.4, 23.2, 3.2, 1.6, INKS.oxide) +
      stroke('M23,22 L23,12', s.key, 0.5) +
      `<circle cx="23" cy="11.4" r="1.4" fill="${INKS.amber}"/>` +
      rings(23, 11.4, 2.6, 2.4, 4, INKS.amber, 0.45, 290, 360),
  },
  'r-drill-sergeant': {
    world: 'phobos',
    caption: 'three Snipers lined up in step on a marked drill ground',
    draw: (s) =>
      outdoors(s, 24, { planet: { x: 54, y: 8, r: 6 } }) +
      // the drill ground: painted lines running back to the horizon
      stroke('M-4,33 L68,33 M-4,39.5 L68,39.5', INKS.bone, 0.5) +
      stroke('M4,44 L17,25 M28,44 L28,25 M52,44 L39,25', INKS.bone, 0.35, ' stroke-dasharray="1.2 0.8"') +
      [10, 28, 46].map((x) => mech(s, 'sniper', x, 38, 0.07, { yaw: -25 })).join('') +
      flag(s, 62, 31, 12, INKS.oxide, '3', -1),
  },
  'r-trophy-hunters': {
    world: 'mars',
    caption: "kill marks stencilled on a mech's hull, a painter adding one more",
    draw: (s) => {
      // the marks on the hull, projected in 3D to match the mech's yaw and pitch
      const [x, y, size] = [24, 66, 0.26];
      const yaw = -20 * (Math.PI / 180);
      const pitch = 14 * (Math.PI / 180);
      const [sy, cy, sp, cp] = [Math.sin(yaw), Math.cos(yaw), Math.sin(pitch), Math.cos(pitch)];
      const z = 34;
      const mat = `${n(cy)},${n(sy * sp)},0,${n(cp)},${n(-z * sy)},${n(z * cy * sp)}`;
      let marks = '';
      for (let i = 0; i < 9; i++) marks += rect(16 + (i % 5) * 3 + (i >= 5 ? 1.5 : 0), 14 + Math.floor(i / 5) * 7, 1.2, 5, INKS.bone);
      const hull =
        stroke('M14,21 L32,14', INKS.bone, 0.9) +
        marks +
        rect(31, 21, 1.2, 5, INKS.oxide) +
        `<circle cx="34" cy="23" r="2.4" fill="${INKS.oxide}" opacity="0.4"/>`;
      return (
        outdoors(s, 40, { planet: false }) +
        mech(s, 'chameleon', x, y, size, { yaw: -20 }) +
        `<g transform="translate(${x},${y}) scale(${n(size)}) matrix(${mat}) scale(2.5) translate(-30.5,-91.5)">${hull}</g>` +
        stroke('M44,42 L50,4 M54,42 L56,4 M45,34 L54,34 M46,26 L55,26 M47,18 L55,18', s.key, 0.8) +
        person(50, 26, 0.18, { facing: -1, arms: [100, 20], elbows: [-10, 10] }, s.key, s.paper)
      );
    },
  },
  'r-recycle': {
    world: 'phobos',
    caption: 'a stripped mech kneeling, one arm off, a crew member carrying its glowing core away',
    draw: (s) =>
      outdoors(s, 34, { planet: { x: 12, y: 8, r: 8 } }) +
      mech(
        s,
        'chameleon',
        22,
        41,
        0.12,
        { lean: 18, legs: { plus: [-60, 110], minus: [60, -110] }, arms: { minus: [10, 0] }, detach: { arm: 'plus', show: 'mech' } },
        { ink: sideInk(s), plate: false },
      ) +
      person(44, 41, 0.26, { facing: 1, arms: [40, 30], elbows: [60, 70], legs: [26, -26], lean: -6 }, s.key, s.paper) +
      `<circle cx="50" cy="30" r="5" fill="${INKS.amber}" opacity="0.3"/>` +
      `<rect x="47.4" y="27.4" width="5.2" height="5.2" rx="0.8" fill="${s.key}"/><rect x="48.4" y="28.4" width="3.2" height="3.2" fill="${INKS.amber}"/>`,
  },
  'r-fanatics': {
    world: 'mars',
    caption: 'a wall stencilled NO RETREAT, its flag on the roof, a Breacher standing in front of it',
    draw: (s) =>
      outdoors(s, 34, { planet: false }) +
      print({ ...s, key: ON_PAPER.joint }, 'wall', 30, 34, { size: 0.36 }) +
      stencil('NO RETREAT', 21, 25, 4.8, INKS.bone) +
      mech(s, 'breacher', 51, 41, 0.085) +
      flag(s, 6, 14.4, 11, INKS.oxide),
  },

  'r-signal-jammer': {
    world: 'deimos',
    caption: "a jammer pod on a Tactician's shoulder, static rings going out",
    draw: (s) =>
      outdoors(s, 38, { planet: false }) +
      rings(22.5, 10, 4, 4.4, 8, INKS.oxide, 0.7) +
      mech(s, 'tactician', 28, 50, 0.16, { yaw: 22, arms: { plus: [-10, 0] } }) +
      `<g transform="translate(28,50) scale(0.16)"><rect x="-56" y="-262" width="44" height="26" fill="${s.key}" stroke="${s.ink.seam}" stroke-width="1.4"/><rect x="-50" y="-256" width="32" height="6" fill="${INKS.oxide}"/></g>`,
  },
  'r-double-time': {
    world: 'mars',
    caption: 'a column of mechs trudging through a dust storm, heads down',
    draw: (s) => {
      const walk = (i: number) => ({ yaw: -30, lean: 10, legs: { plus: [i % 2 ? -14 : 14, 12], minus: [i % 2 ? 14 : -14, 6] } });
      return (
        outdoors(s, 30, { planet: false }) +
        mech(s, 'behemoth', 8, 30, 0.035, walk(0), { ink: sideInk(s), plate: false }) +
        mech(s, 'chameleon', 20, 32, 0.05, walk(1), { ink: sideInk(s) }) +
        mech(s, 'tactician', 34, 35, 0.07, walk(2)) +
        mech(s, 'chameleon', 52, 40, 0.1, walk(3)) +
        storm(s, 2, 40, 0.7)
      );
    },
  },
  'r-infiltration': {
    world: 'deimos',
    caption: 'a lone mech coming down on its boosters into a dust storm',
    draw: (s) => outdoors(s, 36, { planet: { x: 12, y: 9, r: 8 } }) + dropping(s, 'sniper', 38, 25, 0.068, -20) + storm(s, 14, 40, 0.85),
  },
  'r-close-protection': {
    world: 'phobos',
    caption: 'a towering Behemoth guarded by a Sniper and a Breacher',
    draw: (s) =>
      outdoors(s, 32, { planet: { x: 50, y: 8, r: 6 } }) +
      mech(s, 'behemoth', 32, 39, 0.135) +
      mech(s, 'sniper', 16, 41, 0.085, { yaw: 32, aim: -25 }) +
      mech(s, 'breacher', 48, 41, 0.085, { yaw: -25 }),
  },
  'r-entrenched': {
    world: 'mars',
    caption: 'a Breacher dug into a trench behind a barricade of boulders',
    draw: (s) =>
      outdoors(s, 28, { planet: false }) +
      mech(s, 'breacher', 30, 44, 0.12) +
      rect(-4, 34, 72, 12, GROUND.mars.shade) +
      rect(-4, 34, 72, 2, ht(s, 'key')) +
      print(s, 'rocks', 30, 38, { size: 0.26 }) +
      print(s, 'barricade', 4, 38, { size: 0.12 }) +
      print(s, 'barricade', 60, 38, { size: 0.12, flip: true }),
  },
  'r-advance': {
    world: 'deimos',
    caption: 'a Breacher lunging forward one hex, its fist level',
    draw: (s) =>
      outdoors(s, 30, { planet: { x: 12, y: 9, r: 8 } }) +
      hexOnGround(22, 38, 9, 0.32, s.key, 0.5, '1.2 0.8') +
      hexOnGround(44, 38, 9, 0.32, INKS.oxide, 0.7) +
      stroke('M26,36 L40,36', INKS.oxide, 0.6) +
      path('M40,34.8 L43,36 L40,37.2 Z', INKS.oxide) +
      mech(s, 'breacher', 36, 39, 0.11, {
        yaw: 40,
        lean: 16,
        legs: { plus: [-30, 30], minus: [30, 0] },
        arms: { plus: [-90, 0], minus: [30, 10] },
      }),
  },
  'r-veteran-crew': {
    world: 'phobos',
    caption: 'a crew photo: five people, each printed in a different ink',
    draw: (s) => {
      const inks = [INKS.oxide, INKS.ice, INKS.amber, INKS.green, INKS.violet];
      return (
        outdoors(s, 30, { planet: { x: 52, y: 8, r: 8 } }) +
        mech(s, 'behemoth', 32, 42, 0.12, {}, { ink: { ...sideInk(s), seam: s.ink.joint } }) +
        [8, 20, 32, 44, 56]
          .map((x, i) => person(x, i === 2 ? 42 : 41, 0.3, { facing: i < 2 ? 1 : i > 2 ? -1 : 1, arms: [8, -8] }, inks[i], s.paper))
          .join('')
      );
    },
  },
  'r-martial-law': {
    world: 'mars',
    caption: 'a loudspeaker on a mast over a habitat, its sound going out in rings',
    draw: (s) =>
      outdoors(s, 34, { planet: false }) +
      print(s, 'habitat', 34, 35, { size: 0.2 }) +
      print(s, 'mast', 52, 37, { size: 0.24 }) +
      path('M51,9 L45,6 L45,12 Z', s.key) +
      rect(51, 8.2, 2, 1.6, s.key) +
      rings(45, 9, 3, 3, 6, INKS.oxide, 0.8, 140, 220),
  },
};
