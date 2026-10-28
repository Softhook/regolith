import type { Rng } from '../rng';
import { n, region, turbulence, type Box } from '../svg';
import type { World } from '../tile/look';
import { LIT, rimFade } from './core';

/**
 * The Regolith ground's light: filters that turn a height map into lit, coloured ground (`ground`), and
 * the buildings' own harder light, their cast shadows and Mars's dust on them.
 */

/**
 * The ground's colours are the mechs' inks (mood board GroundMechs, look 1): from key ink (#1E1C1A),
 * never black, up to bone on Phobos, a dusty rose tan on Deimos, and through oxide (#E0703A) to Jupiter
 * (#D9A066) on Mars.
 */

/** Phobos: warm grey dust, key ink in the shadows and bone (#E6DDC8) in the light. */
const PHOBOS_RAMP =
  '<feComponentTransfer in="lit2" result="ramp">' +
  '<feFuncR type="table" tableValues="0.118 0.18 0.29 0.435 0.604 0.769 0.902"/>' +
  '<feFuncG type="table" tableValues="0.11 0.169 0.275 0.416 0.573 0.733 0.867"/>' +
  '<feFuncB type="table" tableValues="0.102 0.157 0.251 0.376 0.51 0.651 0.784"/>' +
  '</feComponentTransfer>';

/** Deimos: dust a little redder and darker than Phobos's, key ink in the shadows and a dusty rose tan (#D9C3AA) in the light. */
const DEIMOS_RAMP =
  '<feComponentTransfer in="lit2" result="ramp">' +
  '<feFuncR type="table" tableValues="0.118 0.196 0.318 0.471 0.627 0.753 0.851"/>' +
  '<feFuncG type="table" tableValues="0.11 0.17 0.267 0.392 0.525 0.651 0.765"/>' +
  '<feFuncB type="table" tableValues="0.102 0.153 0.231 0.329 0.443 0.561 0.667"/>' +
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
export const GROUND_BASE: Record<World, string> = { phobos: '#6f6a60', deimos: '#786454', mars: '#a04a2a' };

/** How much the fine noise roughens the ground: less on Deimos, whose deep dust smooths it over. */
const FINE: Record<World, number> = { phobos: 1, deimos: 0.85, mars: 1 };

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
        `<feOffset in="${height}" dx="${d}" dy="${d}" result="o${i}"/>` +
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
  const fine = FINE[world];
  const light = '<feDistantLight azimuth="225" elevation="22"/>';
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
    // flat ground (1.3 · sin 22°), so it only adds its relief. `H`, all in one, still makes the shine.
    `<feDiffuseLighting in="H0" kernelUnitLength="${LIT}" surfaceScale="${relief(7.65)}" diffuseConstant="1.3" lighting-color="#ffffff" result="LS">${light}</feDiffuseLighting>` +
    '<feComposite in="nzm" in2="rgm" operator="arithmetic" k2="0.7" k3="0.3" result="HN"/>' +
    `<feDiffuseLighting in="HN" kernelUnitLength="${LIT}" surfaceScale="${relief(4.3 * fine)}" diffuseConstant="1.3" lighting-color="#ffffff" result="LN">${light}</feDiffuseLighting>` +
    '<feComposite in="LS" in2="LN" operator="arithmetic" k2="1" k3="1" k4="-0.487" result="L"/>' +
    // Shadowed as read from the height map before its fine noise, as moving the noisy one makes Chrome work
    // it all out again for each shadow (~65 ms a time), and the noise's own shadows are too small to see.
    // Hard-edged, as the mechs' shadows, barely softened.
    shadow(
      'H0',
      [
        [1.2, -0.06],
        [2.5, -0.13],
        [5, -0.26],
        [9, -0.47],
      ],
      0.12,
      '#1E1C1A',
      0.85,
    ) +
    '<feMerge result="Ls"><feMergeNode in="L"/><feMergeNode in="SHD"/></feMerge>' +
    '<feColorMatrix in="ALB" type="matrix" values="0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 0 1" result="albG"/>' +
    '<feColorMatrix in="broad" type="matrix" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1" result="anG0"/>' +
    // The mottle evened out towards the rim, to where it leaves the brightness as it is: anG0 · rim + 0.49 (1 − rim).
    '<feComposite in="anG0" in2="rim" operator="arithmetic" k1="1" k3="-0.49" k4="0.49" result="anG"/>' +
    '<feComposite in="albG" in2="anG" operator="arithmetic" k2="1" k3="0.45" k4="-0.22" result="albN"/>' +
    '<feComposite in="Ls" in2="albN" operator="arithmetic" k1="2" result="lit"/>' +
    `<feSpecularLighting in="H" kernelUnitLength="${LIT}" surfaceScale="${relief(9)}" specularConstant="0.6" specularExponent="40" lighting-color="#e6f6ff" result="spec">${light}</feSpecularLighting>` +
    '<feComposite in="spec" in2="SMOOTH" operator="in" result="specM"/>' +
    '<feComposite in="lit" in2="specM" operator="arithmetic" k2="1" k3="0.7" result="lit2"/>' +
    RAMPS[world] +
    turbulence(1.4, 1, s(), 'grain') +
    '<feComposite in="ramp" in2="grain" operator="arithmetic" k2="1" k3="0.09" k4="-0.045"/>' +
    '</filter>'
  );
}

/**
 * The buildings' own light, over `area`: made, not weathered, so no fine noise, dust colour or grain, and
 * hard-edged, each standing up sharply from nothing, so its outline catches the light or falls in shadow.
 * Their heights are in the ground's map too, so they still cast their shadows on it.
 */
export function built(r: Rng, area: Box): string {
  const light = '<feDistantLight azimuth="225" elevation="38"/>';
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
    // Shadowed where something taller stands towards the light, as long as the ground's cast ones (a height
    // of 1 throws 42), so a ship's falls across its pad and a tank's across its deck.
    shadow(
      'H',
      [1, 2, 3.5, 5, 7, 9.5, 12.5, 16].map((d) => [d, -d / 42]),
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
 * How the buildings' cast shadows look (`cast`), for what the game draws standing on the ground to match: as
 * dark (`opacity`, of black), as sharp (`blur`, board units), and as long, down and to the right, `length` along
 * each axis for each unit of height (a gold tank some 20 tall throws its shadow about 19 on).
 */
export const SHADOW = { opacity: 0.85, blur: 0.45, length: 1 };

/**
 * The shadows the buildings cast on the ground, away from the light (to the bottom right), as long as
 * they're tall: each height (red, 128 the ground) stands in its shadow that much further along, so a dome
 * or a tank throws a long one and a deck or a pipe a short one. Over `area`.
 */
export function cast(area: Box): string {
  // Close enough that each height's shadow is 0.84 on from the last, so a little blur joins them.
  const levels = Array.from({ length: 23 }, (_, i) => 0.52 + i * 0.02);
  return (
    `<filter id="rg-cast" filterUnits="userSpaceOnUse" ${region(area)} color-interpolation-filters="sRGB">` +
    levels
      .map((t, i) => {
        const d = n((t - 0.5) * 42);
        return (
          `<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  40 0 0 0 ${n(-40 * t)}" result="a${i}"/>` +
          `<feOffset in="a${i}" dx="${d}" dy="${d}" result="s${i}"/>`
        );
      })
      .join('') +
    `<feMerge>${levels.map((_, i) => `<feMergeNode in="s${i}"/>`).join('')}</feMerge>` +
    // Just enough blur to join its steps, so its edge stays crisp.
    `<feGaussianBlur stdDeviation="${SHADOW.blur}"/>` +
    `<feComponentTransfer><feFuncA type="linear" slope="${SHADOW.opacity}"/></feComponentTransfer>` +
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
