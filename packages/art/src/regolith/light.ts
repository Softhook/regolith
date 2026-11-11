import type { Rng } from '../rng';
import { n, region, turbulence, type Box } from '../svg';
import type { World } from '../tile/look';
import { LIT, rimFade } from './core';

/**
 * The Regolith ground's light: filters that turn a height map into lit, coloured ground (`ground`), and
 * the buildings' own harder light, their cast shadows and Mars's dust on them.
 */

/**
 * The ground's colours are the mechs' inks (mood board GroundMechs, look 1), and each world stands apart
 * by its lightness first, so a map tells at a glance: dark Phobos, from key ink (#1E1C1A), never black, to a
 * cool grey; light Deimos, from a soft brown to a dusty rose tan; and Mars between, through oxide (#E0703A)
 * to Jupiter (#D9A066).
 */

/** Phobos: dark, cool charcoal dust, as dark as the moon really is, key ink in the shadows and a cool grey (#ADADB5) in the light. */
const PHOBOS_RAMP =
  '<feComponentTransfer in="lit2" result="ramp">' +
  '<feFuncR type="table" tableValues="0.118 0.157 0.22 0.31 0.42 0.545 0.68"/>' +
  '<feFuncG type="table" tableValues="0.11 0.153 0.216 0.306 0.416 0.541 0.678"/>' +
  '<feFuncB type="table" tableValues="0.102 0.153 0.222 0.318 0.435 0.565 0.71"/>' +
  '</feComponentTransfer>';

/** Deimos: light, warm, soft dust, its shadows never deeper than a soft brown (#42382E), a dusty rose tan (#D6C1A6) in the light. */
const DEIMOS_RAMP =
  '<feComponentTransfer in="lit2" result="ramp">' +
  '<feFuncR type="table" tableValues="0.26 0.37 0.48 0.584 0.68 0.765 0.84"/>' +
  '<feFuncG type="table" tableValues="0.22 0.315 0.41 0.506 0.596 0.68 0.756"/>' +
  '<feFuncB type="table" tableValues="0.18 0.255 0.335 0.42 0.5 0.578 0.65"/>' +
  '</feComponentTransfer>';

/** Mars: oxide and ochre dust, and patches of dark basalt where the wind swept it bare (the broad noise's alpha lays them). */
const MARS_RAMP =
  '<feComponentTransfer in="lit2" result="dust">' +
  '<feFuncR type="table" tableValues="0.118 0.227 0.412 0.627 0.824 0.871 0.91"/>' +
  '<feFuncG type="table" tableValues="0.11 0.122 0.192 0.29 0.408 0.584 0.78"/>' +
  '<feFuncB type="table" tableValues="0.102 0.0863 0.122 0.165 0.227 0.376 0.612"/>' +
  '</feComponentTransfer>' +
  '<feComponentTransfer in="lit2" result="rock">' +
  '<feFuncR type="table" tableValues="0.118 0.149 0.227 0.322 0.431 0.549 0.659"/>' +
  '<feFuncG type="table" tableValues="0.11 0.137 0.208 0.294 0.396 0.51 0.616"/>' +
  '<feFuncB type="table" tableValues="0.102 0.125 0.188 0.263 0.353 0.455 0.549"/>' +
  '</feComponentTransfer>' +
  '<feColorMatrix in="broad" type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1" result="pg"/>' +
  '<feComponentTransfer in="pg" result="mD0"><feFuncR type="table" tableValues="0 0 0.1 0.9 1 1"/><feFuncG type="table" tableValues="0 0 0.1 0.9 1 1"/><feFuncB type="table" tableValues="0 0 0.1 0.9 1 1"/></feComponentTransfer>' +
  // All dust towards the tile's rim (`ground`): mD0 · rim + (1 − rim).
  '<feComposite in="mD0" in2="rim" operator="arithmetic" k1="1" k3="-1" k4="1" result="mD"/>' +
  '<feComponentTransfer in="mD" result="mR"><feFuncR type="linear" slope="-1" intercept="1"/><feFuncG type="linear" slope="-1" intercept="1"/><feFuncB type="linear" slope="-1" intercept="1"/></feComponentTransfer>' +
  '<feComposite in="dust" in2="mD" operator="arithmetic" k1="1" result="dustM"/>' +
  '<feComposite in="rock" in2="mR" operator="arithmetic" k1="1" result="rockM"/>' +
  '<feComposite in="dustM" in2="rockM" operator="arithmetic" k2="1" k3="1" result="ramp"/>';

const RAMPS: Record<World, string> = { phobos: PHOBOS_RAMP, deimos: DEIMOS_RAMP, mars: MARS_RAMP };

/** Each world's ground at its middle lightness (its ramp's middle step): what shows where a tile isn't drawn yet. */
export const GROUND_BASE: Record<World, string> = { phobos: '#4f4e51', deimos: '#95816b', mars: '#a04a2a' };

/**
 * How each world is lit: how high its sun stands (`elevation`, degrees), how much its relief (`relief`) and
 * fine noise (`fine`) show, and how dark its shadows fall (`shadow`). Phobos harsh, its sun low, its relief
 * deep and its shadows near black; Deimos soft, its sun high over deep dust that smooths it over, its shadows
 * short (`SHADOW`) and a little lighter, falling on ground whose darkest is a soft brown.
 */
const LOOK: Record<World, { elevation: number; relief: number; fine: number; shadow: number }> = {
  phobos: { elevation: 15, relief: 1.15, fine: 1.1, shadow: 0.92 },
  deimos: { elevation: 34, relief: 0.8, fine: 0.7, shadow: 0.75 },
  mars: { elevation: 22, relief: 1, fine: 1, shadow: 0.85 },
};

/** The sun's height every shadow and the ground's brightness were tuned for, degrees: Mars's. */
const TUNED_SUN = LOOK.mars.elevation;

/** A value for each world. */
const perWorld = <T>(f: (world: World) => T): Record<World, T> => ({ phobos: f('phobos'), deimos: f('deimos'), mars: f('mars') });

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** How long a world's shadows fall against Mars's: as much longer as its sun is lower. */
const shadowLength = (world: World) => Math.tan(radians(TUNED_SUN)) / Math.tan(radians(LOOK[world].elevation));

/**
 * How the shadows look on each world, the ground's, the buildings' (`cast`) and what the game draws standing
 * on the ground: as dark (`opacity`, of black), as sharp (`blur`, board units), and as long, down and to the
 * right, `length` along each axis for each unit of height (on Mars a gold tank some 20 tall throws its shadow
 * about 19 on, on Phobos half as far again, on Deimos little more than half).
 */
export const SHADOW: { opacity: Record<World, number>; blur: number; length: Record<World, number> } = {
  opacity: perWorld((world) => LOOK[world].shadow),
  blur: 0.45,
  length: perWorld(shadowLength),
};

/**
 * A relief's surfaceScale, tuned for a pixel 0.28 across, at the pixel the light is made for (`LIT`): Chrome
 * finds a slope from one pixel to the next, so a smaller pixel needs more relief for the same slope.
 */
const relief = (scale: number) => n((scale * 0.28) / LIT);

/**
 * Shadow (`SHD`) where the height map `height` stands higher towards the light (top left), `d` away, by more
 * than `-k`, for each `[d, k]` step: hard-edged, a steep ramp from lit to shadow softened by `blur`.
 */
const shadow = (height: string, steps: [d: number, k: number][], blur: number, colour: string, opacity: number) =>
  steps
    .map(
      ([d, k], i) =>
        `<feOffset in="${height}" dx="${n(d)}" dy="${n(d)}" result="o${i}"/>` +
        `<feComposite in="o${i}" in2="${height}" operator="arithmetic" k2="1" k3="-1" k4="${n(k)}" result="d${i}"/>`,
    )
    .join('') +
  `<feMerge result="sh">${steps.map((_, i) => `<feMergeNode in="d${i}"/>`).join('')}</feMerge>` +
  '<feComponentTransfer in="sh" result="shA"><feFuncA type="linear" slope="14"/></feComponentTransfer>' +
  `<feGaussianBlur in="shA" stdDeviation="${blur}" result="shB"/>` +
  `<feFlood flood-color="${colour}" flood-opacity="${opacity}"/>` +
  '<feComposite in2="shB" operator="in" result="SHD"/>';

/**
 * The light: the height map gains fine noise where it isn't smooth, is lit from the top left, shadowed, tinted for
 * its world and grained. Over `area`, in board units. Its broad patches (Mars's rock, the brightness's mottle)
 * fade out over the tile's rim (core `rimFade`).
 */
export function ground(r: Rng, area: Box, world: World): string {
  const s = () => r.noiseSeed();
  const look = LOOK[world];
  const fine = look.fine;
  const light = `<feDistantLight azimuth="225" elevation="${look.elevation}"/>`;
  // Flat ground's light, 1.3 · sin of the sun's height. Lit no brighter, so the slopes towards a low sun don't
  // burn out to flat white; then brought to as bright as under Mars's sun (`tuned`), its slopes lighter or darker
  // by as much as the sun picks them out, none clipped: under a lower sun curved up (gamma), under a higher one
  // scaled down, which closes the light's 256 steps up rather than stretching them into contour lines.
  const flat = 1.3 * Math.sin(radians(look.elevation));
  const tuned = 1.3 * Math.sin(radians(TUNED_SUN));
  const curve =
    flat < tuned
      ? `type="gamma" amplitude="1" exponent="${n(Math.log(tuned) / Math.log(flat))}" offset="0"`
      : `type="linear" slope="${n(tuned / flat)}"`;
  const length = SHADOW.length[world];
  return (
    `<filter id="rg-ground" filterUnits="userSpaceOnUse" ${region(area)} color-interpolation-filters="sRGB">` +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="H0"/>' +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 1 0 0 0" result="SMOOTH"/>' +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="ALB"/>' +
    // One broad noise, four ways: its red and green warp the fine noise, its blue mottles the brightness, its alpha lays the dust and rock patches.
    turbulence(0.01, 3, s(), 'broad') +
    rimFade(area) +
    turbulence(0.03, 7, s(), 'nz') +
    turbulence(0.018, 3, s(), 'rg', 'turbulence') +
    // The warp is in 256 steps too: each step shifts the noise by a third of a pixel, a seam the light
    // shows as fingerprint lines along the broad noise's contours. Half a pixel's blur closes the seams.
    '<feDisplacementMap in="nz" in2="broad" scale="26" xChannelSelector="R" yChannelSelector="G" result="nzs"/>' +
    '<feGaussianBlur in="nzs" stdDeviation="0.15" result="nzw"/>' +
    '<feDisplacementMap in="rg" in2="broad" scale="26" xChannelSelector="R" yChannelSelector="G" result="rgs"/>' +
    '<feGaussianBlur in="rgs" stdDeviation="0.15" result="rgw"/>' +
    '<feComponentTransfer in="rgw" result="ridged"><feFuncA type="table" tableValues="1 0.55 0.3 0.15 0"/></feComponentTransfer>' +
    '<feComponentTransfer in="SMOOTH" result="ROUGH"><feFuncA type="table" tableValues="1 0.02"/></feComponentTransfer>' +
    '<feComposite in="nzw" in2="ROUGH" operator="in" result="nzm"/>' +
    '<feComposite in="ridged" in2="ROUGH" operator="in" result="rgm"/>' +
    `<feComposite in="H0" in2="nzm" operator="arithmetic" k2="0.85" k3="${n(0.28 * fine)}" k4="${n(-0.07 * fine)}" result="h1"/>` +
    '<feComposite in="h1" in2="rgm" operator="arithmetic" k2="1" k3="0.12" k4="-0.05" result="H"/>' +
    // Lit in two parts, the drawn ground and the noise on it, each at its full 256 levels and given its share
    // of the relief by its surfaceScale: scaled down to its share first (0.28 of the height), the noise
    // would have only some 70 levels, its gentle slopes terraced. The noise's light is less the light on
    // flat ground (`flat`), so it only adds its relief. `H`, all in one, still makes the shine.
    `<feDiffuseLighting in="H0" kernelUnitLength="${LIT}" surfaceScale="${relief(7.65 * look.relief)}" diffuseConstant="1.3" lighting-color="#ffffff" result="LS">${light}</feDiffuseLighting>` +
    '<feComposite in="nzm" in2="rgm" operator="arithmetic" k2="0.7" k3="0.3" result="HN"/>' +
    `<feDiffuseLighting in="HN" kernelUnitLength="${LIT}" surfaceScale="${relief(4.3 * fine * look.relief)}" diffuseConstant="1.3" lighting-color="#ffffff" result="LN">${light}</feDiffuseLighting>` +
    // Under Mars's own sun no curve: as tuned.
    `<feComposite in="LS" in2="LN" operator="arithmetic" k2="1" k3="1" k4="${-Math.round(flat * 1000) / 1000}" result="${world === 'mars' ? 'L' : 'L0'}"/>` +
    (world === 'mars'
      ? ''
      : `<feComponentTransfer in="L0" result="L"><feFuncR ${curve}/><feFuncG ${curve}/><feFuncB ${curve}/></feComponentTransfer>`) +
    // Shadowed as read from the height map before its fine noise, as moving the noisy one makes Chrome work
    // it all out again for each shadow (~65 ms a time), and the noise's own shadows are too small to see.
    // Hard-edged, as the mechs' shadows, barely softened.
    shadow(
      'H0',
      (
        [
          [1.2, -0.06],
          [2.5, -0.13],
          [5, -0.26],
          [9, -0.47],
        ] as [number, number][]
      ).map(([d, k]) => [d * length, k]),
      0.12,
      '#1E1C1A',
      look.shadow,
    ) +
    '<feMerge result="Ls"><feMergeNode in="L"/><feMergeNode in="SHD"/></feMerge>' +
    '<feColorMatrix in="ALB" type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1" result="albG"/>' +
    '<feColorMatrix in="broad" type="matrix" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1" result="anG0"/>' +
    // The mottle evened out towards the rim, to where it leaves the brightness as it is: anG0 · rim + 0.49 (1 − rim).
    '<feComposite in="anG0" in2="rim" operator="arithmetic" k1="1" k3="-0.49" k4="0.49" result="anG"/>' +
    '<feComposite in="albG" in2="anG" operator="arithmetic" k2="1" k3="0.45" k4="-0.22" result="albN"/>' +
    '<feComposite in="Ls" in2="albN" operator="arithmetic" k1="2" result="lit"/>' +
    `<feSpecularLighting in="H" kernelUnitLength="${LIT}" surfaceScale="${relief(9 * look.relief)}" specularConstant="0.6" specularExponent="40" lighting-color="#e6f6ff" result="spec">${light}</feSpecularLighting>` +
    '<feComposite in="spec" in2="SMOOTH" operator="in" result="specM"/>' +
    '<feComposite in="lit" in2="specM" operator="arithmetic" k2="1" k3="0.7" result="lit2"/>' +
    RAMPS[world] +
    turbulence(1.4, 1, s(), 'grain') +
    '<feComposite in="ramp" in2="grain" operator="arithmetic" k2="1" k3="0.09" k4="-0.045"/>' +
    '</filter>'
  );
}

/**
 * The buildings' own light on `world`, over `area`: made, not weathered, so no fine noise, dust colour or grain,
 * and hard-edged, each standing up sharply from nothing, so its outline catches the light or falls in shadow.
 * Lit 16° above the ground (on Mars at 38°), from the same sun, as low or high as its world's. Their heights are
 * in the ground's map too, so they still cast their shadows on it.
 */
export function built(r: Rng, area: Box, world: World): string {
  const light = `<feDistantLight azimuth="225" elevation="${LOOK[world].elevation + 16}"/>`;
  const length = SHADOW.length[world];
  const ramp = (values: string) => `type="table" tableValues="${values}"`;
  return (
    `<filter id="rg-built" filterUnits="userSpaceOnUse" ${region(area)} color-interpolation-filters="sRGB">` +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="H"/>' +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 1 0 0 0" result="SMOOTH"/>' +
    '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1" result="ALB"/>' +
    `<feDiffuseLighting in="H" surfaceScale="7" diffuseConstant="1.2" lighting-color="#ffffff" result="L">${light}</feDiffuseLighting>` +
    // Worn: brightness mottled by grime in patches and flecks, larger and finer than the ground's grain.
    turbulence(0.07, 3, r.noiseSeed(), 'gm') +
    '<feColorMatrix in="gm" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="gmG"/>' +
    turbulence(0.45, 2, r.noiseSeed(), 'gf') +
    '<feColorMatrix in="gf" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="gfG"/>' +
    '<feComposite in="ALB" in2="gmG" operator="arithmetic" k1="1.3" k2="0.33" result="alb1"/>' +
    '<feComposite in="alb1" in2="gfG" operator="arithmetic" k1="0.5" k2="0.75" result="ALBW"/>' +
    '<feComposite in="L" in2="ALBW" operator="arithmetic" k1="1.15" result="lit"/>' +
    `<feSpecularLighting in="H" surfaceScale="7" specularConstant="0.35" specularExponent="18" lighting-color="#ffffff" result="spec">${light}</feSpecularLighting>` +
    '<feComposite in="spec" in2="SMOOTH" operator="in" result="specM"/>' +
    '<feComposite in="lit" in2="specM" operator="arithmetic" k2="1" k3="0.6" result="lit2"/>' +
    // Shadowed where something taller stands towards the light, as long as the ground's cast ones (on Mars a
    // height of 1 throws 42), so a mech's falls across its pad and a tank's across its deck.
    shadow(
      'H',
      [1, 2, 3.5, 5, 7, 9.5, 12.5, 16].map((d) => [d * length, -d / 42]),
      0.3,
      '#000',
      0.75,
    ) +
    '<feMerge result="lit3"><feMergeNode in="lit2"/><feMergeNode in="SHD"/></feMerge>' +
    // Warm steel, key ink to bone, as the ground.
    `<feComponentTransfer in="lit3"><feFuncR ${ramp('0.118 0.24 0.45 0.66 0.84 0.93')}/><feFuncG ${ramp('0.11 0.22 0.42 0.62 0.8 0.89')}/><feFuncB ${ramp('0.102 0.2 0.37 0.55 0.72 0.8')}/></feComponentTransfer>` +
    '<feComposite in2="SourceAlpha" operator="in"/>' +
    '</filter>'
  );
}

/**
 * The shadows the buildings cast on `world`'s ground, away from the light (to the bottom right), as long as
 * they're tall and its sun is low (`SHADOW`): each height (red, 128 the ground) stands in its shadow that much
 * further along, so a dome or a tank throws a long one and a deck or a pipe a short one. Over `area`.
 */
export function cast(area: Box, world: World): string {
  const length = SHADOW.length[world];
  // Close enough that each height's shadow is at most 1.2 on from the last, so a little blur joins them, and
  // never fewer than the 23 tuned for Mars (0.84 apart there).
  const count = Math.max(23, Math.ceil((0.44 * 42 * length) / 1.2) + 1);
  const levels = Array.from({ length: count }, (_, i) => 0.52 + (i * 0.44) / (count - 1));
  return (
    `<filter id="rg-cast" filterUnits="userSpaceOnUse" ${region(area)} color-interpolation-filters="sRGB">` +
    levels
      .map((t, i) => {
        const d = n((t - 0.5) * 42 * length);
        return (
          `<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  40 0 0 0 ${n(-40 * t)}" result="a${i}"/>` +
          `<feOffset in="a${i}" dx="${d}" dy="${d}" result="s${i}"/>`
        );
      })
      .join('') +
    `<feMerge>${levels.map((_, i) => `<feMergeNode in="s${i}"/>`).join('')}</feMerge>` +
    // Just enough blur to join its steps, so its edge stays crisp.
    `<feGaussianBlur stdDeviation="${SHADOW.blur}"/>` +
    `<feComponentTransfer><feFuncA type="linear" slope="${SHADOW.opacity[world]}"/></feComponentTransfer>` +
    '</filter>'
  );
}

/** Mars dust settled on the buildings, in drifts: their shapes (`SourceAlpha`) filled with dust where noise says, over `area`. */
export const dust = (seed: number, area: Box) =>
  `<filter id="rg-dust" filterUnits="userSpaceOnUse" ${region(area)} color-interpolation-filters="sRGB">` +
  turbulence(0.03, 3, seed, 'dn') +
  '<feColorMatrix in="dn" type="matrix" values="0 0 0 0 0.66  0 0 0 0 0.38  0 0 0 0 0.22  3 0 0 0 -1.1"/>' +
  '<feComposite in2="SourceAlpha" operator="in"/>' +
  '</filter>';
