/** The Regolith Tactics' screenprint scenes (scenes.ts). */
import { n } from '../../svg';
import { INKS, ON_PAPER } from '../inks';
import { GROUND, flash, ht, label, land, mech, paperGround, print, rays, rect, rings, sky, sparks, stencil } from '../kit';
import { outdoors, path, stroke, glove, hexOnGround, dropping } from './props';
import type { SpScene } from '../scenes';

export const TACTIC_SCENES: Record<string, SpScene> = {
  'r-aggression': {
    world: 'mars',
    caption: 'a two-ink recruitment poster: raised fists and a Chameleon standing on the red ground',
    draw: (s) => {
      const fist = (x: number, h: number, t: number) =>
        `<g transform="rotate(${t} ${x} 44)"><rect x="${x - 2.6}" y="${44 - h}" width="5.2" height="${h}" fill="${INKS.oxide}"/><rect x="${x - 3.6}" y="${44 - h - 5}" width="7.2" height="6" rx="1.6" fill="${INKS.oxide}"/></g>`;
      return (
        paperGround(s) +
        rays(32, 18, 28, INKS.oxide, 180, 360) +
        `<circle cx="32" cy="18" r="8" fill="${s.paper}"/>` +
        mech(s, 'chameleon', 32, 42, 0.12, { arms: { plus: [-140, 0] } }, { plate: INKS.oxide }) +
        [6, 14, 50, 58].map((x, i) => fist(x, 12 + (i % 2) * 6, (i < 2 ? -1 : 1) * 6)).join('')
      );
    },
  },
  'r-black-market': {
    world: 'mars',
    caption: 'two atomic rockets in an open crate, warning stencils on them',
    draw: (s) => {
      // An atomic: bone body, oxide nose and fins, an amber trefoil on a key band. Its foot (x, y) is in the crate.
      const atomic = (x: number, y: number, h: number) => {
        const top = y - h;
        const t = top + h * 0.38;
        const blade = (a: number) => {
          const p = (r: number, d: number) =>
            `${n(x + r * Math.cos(((a + d) * Math.PI) / 180))},${n(t + r * Math.sin(((a + d) * Math.PI) / 180))}`;
          return path(
            `M${p(0.45, -30)} L${p(1.5, -30)} A1.5,1.5 0 0 1 ${p(1.5, 30)} L${p(0.45, 30)} A0.45,0.45 0 0 0 ${p(0.45, -30)} Z`,
            INKS.key,
          );
        };
        return (
          path(`M${n(x - 2.4)},${n(y - 7)} L${n(x - 5)},${n(y - 1)} L${n(x - 2.4)},${n(y - 2)} Z`, INKS.oxide) +
          path(`M${n(x + 2.4)},${n(y - 7)} L${n(x + 5)},${n(y - 1)} L${n(x + 2.4)},${n(y - 2)} Z`, INKS.oxide) +
          rect(x - 2.4, top, 4.8, h, INKS.bone) +
          rect(x + 1.2, top, 1.2, h, s.ink.seam) +
          path(
            `M${n(x - 2.4)},${n(top)} Q${n(x - 2.4)},${n(top - 4)} ${n(x)},${n(top - 7.5)} Q${n(x + 2.4)},${n(top - 4)} ${n(x + 2.4)},${n(top)} Z`,
            INKS.oxide,
          ) +
          rect(x - 2.4, t - 2.2, 4.8, 4.4, INKS.amber) +
          blade(-90) +
          blade(30) +
          blade(150) +
          `<circle cx="${n(x)}" cy="${n(t)}" r="0.3" fill="${INKS.key}"/>`
        );
      };
      return (
        outdoors(s, 30, { planet: false }) +
        `<circle cx="31" cy="22" r="17" fill="${INKS.amber}" opacity="0.16"/>` +
        atomic(25, 34, 18) +
        atomic(37, 34, 18) +
        // the crate: its front, slats and a hazard band; the lid against its side
        `<g transform="rotate(14 50 39)">${rect(47, 22, 4, 17, INKS.key)}${rect(47, 22, 4, 1, ON_PAPER.recess)}</g>` +
        rect(17, 30, 28, 10, INKS.key) +
        rect(17, 30, 28, 1.2, ON_PAPER.recess) +
        [24, 31, 38].map((x) => rect(x, 31.2, 0.5, 8.8, ON_PAPER.recess)).join('') +
        `<clipPath id="${s.id}-band"><rect x="17" y="35" width="28" height="2.4"/></clipPath>` +
        `<g clip-path="url(#${s.id}-band)">${rect(17, 35, 28, 2.4, INKS.amber)}${[...Array(10)].map((_, i) => path(`M${17 + i * 3},37.4 l1.4,0 l2.4,-2.4 l-1.4,0 Z`, INKS.key)).join('')}</g>`
      );
    },
  },
  'r-change-of-heart': {
    world: 'phobos',
    caption: 'a gloved hand pulling one personnel file from an archive drawer of them, stamped ACQUIRED in oxide',
    draw: (s) => {
      const tabs = [
        { y: 8, w: 32, x: 15.5 },
        { y: 11, w: 33.5, x: 14.7 },
        { y: 14, w: 35, x: 14 },
        { y: 17, w: 36.5, x: 13.2 },
        { y: 20, w: 38, x: 12.5 },
        { y: 23, w: 39.5, x: 11.7 },
        { y: 26, w: 41, x: 11 },
      ];
      const fx = 10.5;
      const fy = 6.5;
      const fw = 42.5;
      const fh = 26.5;
      const px = fx + 8.25;
      const py = fy + 11.5;
      const wx = 46;
      const wy = 4.5;
      return (
        rect(-4, -4, 72, 48, INKS.key) +
        rect(4, 2, 55.5, 38, INKS.night) +
        stroke('M4,2 h55.5 v38 h-55.5 Z', ON_PAPER.recess, 0.6) +
        rect(26, 3, 11.5, 2, ON_PAPER.recess) +
        path('M8,38 L16,7 L47.5,7 L55.5,38 Z', INKS.key) +
        stroke('M8,38 L16,7 L47.5,7 L55.5,38', ON_PAPER.side, 0.5) +
        tabs
          .map(
            (t, i) =>
              path(`M${t.x},${t.y + 3} L${t.x + t.w},${t.y + 3} L${t.x + t.w - 0.6},${t.y} L${t.x + 0.6},${t.y} Z`, INKS.night) +
              stroke(`M${t.x + 0.6},${t.y} L${t.x + t.w - 0.6},${t.y}`, ON_PAPER.recess, 0.4) +
              path(`M${t.x + 2 + ((i * 5.5) % (t.w - 8))},${t.y} h5 l-0.4,-1.4 h-4.2 Z`, ON_PAPER.side),
          )
          .join('') +
        rect(fx + 1.5, fy + 2, fw, fh, INKS.key, ' opacity="0.8"') +
        rect(fx, fy, fw, fh, s.key) +
        path(`M${fx},${fy} h15 l-1.2,-2.8 h-13.8 Z`, s.key) +
        label('DOSSIER', fx + 6.5, fy - 0.8, 1.2, s.paper) +
        rect(fx, fy, fw, 4.8, s.plate) +
        stencil('SKILL // FITTER', fx + 2.4, fy + 3.6, 2.7, s.paper, { anchor: 'start', spacing: 0.04 }) +
        rect(fx + 2.5, fy + 6.8, 11.5, 14.5, s.paper) +
        `<circle cx="${px}" cy="${py}" r="3.2" fill="${s.key}"/>` +
        `<path d="M${px - 0.8},${py - 0.9} h2.6 v1.5 h-2.6 Z" fill="${INKS.amber}"/>` +
        `<path d="M${px - 4.2},${py + 8} C${px - 4.2},${py + 3.8} ${px + 4.2},${py + 3.8} ${px + 4.2},${py + 8} Z" fill="${s.key}"/>` +
        label('SPEC-04', px, fy + 20, 1.0, s.plate) +
        label('SPECIALTY', fx + 16, fy + 8.6, 1.1, ON_PAPER.gun, 'start') +
        stencil('SERVO TUNING', fx + 16, fy + 11.2, 2.0, s.paper, { anchor: 'start' }) +
        label('CLEARANCE', fx + 16, fy + 14, 1.1, ON_PAPER.gun, 'start') +
        stencil('LEVEL 1 PRIORITY', fx + 16, fy + 16.6, 1.9, s.paper, { anchor: 'start' }) +
        label('RECORD', fx + 16, fy + 19.4, 1.1, ON_PAPER.gun, 'start') +
        stencil('UNASSIGNED', fx + 16, fy + 22, 1.9, s.paper, { anchor: 'start' }) +
        `<g transform="rotate(-9 ${fx + 30} ${fy + 24.5})">${rect(fx + 23, fy + 22, 14, 4.2, INKS.oxide)}${stencil('ACQUIRED', fx + 30, fy + 25.1, 2.4, s.key)}</g>` +
        stroke(`M55,-4 L${wx},${wy}`, s.key, 4.2) +
        `<g transform="scale(-1 1) translate(${-wx * 2} 0)">${glove(wx, wy, 7.5, 155, s.key)}</g>`
      );
    },
  },
  'r-momentum': {
    world: 'deimos',
    caption: 'mechs advancing at dawn, long shadows ahead of them',
    draw: (s) => {
      const poses = [
        { yaw: -30, legs: { plus: [-9, 12], minus: [7, 4] } },
        { yaw: -30, legs: { plus: [-10, 13], minus: [8, 4] } },
        { yaw: -30, legs: { plus: [-8, 10], minus: [7, 3] } },
      ];
      const walk = (i: number) => poses[i] ?? poses[0];
      const shadow = (x: number, y: number, len: number) =>
        `<path d="M${n(x - 1)},${n(y)} L${n(x + len)},${n(y + 1)} L${n(x + len)},${n(y + 2.4)} L${n(x + 1)},${n(y + 0.5)} Z" fill="${s.key}" opacity="0.5"/>`;
      return (
        paperGround(s) +
        sky(s, { planet: false }) +
        `<circle cx="4" cy="30" r="9" fill="${INKS.amber}"/>` +
        rings(4, 30, 11, 3, 3, INKS.amber, 0.5) +
        land(s, 30) +
        shadow(18, 34, 40) +
        shadow(34, 38, 32) +
        mech(s, 'chameleon', 18, 34, 0.08, walk(0)) +
        mech(s, 'sniper', 34, 38, 0.1, walk(1)) +
        mech(s, 'tactician', 52, 31, 0.05, walk(2))
      );
    },
  },
  'r-plan-ahead': {
    world: 'deimos',
    caption: 'a huge Behemoth caught in a marked kill zone, crossfire coming in from both sides',
    draw: (s) =>
      outdoors(s, 22, { planet: { x: 52, y: 8, r: 7 } }) +
      // the kill zone: three hexes painted on the ground, hatched in the plate
      hexOnGround(26, 31, 6, 0.42, INKS.amber, 0.7) +
      hexOnGround(38, 31, 6, 0.42, INKS.amber, 0.7) +
      hexOnGround(32, 35.4, 6, 0.42, INKS.amber, 0.7) +
      `<ellipse cx="32" cy="34" rx="14" ry="4.5" fill="${ht(s, 'plate')}"/>` +
      mech(s, 'behemoth', 32, 43.5, 0.13, {}, { plate: INKS.oxide }) +
      // crossfire tracers converging from both sides
      stroke('M-4,18 L26,22.5 M-4,30 L29.5,28', INKS.amber, 0.6) +
      stroke('M68,17 L38,22 M68,29 L34.5,28', INKS.amber, 0.6) +
      // explosions on the mech and the center
      `<circle cx="32" cy="22.5" r="8" fill="${INKS.oxide}" opacity="0.55"/>` +
      `<circle cx="32" cy="22.5" r="5" fill="${INKS.amber}" opacity="0.65"/>` +
      `<ellipse cx="32" cy="30" rx="6.5" ry="2.4" fill="${INKS.oxide}" opacity="0.5"/>` +
      flash(32, 22, 7.5, 12, 10) +
      flash(26, 23.5, 4.5, 9, 24) +
      flash(38, 23, 4.6, 9, 36) +
      flash(32, 29.5, 4.2, 8, 15) +
      sparks(s.r, 32, 22.5, 28, 16) +
      sparks(s.r, 32, 29.5, 14, 10),
  },
  'r-sabotage': {
    world: 'deimos',
    caption: 'a hand pouring regolith into an open gearbox',
    draw: (s) => {
      const gear = (x: number, y: number, r: number, teeth: number, ink: string) => {
        let d = '';
        for (let i = 0; i < teeth; i++) {
          const a = (i / teeth) * Math.PI * 2;
          d += `<rect x="${n(x - 1)}" y="${n(y - r - 1.6)}" width="2" height="2.4" fill="${ink}" transform="rotate(${n((a * 180) / Math.PI)} ${n(x)} ${n(y)})"/>`;
        }
        return d + `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}"/><circle cx="${x}" cy="${y}" r="${n(r * 0.3)}" fill="${s.paper}"/>`;
      };
      let grit = '';
      for (let i = 0; i < 80; i++)
        grit += `<circle cx="${n(36 + s.r.range(-1.4, 1.4) + i * 0.02)}" cy="${n(10 + i * 0.36)}" r="${n(s.r.range(0.2, 0.5))}" fill="${INKS.dust}"/>`;
      return (
        paperGround(s) +
        rect(6, 22, 52, 20, ON_PAPER.side) +
        rect(4, 20, 56, 3, s.key) +
        gear(22, 32, 7, 12, s.key) +
        gear(36, 30, 5, 9, s.ink.joint) +
        gear(48, 34, 6, 10, s.key) +
        grit +
        // the sand piled up in the bottom of the box
        path('M10,42 Q16,37 24,37.6 Q32,34.6 38,35.4 Q46,35.6 52,38.4 Q56,40 58,42 Z', INKS.dust) +
        glove(39, 9, 8, 160, INKS.bone) +
        stroke('M40,4 L52,-4', INKS.bone, 4.4)
      );
    },
  },
  'r-show-of-force': {
    world: 'mars',
    caption: 'an enemy mech hit from above by an amber column of light',
    draw: (s) =>
      outdoors(s, 32, { planet: { x: 12, y: 9, r: 9 } }) +
      rect(36, -4, 8, 38, INKS.amber, ' opacity="0.35"') +
      rect(38.4, -4, 3.2, 38, INKS.amber) +
      rect(39.4, -4, 1.2, 38, INKS.bone) +
      mech(s, 'chameleon', 40, 37, 0.1, { yaw: -24, lean: 12 }, { plate: INKS.oxide }) +
      flash(40, 22, 6, 12),
  },
  'r-unveil-the-fleet': {
    world: 'deimos',
    caption: 'mechs coming down on their boosters all over the map',
    draw: (s) =>
      outdoors(s, 34, { planet: { x: 52, y: 26, r: 8 } }) +
      dropping(s, 'wisp', 9, 12, 0.035) +
      dropping(s, 'sniper', 24, 6, 0.03) +
      dropping(s, 'chameleon', 52, 8, 0.035) +
      dropping(s, 'breacher', 40, 18, 0.05) +
      dropping(s, 'tactician', 20, 26, 0.06) +
      mech(s, 'behemoth', 54, 39, 0.05) +
      rings(20, 38, 3, 3, 3, s.key, 0.35, 180, 360),
  },
  'r-warp-gate': {
    world: 'phobos',
    caption: 'a cut-away of the ground: an ice tunnel joining two hexes underneath',
    draw: (s) => {
      const g = GROUND.phobos;
      return (
        paperGround(s) +
        sky(s, { planet: { x: 32, y: 4, r: 7 } }) +
        land(s, 14, { marks: false }) +
        [20, 26, 32].map((y) => stroke(`M-4,${y} q16,-2 34,0 t36,0`, g.shade, 0.4)).join('') +
        `<path d="M8,15 C8,40 56,40 56,15 L50,15 C50,32 14,32 14,15 Z" fill="${INKS.ice}"/>` +
        `<path d="M11,15 C11,36 53,36 53,15" fill="none" stroke="${s.key}" stroke-width="0.5" stroke-dasharray="1 0.8"/>` +
        hexOnGround(11, 14.6, 6, 0.3, s.key, 0.7) +
        hexOnGround(53, 14.6, 6, 0.3, s.key, 0.7) +
        `<ellipse cx="11" cy="14.6" rx="3" ry="0.9" fill="${s.key}"/><ellipse cx="53" cy="14.6" rx="3" ry="0.9" fill="${s.key}"/>` +
        mech(s, 'wisp', 32, 31.8, 0.032, { yaw: 30 }) +
        mech(s, 'chameleon', 52, 14, 0.035, { yaw: -30 })
      );
    },
  },
  'r-barricade': {
    world: 'mars',
    caption: 'a Wisp flash-blowing soft glass barrier bubbles across the ground',
    draw: (s) => {
      const b1 = 'M26.5,29 C26.5,24.6 28.8,22.2 32,22.2 C35.2,22.2 37.5,24.6 37.5,29 C37.5,30.8 26.5,30.8 26.5,29 Z';
      const b2 = 'M39.2,36 C39.2,29.2 42.6,25.5 48,25.5 C53.4,25.5 56.8,29.2 56.8,36 C56.8,39 39.2,39 39.2,36 Z';
      return (
        outdoors(s, 28, { planet: { x: 50, y: 7, r: 7 } }) +
        // Background cooled barrier bubble
        `<ellipse cx="33" cy="29.8" rx="6.8" ry="2.2" fill="${s.key}" opacity="0.4"/>` +
        `<ellipse cx="32" cy="29" rx="5.5" ry="1.9" fill="none" stroke="${s.key}" stroke-width="0.5"/>` +
        stroke(b1, INKS.bone, 0.5) +
        `<ellipse cx="30.2" cy="24.4" rx="1.6" ry="0.7" transform="rotate(-35 30.2 24.4)" fill="${INKS.bone}"/>` +
        stroke('M29,26 C29,24.2 30.2,23.5 31.5,23.2', INKS.bone, 0.6) +
        stroke('M35,29.4 C36.5,29.4 37.2,28.8 37.2,28', INKS.amber, 0.4) +
        // Foreground barrier bubble being inflated
        `<ellipse cx="49.5" cy="37.4" rx="10.5" ry="3.8" fill="${s.key}" opacity="0.45"/>` +
        `<ellipse cx="48" cy="36" rx="8.8" ry="3.1" fill="none" stroke="${s.key}" stroke-width="0.6"/>` +
        stroke(b2, INKS.bone, 0.65) +
        stroke('M42.5,32 C42.5,29.5 44.5,28.5 46.8,28.2', INKS.bone, 0.85) +
        `<ellipse cx="44.2" cy="30" rx="2.5" ry="1.1" transform="rotate(-35 44.2 30)" fill="${INKS.bone}"/>` +
        `<circle cx="43" cy="32.4" r="0.4" fill="${INKS.bone}"/>` +
        stroke('M53,36.5 C55.5,36.5 56.5,35.5 56.5,34.5', INKS.amber, 0.5) +
        // Wisp deploying the second barrier
        mech(s, 'wisp', 15, 38, 0.12, { yaw: -45 }) +
        stroke('M18.4,27.1 Q32,21.5 47.5,27', INKS.amber, 0.9, ' stroke-dasharray="2.5 1.2"')
      );
    },
  },
  'r-kinetic-shunt': {
    world: 'mars',
    caption: 'a kinetic pulse blasting out from a mech’s cannon, dust rings kicking up as the target is hurled backward',
    draw: (s) =>
      outdoors(s, 30, { planet: { x: 50, y: 7, r: 7 } }) +
      mech(s, 'breacher', 15, 40, 0.11, {
        yaw: -32,
        lean: -4,
        legs: { plus: [-16, 22], minus: [18, -8] },
        arms: { plus: [-45, -35], minus: [16, 14] },
      }) +
      stroke('M36,21.8 Q47,22 57,27', INKS.amber, 1, ' stroke-dasharray="3 1.5"') +
      stroke('M36,22.2 Q47,22.5 57,27.5', INKS.bone, 0.5) +
      rings(35.5, 21.8, 4, 4.4, 5, INKS.amber, 0.65, 285, 435) +
      `<ellipse cx="59" cy="38" rx="8" ry="2.6" fill="${INKS.dust}" opacity="0.6"/>` +
      rings(59, 38, 3, 2, 2.5, INKS.dust, 0.5, 0, 360) +
      mech(s, 'chameleon', 59, 38, 0.09, { yaw: 30, lean: 24, legs: { plus: [20, 10], minus: [-25, 20] } }, { plate: INKS.oxide }),
  },
  'r-expansion': {
    world: 'mars',
    caption: "a new Chameleon walking out of a workshop's doors",
    draw: (s) =>
      outdoors(s, 34, { planet: { x: 10, y: 8, r: 8 } }) +
      print({ ...s, key: ON_PAPER.joint }, 'workshop', 32, 36, { size: 0.3 }) +
      rect(22, 20.4, 20, 15.6, INKS.amber, ' opacity="0.4"') +
      rays(32, 28, 16, INKS.amber, 30, 150) +
      mech(s, 'chameleon', 33, 40, 0.1, { legs: { plus: [-20, 20], minus: [16, 6] } }),
  },
};
