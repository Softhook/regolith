import { describe, expect, it } from 'vitest';
import {
  BLANK,
  PLANET_DIAMETER,
  SET_COUNTS,
  TILE_SET,
  TILE_SPOTS,
  TILE,
  assignTiles,
  editableTileSvg,
  numberCorner,
  numberPlacement,
  cubePadCentres,
  tileSpec,
  tileSvg,
} from '../src';
import { CUBE_PAD } from '../src/tokens';
import { boxGap } from '../src/tile/geometry';
import maps from '../../engine/src/data/maps.json';
import { parseToken } from '../../engine/src/board';
import { cardBackSvg, cardSvg, type CardDeck } from '../src/card';
import { ICONS } from '../src/icons';
import { CARD_CATEGORIES } from '../src/tokens';
import { rng } from '../src/rng';
import { MIN_TEXT, playerAidSvg } from '../src/aid';
import { mechDie } from '../src/screenprint/die';
import { PRESS_TEST, pressTestSvg } from '../src/proof';
import regolithCards from '../../engine/src/data/cards.json';
import { SCENES } from '../src/screenprint/scenes';
import { RIGS, type MechKind } from '../src/screenprint/mechs';
import { mech } from '../src/screenprint/pose';
import { INKS, ON_PAPER } from '../src/screenprint/inks';

const DIE = 19;

/** Checks that an SVG has no bad numbers, duplicate attributes, duplicate ids or broken `url(#…)` references. */
function checkSvg(svg: string, label = '') {
  expect(svg, label).not.toMatch(/NaN|undefined|Infinity/);
  expect(svg.startsWith('<svg'), label).toBe(true);
  for (const [tag] of svg.matchAll(/<[a-z][^>]*>/g)) {
    const names = [...tag.matchAll(/\s([\w:-]+)=/g)].map((m) => m[1]);
    expect(new Set(names).size, `${label}: ${tag.slice(0, 80)}`).toBe(names.length);
  }
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const idSet = new Set(ids);
  expect(idSet.size, `${label}: duplicate id`).toBe(ids.length);
  for (const [, ref] of svg.matchAll(/url\(#([^)]+)\)/g)) {
    expect(idSet.has(ref), `${label}: missing #${ref}`).toBe(true);
  }
}

describe('tile art', () => {
  it('is the same every time for the same tile', () => {
    const spec = tileSpec('p9-02');
    expect(tileSvg(spec, { markings: true })).toBe(tileSvg(tileSpec('p9-02'), { markings: true }));
  });

  it('differs between tiles', () => {
    expect(tileSvg(tileSpec('p7-01'))).not.toBe(tileSvg(tileSpec('p7-02')));
  });

  it('renders every tile in the set without bad numbers or broken references', () => {
    for (const t of TILE_SET) {
      for (const svg of [tileSvg(t, { markings: true, bleed: true }), tileSvg(t, { rounded: true })]) {
        checkSvg(svg, t.id);
      }
    }
  });

  it("exports for Illustrator with nothing it can't read: art as one image, markings as plain vectors, and the cut", () => {
    for (const t of TILE_SET) {
      const svg = editableTileSvg(t, 'data:image/png;base64,AAAA', { markings: true, bleed: true });
      expect(svg).not.toMatch(/<filter|<mask|clip-path|hsl\(|paint-order|dominant-baseline|NaN|undefined/);
      expect(svg).toContain('xlink:href="data:image/png');
      expect(svg).toContain('<g id="markings">');
      expect(svg).toContain('<g id="cut">');
    }
  });

  it('includes the bleed only when asked, without shifting any artwork', () => {
    const trim = tileSvg(tileSpec('p8-01'));
    const bled = tileSvg(tileSpec('p8-01'), { bleed: true });
    expect(trim).toContain('viewBox="0 0 96 96"');
    expect(bled).toContain('viewBox="-3 -3 102 102"');
    // Only the flower's clip grows, by the bleed.
    const art = (svg: string) => svg.slice(svg.indexOf('>') + 1).replace(/<clipPath id="[^"]*-flower">.*?<\/clipPath>/, '');
    expect(art(trim)).toBe(art(bled));
  });
});

describe('tile set', () => {
  it('has unique ids and the counts the set needs', () => {
    expect(new Set(TILE_SET.map((t) => t.id)).size).toBe(TILE_SET.length);
    expect(TILE_SET.length).toBe(Object.values(SET_COUNTS).reduce((a, b) => a + b, 0));
    expect(TILE_SET.some((t) => t.number === BLANK)).toBe(true);
  });

  it('rejects unknown or malformed tile ids', () => {
    for (const bad of ['p6-01', 'p11-01', 'p7-00', 'void-0', 'void-abc', 'blank-00', 'blank', 'foo']) {
      expect(() => tileSpec(bad), bad).toThrow(/Unknown tile id/);
    }
  });

  it('covers every map without running out of tiles', () => {
    const ids = new Set(TILE_SET.map((t) => t.id));
    for (const map of maps) {
      const tiles = map.layout
        .flat()
        .filter((x) => x !== '.')
        .map((x, index) => ({ index, number: parseToken(x).blank ? BLANK : parseToken(x).number }));
      for (const id of assignTiles(tiles).values()) expect(ids, `${map.id}: ${id}`).toContain(id);
    }
  });
});

describe('cube pads', () => {
  it('fit inside the printed planet', () => {
    for (const num of [7, 8, 9, 10]) {
      const R = PLANET_DIAMETER[num] / 2;
      const h = CUBE_PAD.size / 2;
      for (const p of cubePadCentres(num - 6, 0, 0)) {
        const far = Math.hypot(Math.abs(p.x) + h, Math.abs(p.y) + h);
        expect(far, `planet ${num}`).toBeLessThan(R);
      }
    }
  });
});

describe('planet number', () => {
  it('sits at the vertex three hexes share, a third of a space right and half a space down, unless its pads push it out', () => {
    for (const k of [7, 8, 9, 10]) {
      const at = numberPlacement(k);
      expect(at.y / at.x, `planet ${k}`).toBeCloseTo(Math.sqrt(3));
      expect(at.y, `planet ${k}`).toBeGreaterThanOrEqual(TILE.cell / 2);
    }
  });

  it('stays clear of the cube pads', () => {
    for (const num of [7, 8, 9, 10]) {
      const at = numberPlacement(num);
      for (const p of cubePadCentres(num - 6, 0, 0)) {
        expect(boxGap(at.x, at.y, at.halfW, at.halfH, p.x, p.y, CUBE_PAD.size / 2), `planet ${num} pad`).toBeGreaterThan(0.5);
      }
    }
  });

  it('goes in the corner nearest the middle', () => {
    expect(numberCorner({ x: 0, y: 0 })).toEqual({ x: 1, y: 1 });
    expect(numberCorner(TILE_SPOTS.sw)).toEqual({ x: 1, y: -1 });
    expect(numberCorner(TILE_SPOTS.n)).toEqual({ x: 1, y: 1 });
  });
});

describe('tile shape', () => {
  const seven = TILE_SET.find((t) => t.number === 7)!;
  const outlines = (svg: string) => (svg.match(/<polygon /g) ?? []).length;

  it('names the same planet spots as the engine reads from a layout token', () => {
    expect(Object.keys(TILE_SPOTS).sort()).toEqual(['', 'n', 'ne', 'nw', 's', 'se', 'sw']);
    for (const [dir, p] of Object.entries(TILE_SPOTS)) expect(Math.hypot(p.x, p.y)).toBeCloseTo(dir ? 1 : 0);
  });

  it('draws six hex outlines round its planet, cut to the flower', () => {
    const svg = tileSvg(seven, { markings: true, rounded: true });
    expect(outlines(svg)).toBe(6);
    expect(svg).toContain(`${seven.id}-flower`);
    expect(outlines(tileSvg(seven, { markings: true, planetAt: 'n' }))).toBe(6);
  });

  it('is knocked out past its flower: at the cut, or past it by the bleed', () => {
    const clip = (o: Parameters<typeof tileSvg>[1]) => /<clipPath id="[^"]*-flower"><path d="M([\d.]+) /.exec(tileSvg(seven, o))?.[1];
    // The first hex's right corner: 1/√3 of a space right of its middle, and 3 mm further (over cos 30°) with the bleed.
    expect(Number(clip({ rounded: true }))).toBeCloseTo(48 + 32 / Math.sqrt(3), 1);
    expect(Number(clip({ bleed: true }))).toBeCloseTo(48 + (32 + 6) / Math.sqrt(3), 1);
    expect(Number(clip({}))).toBeCloseTo(48 + 32 / Math.sqrt(3), 1);
  });
});

describe('player aid', () => {
  it('renders both editions without bad numbers or broken references', () => {
    for (const edition of ['regolith', 'basic'] as const) {
      const trim = playerAidSvg({ edition });
      const svg = playerAidSvg({ edition, bleed: true });
      checkSvg(svg, edition);
      expect(svg).toContain(`viewBox="-3 -3 154 111"`);
      expect(trim.slice(trim.indexOf('>') + 1)).toBe(svg.slice(svg.indexOf('>') + 1));
    }
  });

  it('keeps every line of text readable', () => {
    for (const edition of ['regolith', 'basic'] as const) {
      const sizes = [...playerAidSvg({ edition }).matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(sizes.length).toBeGreaterThan(20);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_TEXT);
    }
  });

  it('has a pad that fits a 19 mm die for power, and for research with cards', () => {
    expect(TILE.pad).toBeGreaterThanOrEqual(DIE + 4);
    const svg = playerAidSvg();
    expect(svg).toContain('POWER');
    expect(svg).toContain('RESEARCH');
    expect(svg.match(/width="24" height="24"/g)).toHaveLength(2);
    const basic = playerAidSvg({ edition: 'basic' });
    expect(basic).not.toContain('RESEARCH');
    expect(basic.match(/width="24" height="24"/g)).toHaveLength(1);
  });

  it('gives atomics and the rules that hold ground in both editions', () => {
    for (const edition of ['regolith', 'basic'] as const)
      for (const word of ['ATOMIC', 'ZONES', 'CONTESTED']) expect(playerAidSvg({ edition })).toContain(word);
  });

  it('has a pad for each of up to 7 cubes, with the win condition beside them', () => {
    for (const edition of ['regolith', 'basic'] as const) {
      const svg = playerAidSvg({ edition });
      expect(svg.match(new RegExp(`width="${CUBE_PAD.size}" height="${CUBE_PAD.size}"`, 'g'))).toHaveLength(7);
      expect(svg).toContain('PLACE YOUR LAST CUBE TO WIN');
    }
  });

  it('draws six different mechs on their dice', () => {
    const ships = [1, 2, 3, 4, 5, 6].map((v) => mechDie(v, 0, 0, 19).body);
    expect(new Set(ships).size).toBe(6);
    for (const s of ships) expect(s).not.toMatch(/NaN|undefined/);
  });
});

describe('press test', () => {
  it('renders an A4 page with every category, the ramps and the pieces it is given', () => {
    const svg = pressTestSvg({ tile: 'data:image/svg+xml,a', card: 'data:image/svg+xml,b' });
    checkSvg(svg, 'press-test');
    expect(svg).toContain(`viewBox="0 0 ${PRESS_TEST.w} ${PRESS_TEST.h}"`);
    for (const c of Object.values(CARD_CATEGORIES)) expect(svg).toContain(`>${c.label}<`);
    expect(svg.match(/<image /g)).toHaveLength(2);
  });
});

describe('screenprint cards', () => {
  type RegolithRawCard = (typeof regolithCards.skills | typeof regolithCards.tactics | typeof regolithCards.expansion)[number];
  const decks: [CardDeck, RegolithRawCard[]][] = [
    ['skill', regolithCards.skills],
    ['tactic', regolithCards.tactics],
    ['expansion', regolithCards.expansion],
  ];
  const faces = decks.flatMap(([deck, list]) => list.map((c, i) => ({ ...c, deck, copies: c.count, index: i + 1, deckSize: list.length })));

  it('gives every card a known category, so it has a colour and an icon', () => {
    for (const f of faces) expect(CARD_CATEGORIES[f.category], f.id).toBeDefined();
    for (const c of Object.keys(CARD_CATEGORIES)) expect(ICONS[c], c).toBeDefined();
  });

  it('is poker size, with bleed when asked', () => {
    expect(cardSvg(faces[0])).toContain('width="63.5mm" height="88.9mm"');
    expect(cardSvg(faces[0], { bleed: true })).toContain('width="69.5mm" height="94.9mm"');
  });

  it('has a scene for every Regolith card, and none for a card it lacks', () => {
    expect(Object.keys(SCENES).sort()).toEqual(faces.map((f) => f.id).sort());
  });

  it('ends no card’s rules on a line of one word', () => {
    for (const f of faces) {
      const lines = [...cardSvg(f).matchAll(/<text[^>]*Barlow Condensed[^>]*>(.*?)<\/text>/g)].map((m) =>
        m[1].replace(/<[^>]+>/g, '').trim(),
      );
      if (lines.length > 1) expect(lines[lines.length - 1], f.id).toContain(' ');
    }
  });

  it('draws every card and back without bad numbers or broken references, the same every time', () => {
    const fronts = faces.map((f) => cardSvg(f, { bleed: true, rounded: true }));
    fronts.forEach((svg, i) => checkSvg(svg, faces[i].id));
    expect(cardSvg(faces[0])).toBe(cardSvg({ ...faces[0] }));
    for (const [deck] of decks) checkSvg(cardBackSvg(deck, { bleed: true }), `back-${deck}`);
    // Each card's own scene: no two draw the same.
    const scenes = faces.map((f) =>
      SCENES[f.id].draw({
        id: 'x',
        r: rng(1),
        dark: false,
        world: SCENES[f.id].world,
        w: 63.5,
        h: 42,
        paper: INKS.paper,
        key: INKS.key,
        ink: ON_PAPER,
        plate: INKS.oxide,
        defs: [],
      }),
    );
    expect(new Set(scenes).size).toBe(scenes.length);
  });

  it('poses every mech front on and turned both ways, in 3D, without bad numbers', () => {
    for (const kind of Object.keys(RIGS) as MechKind[])
      for (const yaw of [0, 35, -35]) {
        const svg = mech(kind, {
          x: 0,
          y: 0,
          size: 1,
          pose: { yaw, legs: { plus: [-20, 30], minus: [15, 0] } },
          ink: ON_PAPER,
        });
        expect(svg, `${kind} ${yaw}`).not.toMatch(/NaN|undefined|Infinity/);
      }
  });
});
