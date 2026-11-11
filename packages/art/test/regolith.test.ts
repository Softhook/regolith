import { describe, expect, it } from 'vitest';
import {
  BLED,
  REGOLITH_GROUND_PX,
  REGOLITH_SHADOW,
  TILE_SPOTS,
  rasterLayerSvg,
  tileGroundSvg,
  tileSpec,
  tileSvg,
  type World,
} from '../src';
import { LIT, SCALE } from '../src/regolith/core';

/**
 * How a tile on a world's ground prints with smooth ground (regolith/core.ts `LIT`): its lit ground
 * drawn at the pixel its light is made for, as a bitmap, with what stands on it drawn over it as vectors.
 * How it looks is checked in Chrome: npm run ground:check.
 */

const spec = tileSpec('p7-01');
const IMAGE = 'data:image/png;base64,AAAA';
/** A tile's lit ground alone, with its objective `at` a space. */
const groundOf = (world: World, objectiveAt?: string) => tileGroundSvg(spec, { world, objectiveAt });
/** The ids of the filters a document draws with. */
const filters = (svg: string) => new Set([...svg.matchAll(/filter="url\(#([\w-]+)\)"/g)].map((m) => m[1]));

describe('regolith ground in print', () => {
  it('is drawn at the pixel its light is made for', () => {
    expect(BLED.w / SCALE / REGOLITH_GROUND_PX).toBeCloseTo(LIT, 3);
    expect(groundOf('phobos')).toContain(`kernelUnitLength="${LIT}"`);
  });

  it.each(['phobos', 'deimos', 'mars'] as const)('has a space between its attributes, as an image must be XML (%s)', (world) => {
    // A browser draws a run-on attribute inline but can't decode it as an image, so the tile fails to print.
    expect(groundOf(world).match(/="[^"]*"[^\s/>]/g)).toBeNull();
  });

  it.each(['phobos', 'deimos', 'mars'] as const)('is the lit ground alone, with nothing standing on it (%s)', (world) => {
    const used = filters(groundOf(world));
    expect(used.has('rg-ground')).toBe(true);
    for (const standing of ['rg-built', 'rg-cast', 'rg-dust']) expect(used.has(standing)).toBe(false);
  });

  it.each(Object.keys(TILE_SPOTS))("is the tile's own ground, levelled round its objective's space (%s)", (at) => {
    const ground = groundOf('mars', at);
    // Up to the end of the lit ground, the tile's ground starts the same: what stands on it follows.
    const lit = ground.slice(0, ground.lastIndexOf('</g></g>'));
    expect(rasterLayerSvg(spec, 'mars', TILE_SPOTS[at]).startsWith(lit)).toBe(true);
    if (at) expect(ground).not.toBe(groundOf('mars'));
  });

  it.each(['phobos', 'deimos', 'mars'] as const)('goes in a tile as a bitmap, over its trim and bleed, under what stands (%s)', (world) => {
    const svg = tileSvg(spec, { world, bleed: true, markings: true, ground: IMAGE });
    expect(filters(svg).has('rg-ground')).toBe(false);
    expect(filters(svg).has('rg-built')).toBe(true);
    const image = svg.match(/<image href="([^"]*)" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    expect(image?.[1]).toBe(IMAGE);
    const [x, y, w, h] = image!.slice(2).map((v) => Number(v) * SCALE);
    expect([x, y, w, h].map((v) => Math.round(v * 100) / 100)).toEqual([BLED.x, BLED.y, BLED.w, BLED.h]);
    expect(svg.indexOf(IMAGE)).toBeLessThan(svg.indexOf('url(#rg-built)'));
  });

  it("is Deimos's own: its craters buried in dust, no dunes, streaked bright", () => {
    const [phobos, deimos, mars] = (['phobos', 'deimos', 'mars'] as const).map((world) => groundOf(world));
    expect(deimos).toContain('href="#rg-cr-b"');
    expect(deimos).toContain('mix-blend-mode: lighten" opacity="0.9"');
    expect(deimos).not.toContain('rg-dunes');
    expect(phobos).not.toContain('#rg-cr-b"');
    expect(mars).not.toContain('#rg-cr-b"');
  });

  it("is Phobos's own: grooved, dark and lit by a low sun, where Deimos is light under a high one", () => {
    const [phobos, deimos, mars] = (['phobos', 'deimos', 'mars'] as const).map((world) => groundOf(world));
    const grooved = 'stroke="rgb(238,255,255)"';
    expect(phobos).toContain(grooved);
    expect(deimos).not.toContain(grooved);
    expect(mars).not.toContain(grooved);
    expect(phobos).toContain('elevation="15"');
    expect(deimos).toContain('elevation="34"');
  });

  it("casts every shadow from its world's sun: long and dark on Phobos, short and faint on Deimos, Mars's as tuned", () => {
    expect(REGOLITH_SHADOW.length.mars).toBe(1);
    expect(REGOLITH_SHADOW.length.phobos).toBeGreaterThan(1);
    expect(REGOLITH_SHADOW.length.deimos).toBeLessThan(1);
    expect(REGOLITH_SHADOW.opacity.phobos).toBeGreaterThan(REGOLITH_SHADOW.opacity.deimos);
    // The buildings lit 16° above the ground, from the same sun.
    const built = (world: World) => tileSvg(spec, { world, bleed: true }).match(/id="rg-built".*?elevation="(\d+)"/)?.[1];
    expect([built('phobos'), built('deimos'), built('mars')]).toEqual(['31', '50', '38']);
  });

  it('is lit by its filter when no bitmap is given', () => {
    expect(filters(tileSvg(spec, { world: 'phobos', bleed: true })).has('rg-ground')).toBe(true);
  });
});
