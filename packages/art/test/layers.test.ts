import { describe, expect, it } from 'vitest';
import {
  RASTER_AREA,
  TILE_LAYERS,
  editableTileSvg,
  rasterLayerSvg,
  standingMaskSvg,
  tileLayers,
  tileSpec,
  tileSvg,
  type World,
} from '../src';

/**
 * A tile as layers (tile/index.ts `tileLayers`): one order, which print, the Art Lab's editable export and
 * the map all draw from.
 */

const seven = tileSpec('p7-01');
const blank = tileSpec('blank-01');
const WORLDS = ['phobos', 'deimos', 'mars'] as const;
const names = (world: World, o: Parameters<typeof tileLayers>[1] = {}) => tileLayers(seven, { world, ...o }).map((l) => l.name);

describe('tile layers', () => {
  it('stack on the ground with what stands over the spaces’ outlines', () => {
    for (const world of WORLDS) expect(names(world, { markings: true })).toEqual(TILE_LAYERS);
  });

  it('carry markings only when asked, and what stands again only over the outlines', () => {
    expect(names('phobos')).toEqual(['ground']);
    expect(names('phobos', { markings: 'spaces' })).toEqual(['ground', 'spaces', 'standing']);
  });

  /** A tile's layers' drawing, by name, in order. */
  const body = (world: World, ...of: string[]) =>
    tileLayers(seven, { world, markings: true, bleed: true })
      .filter((l) => of.includes(l.name))
      .map((l) => l.art.body)
      .join('');

  it.each(WORLDS)('leave out of their raster part only what an editor keeps as vectors (%s)', (world) => {
    // The outlines are under what stands, so drawn with it.
    const o = { world, markings: true, bleed: true };
    expect(tileSvg(seven, { ...o, raster: true })).toBe(tileSvg(seven, o).replace(body(world, 'planet'), ''));
  });

  it('go into an editor as a bitmap and, over it, the vector layers in their group', () => {
    const editable = editableTileSvg(seven, 'x', { world: 'phobos', markings: true, bleed: true });
    expect(editable).toContain(`<g id="markings">${body('phobos', 'planet')}</g>`);
  });
});

describe('raster layers alone, for the map', () => {
  it('are drawn over their area, the ground and what stands on it over the bleed', () => {
    const viewBox = (svg: string) => /viewBox="([^"]+)"/.exec(svg)![1];
    const box = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => `${x} ${y} ${w} ${h}`;
    expect(viewBox(rasterLayerSvg(seven, 'phobos'))).toBe(box(RASTER_AREA.ground));
    expect(viewBox(standingMaskSvg(seven))).toBe(box(RASTER_AREA.standing));
  });

  it('have the ground built where the planet sits', () => {
    expect(rasterLayerSvg(seven, 'phobos', { x: 0, y: -1 })).not.toBe(rasterLayerSvg(seven, 'phobos'));
  });
});

describe('a blank tile', () => {
  const layer = (spec: typeof seven, world: World, name: string) =>
    tileLayers(spec, { world, markings: true }).find((l) => l.name === name)?.art.body;

  it('is open ground: seven outlines, without a Void’s research flask, and nothing on it', () => {
    expect(layer(blank, 'mars', 'planet')).toBe('');
    expect(layer(blank, 'mars', 'spaces')!.match(/<polygon/g)).toHaveLength(7);
    // The flask's faint stroke, which a Void's spaces have.
    expect(layer(tileSpec('void'), 'mars', 'spaces')).toContain('stroke-opacity=".15"');
    expect(layer(blank, 'mars', 'spaces')).not.toContain('stroke-opacity=".15"');
  });

  it('has bare ground on a world, with nothing standing on it', () => {
    for (const world of WORLDS) {
      expect(layer(blank, world, 'ground')).toBeTruthy();
      expect(layer(blank, world, 'standing')).toBeUndefined();
    }
  });
});
