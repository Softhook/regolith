/** Print files: every piece fits its sheets with room for crop marks, backs land behind their fronts, press sheets bleed only round each block, names follow one pattern. */
import { describe, expect, it } from 'vitest';
import { PIECES, fileName, pieceSize, setName, sheetName, type Piece } from '../src/print/pieces';
import { hexTileShape } from '@regolith/art';
import type { Line, PdfPage, Polygon } from '../src/print/pdf';
import { A4, PAPER, homeBleed, homePages, pressPages, sheetsHtml, type Paper } from '../src/print/sheets';

const pieces = Object.values(PIECES) as Piece[];

/** Each sheet's images as [src, left, top] in mm. */
function sheets(html: string) {
  return html
    .split('<section class="sheet">')
    .slice(1)
    .map((s) =>
      [...s.matchAll(/<img src="([^"]*)" style="left:([\d.-]+)mm;top:([\d.-]+)mm/g)].map(
        (m) => [m[1], Number(m[2]), Number(m[3])] as const,
      ),
    );
}

/** Whether a point is inside a convex polygon (either way round), not on its edge. */
function inConvex(poly: Polygon, x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (Math.abs(c) < 1e-9) return false;
    if (!sign) sign = Math.sign(c);
    else if (Math.sign(c) !== sign) return false;
  }
  return true;
}

/** How many of a page's marks lie along the line through a side. */
const marksOn = (page: PdfPage, [x1, y1, x2, y2]: Line) => {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const off = (x: number, y: number) => Math.abs((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) / len;
  return page.marks!.filter(([a, b, c, d]) => off(a, b) < 0.01 && off(c, d) < 0.01).length;
};

describe('print sheets', () => {
  /** Every piece on every paper. */
  const onPaper = pieces.flatMap((p) => (Object.keys(PAPER) as Paper[]).map((paper) => ({ p, paper, id: p.id })));

  it.each(onPaper)('fit $id on $paper with a margin for crop marks', ({ p, paper }) => {
    expect((PAPER[paper].w - p.cols * p.w) / 2).toBeGreaterThan(5);
    expect((PAPER[paper].h - p.rows * p.h) / 2).toBeGreaterThan(5);
  });

  it.each(onPaper)('have bleed round each block, less only where the paper leaves no room ($id, $paper)', ({ p, paper }) => {
    const b = homeBleed(p, paper);
    expect(b).toBeGreaterThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(p.bleed);
    // Only cards on US Letter (6.35 mm above and below the grid) have less than the piece's own.
    if (!(p.id === 'card' && paper === 'letter')) expect(b).toBe(p.bleed);
    const [page] = homePages(p, 1, { paper });
    const [{ at, clip }] = page.images;
    // Each face is drawn with its full bleed and shows the home bleed of it.
    expect(at.w).toBeCloseTo(p.w + 2 * p.bleed);
    if (!p.die) expect(clip).toEqual({ x: at.x + p.bleed - b, y: at.y + p.bleed - b, w: p.w + 2 * b, h: p.h + 2 * b });
  });

  it.each(onPaper)(
    'keep the crop marks 4 mm inside the paper, where home printers print, and clear of the bleed ($id, $paper)',
    ({ p, paper }) => {
      const size = PAPER[paper];
      const b = homeBleed(p, paper);
      const x0 = (size.w - p.cols * p.w) / 2;
      const y0 = (size.h - p.rows * p.h) / 2;
      const [page] = homePages(p, p.cols * p.rows, { paper });
      for (const [x1, y1, x2, y2] of page.marks!) {
        expect(Math.hypot(x2 - x1, y2 - y1)).toBeGreaterThan(1);
        for (const [x, y] of [
          [x1, y1],
          [x2, y2],
        ]) {
          expect(x).toBeGreaterThanOrEqual(4 - 1e-9);
          expect(x).toBeLessThanOrEqual(size.w - 4 + 1e-9);
          expect(y).toBeGreaterThanOrEqual(4 - 1e-9);
          expect(y).toBeLessThanOrEqual(size.h - 4 + 1e-9);
          const inside = x > x0 - b + 1e-6 && x < x0 + p.cols * p.w + b - 1e-6 && y > y0 - b + 1e-6 && y < y0 + p.rows * p.h + b - 1e-6;
          expect(inside).toBe(false);
        }
      }
    },
  );

  it.each(pieces.filter((p) => !p.die))('put a crop mark at both ends of every cut ($id)', (p) => {
    const [page] = homePages(p, 1);
    expect(page.marks).toHaveLength(2 * (p.cols + 1) + 2 * (p.rows + 1));
  });

  it("marks where each of a hex tile's cuts inside its square, carried on, leaves it, pointing on along it", () => {
    const { w, h, die } = PIECES.tile;
    const exits = die!.exits!;
    const edges = exits.map((e) => (e.y < 1e-6 ? 'top' : e.y > h - 1e-6 ? 'bottom' : e.x < 1e-6 ? 'left' : 'right'));
    // 8 slanted lines, 4 exits on each edge; 2 level ones at 16 and 80 mm down, 2 more on each side.
    for (const [edge, count] of Object.entries({ top: 4, bottom: 4, left: 6, right: 6 }))
      expect(
        edges.filter((x) => x === edge),
        edge,
      ).toHaveLength(count);
    expect(
      exits
        .filter((e) => e.dy === 0)
        .map((e) => Math.round(e.y))
        .sort(),
    ).toEqual([16, 16, 80, 80]);
    for (const e of exits) {
      expect(e.x).toBeGreaterThanOrEqual(-1e-6);
      expect(e.x).toBeLessThanOrEqual(w + 1e-6);
      expect(Math.hypot(e.dx, e.dy)).toBeCloseTo(1);
      // Heading out of the square, not into it.
      const [ox, oy] = [e.x + e.dx, e.y + e.dy];
      expect(ox < 0 || ox > w || oy < 0 || oy > h).toBe(true);
      // On the line of a side of the cut, and going its way.
      const along = die!.line.filter(([x1, y1, x2, y2]) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const cross = (a: number, b: number) => (x2 - x1) * (b - y1) - (y2 - y1) * (a - x1);
        return Math.abs(cross(e.x, e.y)) / len < 1e-6 && Math.abs(Math.abs(((x2 - x1) * e.dx + (y2 - y1) * e.dy) / len) - 1) < 1e-9;
      });
      expect(along.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['home', (n: number) => homePages(PIECES.tile, n)],
    [
      'press',
      (n: number) =>
        pressPages(
          PIECES.tile,
          Array.from({ length: n }, (_, k) => k),
        ),
    ],
  ] as const)('mark both ends of the line of every side of every tile, a full page or one alone (%s)', (_, pagesFor) => {
    for (const n of [1, 4]) {
      const [page] = pagesFor(n);
      const lines = page.guides ?? page.cuts!;
      expect(lines).toHaveLength(18 * n);
      for (const side of lines) expect(marksOn(page, side), `${n} tiles: ${side.map((v) => v.toFixed(1))}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('fills pages in reading order, then starts a new page', () => {
    const p = PIECES.card;
    const pages = sheets(
      sheetsHtml(
        p,
        Array.from({ length: 10 }, (_, i) => `f${i}`),
      ),
    );
    expect(pages.map((s) => s.length)).toEqual([9, 1]);
    const [, x0, y0] = pages[0][0];
    expect(pages[0][4][0]).toBe('f4');
    expect(pages[0][4][1]).toBeCloseTo(x0 + p.w);
    expect(pages[0][4][2]).toBeCloseTo(y0 + p.h);
    expect(pages[1][0]).toEqual(['f9', x0, y0]);
  });

  it('print fronts only: a home duplex is too far off for backs', () => {
    expect(sheets(sheetsHtml(PIECES.card, ['f0', 'f1']))).toHaveLength(1);
  });

  it('clip each face to what shows of it, and draw the marks as SVG strokes, which print without "Background graphics"', () => {
    const html = sheetsHtml(PIECES.card, ['a', 'b']);
    expect(html).not.toMatch(/background/);
    expect(html).toMatch(/<img [^>]*clip-path:path\('M/);
    expect(html).toMatch(/<path class="marks" d="M[^"]+" stroke="#000"/);
    expect(html).toContain('.sheet:last-child{break-after:auto}');
    expect(sheets(html)).toHaveLength(1);
  });
});

describe('press sheets', () => {
  /** A square piece cut at its trim, four to a page. */
  const SQUARE: Piece = { id: 'tile', plural: 'tiles', w: 96, h: 96, bleed: 3, cols: 2, rows: 2, dpi: 300 };
  const { w, h, bleed: b } = SQUARE;
  const pages = pressPages(SQUARE, [0, 1, 2, 3, 4]);

  it('fills each page of the grid and starts a new one when it is full', () => {
    expect(pages.map((p) => p.images.length)).toEqual([4, 1]);
  });

  it('draws each face with its bleed, cut at its left and top where the piece before it is, so it covers that piece’s bleed', () => {
    const [topLeft, topRight, , bottomRight] = pages[0].images;
    const x0 = (A4.w - 2 * w) / 2;
    const y0 = (A4.h - 2 * h) / 2;
    expect(topLeft.at).toEqual({ x: x0 - b, y: y0 - b, w: w + 2 * b, h: h + 2 * b });
    // Its right and bottom bleed run under the pieces drawn after it: no seam between them.
    expect(topLeft.clip).toEqual(topLeft.at);
    expect(topRight.clip).toEqual({ x: x0 + w, y: y0 - b, w: w + b, h: h + 2 * b });
    expect(bottomRight.clip).toEqual({ x: x0 + w, y: y0 + h, w: w + b, h: h + b });
    // Alone on its page: bleed all round.
    expect(pages[1].images[0].clip).toEqual(pages[1].images[0].at);
  });

  it.each([PIECES.tile, PIECES.aid])('keeps the crop marks on the paper and clear of the bleed: $id', (piece) => {
    const { w, h, cols, rows, bleed } = piece;
    const x0 = (A4.w - cols * w) / 2;
    const y0 = (A4.h - rows * h) / 2;
    const [page] = pressPages(piece, [0]);
    for (const [x1, y1, x2, y2] of page.marks!) {
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(A4.w);
        expect(y).toBeLessThanOrEqual(A4.h);
        const e = 1e-6;
        const inside = x > x0 - bleed + e && x < x0 + cols * w + bleed - e && y > y0 - bleed + e && y < y0 + rows * h + bleed - e;
        expect(inside).toBe(false);
      }
    }
  });
});

describe('tiles', () => {
  const p = PIECES.tile;

  it('are die-cut along their flower: 18 sides joining into one loop inside the trim', () => {
    const cut = p.die!.line;
    expect(cut).toHaveLength(18);
    const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const ends = cut.flatMap(([x1, y1, x2, y2]) => [key(x1, y1), key(x2, y2)]);
    // Each corner of the loop ends two sides.
    for (const e of new Set(ends)) expect(ends.filter((x) => x === e)).toHaveLength(2);
    for (const [x1, y1, x2, y2] of cut) for (const v of [x1, y1, x2, y2]) expect(v > -1e-9 && v < p.w + 1e-9).toBe(true);
  });

  it('carry their cut line onto the press sheets, moved into each cell', () => {
    const [page] = pressPages(p, [0, 1]);
    expect(page.cuts).toHaveLength(2 * 18);
    const x0 = (A4.w - 2 * p.w) / 2;
    const [x1] = page.cuts![18];
    expect(x1).toBeCloseTo(x0 + p.w + p.die!.line[0][0]);
    expect(pressPages(PIECES.aid, [0])[0].cuts).toBeUndefined();
  });

  it('show only their flower with its bleed on the press sheets, its left cut where a tile is beside it', () => {
    const [page] = pressPages(p, [0, 1]);
    const x0 = (A4.w - 2 * p.w) / 2;
    const y0 = (A4.h - 2 * p.h) / 2;
    const xs = (k: number) => (page.images[k].clip as Polygon[]).flat().map(([x]) => x);
    // The flower is 92.4 mm across, 1.8 mm in from its box each side; with its bleed, 1.65 mm past the box.
    expect(Math.min(...xs(0))).toBeCloseTo(x0 + 1.81 - 3 / Math.cos(Math.PI / 6), 1);
    // Beside the first, the second's bleed stops at its box: the 3.6 mm between them is 1.8 mm of each one's bleed.
    expect(Math.min(...xs(1))).toBeCloseTo(x0 + p.w, 6);
    for (const { clip } of page.images)
      expect(Math.max(...(clip as Polygon[]).flat().map(([, y]) => y))).toBeCloseTo(y0 + p.h + p.bleed, 6);
  });

  it('never cover a tile drawn before with a later tile’s bleed, on the press sheets or at home', () => {
    for (const page of [pressPages(p, [0, 1, 2, 3], [4, 5, 6, 7]), homePages(p, 4)].flat()) {
      for (const [k, { at }] of page.images.entries()) {
        // The tile's own flower, a hair inside its cut.
        const flower = hexTileShape(-0.01).map((hex) => hex.map((q) => [q.x + at.x + p.bleed, q.y + at.y + p.bleed] as const));
        const later = page.images.slice(k + 1).flatMap((i) => i.clip as Polygon[]);
        for (let x = at.x; x < at.x + at.w; x += 0.5)
          for (let y = at.y; y < at.y + at.h; y += 0.5)
            if (flower.some((hex) => inConvex(hex, x, y)))
              expect(
                later.some((poly) => inConvex(poly, x, y)),
                `${x}, ${y}`,
              ).toBe(false);
      }
    }
  });

  it('have a cut that is its own mirror image, so a two-sided tile’s back lines up with its front', () => {
    // To the micron, and -0 as 0.
    const mm = (v: number) => Math.round(v * 1000) || 0;
    const key = ([x1, y1, x2, y2]: readonly number[]) => [`${mm(x1)},${mm(y1)}`, `${mm(x2)},${mm(y2)}`].sort().join(' ');
    const cut = new Set(p.die!.line.map(key));
    const mirrored = new Set(p.die!.line.map(([x1, y1, x2, y2]) => key([p.w - x1, y1, p.w - x2, y2])));
    expect(mirrored).toEqual(cut);
  });

  it('put each page’s backs after it, columns mirrored and in reading order, with no second cut line', () => {
    // Five fronts (0–4) and their backs (10–14): two pages of fronts, each followed by its backs.
    const pages = pressPages(p, [0, 1, 2, 3, 4], [10, 11, 12, 13, 14]);
    expect(pages.map((pg) => pg.images.map((i) => i.image))).toEqual([[0, 1, 2, 3], [11, 10, 13, 12], [4], [14]]);
    const x = (pg: number, k: number) => pages[pg].images[k].at.x;
    // A back lands behind its front: in the front's column, mirrored (10, behind 0, in the right-hand column).
    expect(x(1, 1)).toBeCloseTo(x(0, 1));
    expect(x(3, 0)).toBeCloseTo(x(0, 1));
    expect(pages.map((pg) => !!pg.cuts)).toEqual([true, false, true, false]);
  });

  it('cut by hand, print a guide on the fronts’ cut in place of the cut line, the art keeping its bleed', () => {
    const die = pressPages(p, [0, 1], [10, 11]);
    const hand = pressPages(p, [0, 1], [10, 11], { handCut: true });
    // The same art, clipped the same: each tile with its bleed past the cut, fronts and backs.
    expect(hand.map((pg) => pg.images)).toEqual(die.map((pg) => pg.images));
    expect(hand.map((pg) => !!pg.cuts)).toEqual([false, false]);
    expect(hand[0].guides).toEqual(die[0].cuts);
    expect(hand[1].guides).toBeUndefined();
  });

  it('can’t be cut along a whole line between two marks: 12 of the 18 sides carried on run through the tile', () => {
    // Shrunk a little, so a point on the cut isn't counted inside.
    const hexes = hexTileShape(-0.2);
    const inside = (x: number, y: number) =>
      hexes.some((h) => {
        let odd = false;
        for (let i = 0, j = h.length - 1; i < h.length; j = i++)
          if (h[i].y > y !== h[j].y > y && x < h[i].x + ((y - h[i].y) / (h[j].y - h[i].y)) * (h[j].x - h[i].x)) odd = !odd;
        return odd;
      });
    const through = p.die!.line.filter(([x1, y1, x2, y2]) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let t = -2 * p.w; t <= 2 * p.w; t += 0.5) {
        const [x, y] = [x1 + (t * (x2 - x1)) / len, y1 + (t * (y2 - y1)) / len];
        if (x > 0 && x < p.w && y > 0 && y < p.h && inside(x, y)) return true;
      }
      return false;
    });
    expect(through).toHaveLength(12);
  });

  it('print a grey guide on their cut on the home print sheets, never a cut line', () => {
    const [page] = homePages(p, 2);
    expect(page.cuts).toBeUndefined();
    expect(page.guides).toEqual(pressPages(p, [0, 1])[0].cuts);
    expect(sheetsHtml(p, ['a'])).toMatch(/<path class="guide" d="M[^"]+" stroke="#8c8c8c"/);
  });

  it('are named as tiles', () => {
    expect(fileName(p, { name: 'habitat-01-ne-mars', svg: () => '' }, { bleed: true, dpi: 300, ext: 'png' })).toBe(
      'regolith-tile-habitat-01-ne-mars-bleed-300dpi.png',
    );
  });
});

describe('print file names', () => {
  it('follow regolith-<piece>-<name>[-bleed][-<dpi>dpi] regolith-<pieces>[-<part>][-<tag>] and regolith-<name>-a4-<condition>', () => {
    const card = { name: 'skill/07-agile', svg: () => '' };
    expect(fileName(PIECES.card, card, { bleed: true, dpi: 300, ext: 'png' })).toBe('regolith-card-skill-07-agile-bleed-300dpi.png');
    expect(fileName(PIECES.tile, { name: 'p7-01', svg: () => '' }, { bleed: false, ext: 'svg' })).toBe('regolith-tile-p7-01.svg');
    expect(setName(PIECES.card, { part: 'community', tag: 'bleed' })).toBe('regolith-cards-community-bleed.zip');
    expect(setName(PIECES.tile, {})).toBe('regolith-tiles.zip');
    expect(sheetName('tiles-mars', false)).toBe('regolith-tiles-mars-a4-fogra39.pdf');
    expect(sheetName('tiles-mars', true)).toBe('regolith-tiles-mars-a4-fogra39-deep.pdf');
  });

  it('size pieces with their bleed on every side', () => {
    expect(pieceSize(PIECES.card, true)).toEqual({ w: 69.5, h: 94.9 });
    expect(pieceSize(PIECES.tile, false)).toEqual({ w: 96, h: 96 });
  });
});
