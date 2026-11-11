import { GUIDE, type Line, type PdfPage, type Polygon, type Rect } from './pdf';
import { dieAt, type Piece } from './pieces';
import { GAME_NAME } from '../appId';

/** Sheets: pieces laid out on paper with crop marks, printed from the browser or as CMYK PDF pages for a press. */

export type Paper = 'a4' | 'letter';

/** The papers print sheets come on, mm; press sheets are always A4. */
export const PAPER: Record<Paper, { w: number; h: number; name: string }> = {
  a4: { w: 210, h: 297, name: 'A4' },
  letter: { w: 215.9, h: 279.4, name: 'US Letter' },
};

export const A4 = PAPER.a4;

/** How close to the paper's edge a home printer's crop marks may go, mm: most home printers can't print the outer 3–4 mm. */
const HOME_MARGIN = 4;

/** The shortest crop mark a home sheet's bleed may leave, mm: a sheet with less room has less bleed (`homeBleed`). */
const HOME_MARK = 2;

/** A piece's grid centred on the paper: its left, top, right and bottom, mm. */
function gridOf(piece: Piece, size: { w: number; h: number }) {
  const x0 = (size.w - piece.cols * piece.w) / 2;
  const y0 = (size.h - piece.rows * piece.h) / 2;
  return { x0, y0, x1: x0 + piece.cols * piece.w, y1: y0 + piece.rows * piece.h };
}

/**
 * Where a sheet puts a piece: its grid centred on the paper, pieces butted so one cut serves two, and
 * crop marks on every cut, in the margin from `gap` mm outside the grid to `margin` mm from the edge (5 mm long at most).
 */
function sheetLayout(piece: Piece, size: { w: number; h: number }, gap: number, margin: number) {
  const { w, h, cols, rows } = piece;
  const { x0, y0, x1, y1 } = gridOf(piece, size);
  const lenV = Math.min(5, y0 - gap - margin);
  const lenH = Math.min(5, x0 - gap - margin);
  const marks: Line[] = [];
  for (let i = 0; i <= cols; i++) {
    const x = x0 + i * w;
    marks.push([x, y0 - gap - lenV, x, y0 - gap], [x, y1 + gap, x, y1 + gap + lenV]);
  }
  for (let i = 0; i <= rows; i++) {
    const y = y0 + i * h;
    marks.push([x0 - gap - lenH, y, x0 - gap, y], [x1 + gap, y, x1 + gap + lenH, y]);
  }
  // A cut inside a piece's square (a hex tile's) gets a mark along it where, carried on, it leaves the grid: on the
  // margin it heads for, as far out as the grid's marks there. A cut that leaves its square into the next piece's
  // is carried on through it to the grid's edge, so every side of every piece has a mark at both ends of its line.
  const seen = new Set<string>();
  /** How far along a ray from `from`, going `d` on one axis, it reaches `lo` or `hi`. */
  const reach = (from: number, d: number, lo: number, hi: number) => (Math.abs(d) < 1e-9 ? Infinity : ((d > 0 ? hi : lo) - from) / d);
  for (let col = 0; col < cols; col++)
    for (let row = 0; row < rows; row++)
      for (const e of piece.die?.exits ?? []) {
        const [px, py] = [x0 + col * w + e.x, y0 + row * h + e.y];
        const [tx, ty] = [reach(px, e.dx, x0, x1), reach(py, e.dy, y0, y1)];
        const across = ty <= tx; // leaves the grid by the top or bottom
        const t = Math.max(0, Math.min(tx, ty));
        const [x, y] = [px + t * e.dx, py + t * e.dy];
        // Lines that run on through the next piece are often that piece's own: one mark serves both.
        const key = [x, y, e.dx, e.dy].map((v) => v.toFixed(2)).join();
        if (seen.has(key)) continue;
        seen.add(key);
        const out = across ? Math.abs(e.dy) : Math.abs(e.dx); // how fast it heads into the margin
        const [from, to] = [gap / out, (gap + (across ? lenV : lenH)) / out];
        marks.push([x + from * e.dx, y + from * e.dy, x + to * e.dx, y + to * e.dy]);
      }
  return { cell: (col: number, row: number): Rect => ({ x: x0 + col * w, y: y0 + row * h, w, h }), marks };
}

/** Polygons cut to a box (Sutherland–Hodgman, each polygon against the box's four sides); any left with no area are dropped. */
function clipToBox(polygons: Polygon[], box: Rect): Polygon[] {
  // How far inside each side a point is (negative: outside it).
  const sides: ((p: readonly [number, number]) => number)[] = [
    ([x]) => x - box.x,
    ([x]) => box.x + box.w - x,
    ([, y]) => y - box.y,
    ([, y]) => box.y + box.h - y,
  ];
  return polygons
    .map((poly) =>
      sides.reduce<Polygon>((pts, inside) => {
        const out: (readonly [number, number])[] = [];
        pts.forEach((p, i) => {
          const q = pts[(i + 1) % pts.length];
          const [dp, dq] = [inside(p), inside(q)];
          if (dp >= 0) out.push(p);
          if (dp >= 0 !== dq >= 0) {
            const t = dp / (dp - dq);
            out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
          }
        });
        return out;
      }, poly),
    )
    .filter((poly) => poly.length >= 3);
}

/** Faces split into pages of the piece's grid, each with its column and row. */
function pagesOf<T>(piece: Piece, faces: T[]): { face: T; col: number; row: number }[][] {
  const perPage = piece.cols * piece.rows;
  const pages = [];
  for (let p = 0; p < faces.length; p += perPage)
    pages.push(faces.slice(p, p + perPage).map((face, k) => ({ face, col: k % piece.cols, row: Math.floor(k / piece.cols) })));
  return pages;
}

/**
 * Sheets of pieces, as pdf.ts pages: the grid (`sheetLayout`), each face (an index into the images, drawn with the
 * piece's full bleed) showing `bleed` mm of it, so each block of pieces has that bleed all round. Faces are drawn in
 * reading order and each is cut at its cell's left and top where a piece is there: it covers the bleed of the piece
 * before it, which runs under it, so no seam can show between two pieces, and its own bleed never covers that
 * piece. Crop marks start clear of the bleed.
 * A piece die-cut other than at its trim (a hex tile, pieces.ts `Die`) shows only its shape with its bleed, cut
 * the same way, and has its cut line on the front (pdf.ts `cuts`), or with `handCut` a guide printed on it
 * (pdf.ts `guides`). With `backs` (one for each face, or none for a face without), each page is followed by its
 * backs, columns mirrored so they land behind their fronts printed double-sided on the long edge. A back page has
 * no cut line or guide: the cut through both sides follows the front.
 */
function sheetPages(
  piece: Piece,
  faces: number[],
  backs: (number | undefined)[] | undefined,
  o: { size: { w: number; h: number }; bleed: number; margin: number; handCut?: boolean },
): PdfPage[] {
  const { cell, marks } = sheetLayout(piece, o.size, o.bleed, o.margin);
  const b = o.bleed;
  const full = piece.bleed;
  /** One page, its cells in reading order, as the clipping needs. */
  const page = (cells: { image: number; col: number; row: number }[], front: boolean): PdfPage => {
    const has = (col: number, row: number) => cells.some((c) => c.col === col && c.row === row);
    const dies = cells.map(({ col, row }) => {
      const c = cell(col, row);
      return piece.die && dieAt(piece.die, c.x, c.y);
    });
    const images = cells.map(({ image, col, row }, k) => {
      const c = cell(col, row);
      const left = has(col - 1, row) ? 0 : b;
      const top = has(col, row - 1) ? 0 : b;
      const box = { x: c.x - left, y: c.y - top, w: c.w + left + b, h: c.h + top + b };
      const shape = dies[k]?.shape(b);
      return {
        image,
        at: { x: c.x - full, y: c.y - full, w: c.w + 2 * full, h: c.h + 2 * full },
        clip: shape ? clipToBox(shape, box) : box,
      };
    });
    // On the front only: the back is cut from it.
    const lines: Line[] = front ? dies.flatMap((d) => d?.line ?? []) : [];
    return { images, marks, ...(lines.length ? (o.handCut ? { guides: lines } : { cuts: lines }) : {}) };
  };
  return pagesOf(
    piece,
    faces.map((front, k) => ({ front, back: backs?.[k] })),
  ).flatMap((cells) => {
    const fronts = page(
      cells.map((c) => ({ image: c.face.front, col: c.col, row: c.row })),
      true,
    );
    const back = cells
      .flatMap((c) => (c.face.back === undefined ? [] : [{ image: c.face.back, col: piece.cols - 1 - c.col, row: c.row }]))
      .sort((p, q) => p.row - q.row || p.col - q.col);
    return back.length ? [fronts, page(back, false)] : [fronts];
  });
}

/**
 * How much bleed a home print sheet shows round each block, mm: the piece's own, less where the paper leaves no
 * room for it and a crop mark `HOME_MARK` long inside `HOME_MARGIN` (cards on US Letter), but at least 1 mm.
 */
export function homeBleed(piece: Piece, paper: Paper = 'a4'): number {
  const { x0, y0 } = gridOf(piece, PAPER[paper]);
  return Math.min(piece.bleed, Math.max(1, Math.min(x0, y0) - HOME_MARGIN - HOME_MARK));
}

/**
 * Home print sheets as pages (`sheetPages`), faces `0 … count - 1`: fronts only, with their bleed (`homeBleed`), so
 * a cut a little off still shows art, not paper; crop marks kept `HOME_MARGIN` from the paper's edge, and a die-cut
 * piece's cut printed as a guide to cut along by hand. Single-sided: a home printer's duplex puts a back
 * millimetres off its front, so two-sided pieces go to a press.
 */
export function homePages(piece: Piece, count: number, o: { paper?: Paper } = {}): PdfPage[] {
  const paper = o.paper ?? 'a4';
  const faces = Array.from({ length: count }, (_, k) => k);
  return sheetPages(piece, faces, undefined, { size: PAPER[paper], bleed: homeBleed(piece, paper), margin: HOME_MARGIN, handCut: true });
}

/** Millimetres as CSS pixels, which `clip-path: path()` takes: 96 to the inch, at print as on screen. */
const cssPx = (mm: number) => Number(((mm * 96) / 25.4).toFixed(3));
const num = (v: number) => Number(v.toFixed(3));

/** Lines as one SVG path's data, mm. */
const linesPath = (lines: readonly Line[]) => lines.map(([x1, y1, x2, y2]) => `M${num(x1)} ${num(y1)}L${num(x2)} ${num(y2)}`).join('');

/** A clip as a CSS `path()` in pixels from the top left of the image it clips (at `at`). */
function clipCss(clip: Rect | Polygon[], at: Rect): string {
  const polys: Polygon[] = Array.isArray(clip)
    ? clip
    : [
        [
          [clip.x, clip.y],
          [clip.x + clip.w, clip.y],
          [clip.x + clip.w, clip.y + clip.h],
          [clip.x, clip.y + clip.h],
        ],
      ];
  const d = polys.map((poly) => 'M' + poly.map(([x, y]) => `${cssPx(x - at.x)} ${cssPx(y - at.y)}`).join('L') + 'Z').join('');
  return `clip-path:path('${d}');-webkit-clip-path:path('${d}')`;
}

/**
 * Print sheets for home printing (`homePages`): faces (image URLs, each drawn with the piece's full bleed) placed
 * and clipped as on a press sheet, the crop marks and cut guides over them as SVG strokes, which print without
 * "Background graphics".
 */
export function sheetsHtml(piece: Piece, faces: string[], o: { paper?: Paper } = {}): string {
  const size = PAPER[o.paper ?? 'a4'];
  const html = homePages(piece, faces.length, o)
    .map((page) => {
      const images = page.images
        .map(
          ({ image, at, clip }) =>
            `<img src="${faces[image]}" style="left:${num(at.x)}mm;top:${num(at.y)}mm;width:${num(at.w)}mm;height:${num(at.h)}mm;${clip ? clipCss(clip, at) : ''}">`,
        )
        .join('');
      const guides = page.guides?.length
        ? `<path class="guide" d="${linesPath(page.guides)}" stroke="${GUIDE.rgb}" stroke-width="${GUIDE.width}"/>`
        : '';
      const lines =
        `<svg class="lines" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.w} ${size.h}" fill="none">` +
        `${guides}<path class="marks" d="${linesPath(page.marks ?? [])}" stroke="#000" stroke-width=".2"/></svg>`;
      return `<section class="sheet">${images}${lines}</section>`;
    })
    .join('');
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${GAME_NAME} ${piece.plural}</title><style>` +
    `@page{size:${size.w}mm ${size.h}mm;margin:0}html,body{margin:0}` +
    `.sheet{position:relative;width:${size.w}mm;height:${size.h}mm;overflow:hidden;break-after:page}` +
    `.sheet:last-child{break-after:auto}` +
    `.sheet img{position:absolute}.sheet svg.lines{position:absolute;left:0;top:0;width:${size.w}mm;height:${size.h}mm}` +
    `</style></head><body>${html}</body></html>`
  );
}

/**
 * Press sheets, as pdf.ts pages (`sheetPages`) on A4: each block of pieces with the piece's full bleed all round,
 * crop marks from just clear of it to 0.5 mm from the paper's edge. `handCut`, for a press that prints but doesn't
 * cut: a die-cut piece's fronts have a guide on the cut in place of the cut line. The art still runs its bleed past
 * it, so a hand cut a little outside the guide shows art, not paper; and so does a back printed a little off its front.
 */
export function pressPages(piece: Piece, faces: number[], backs?: (number | undefined)[], o: { handCut?: boolean } = {}): PdfPage[] {
  return sheetPages(piece, faces, backs, { size: A4, bleed: piece.bleed, margin: 0.5, handCut: o.handCut });
}

let finishPrint: (() => void) | null = null;

/** Prints an HTML document from a hidden frame, once its images have loaded. */
export async function printDocument(html: string, cleanup: () => void): Promise<void> {
  finishPrint?.();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (finishPrint === finish) finishPrint = null;
    frame.remove();
    cleanup();
  };
  // print() blocks until the dialog closes in most browsers; afterprint and a fallback timer cover those where it doesn't.
  // Safari may fire afterprint before its preview has read the images, so the frame stays a while after it.
  let timer = setTimeout(finish, 60_000);
  const afterPrint = () => {
    clearTimeout(timer);
    timer = setTimeout(finish, 5_000);
  };
  finishPrint = finish;
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await Promise.all([...doc.images].map((img) => img.decode().catch(() => undefined)));
  const win = frame.contentWindow;
  if (!win) {
    finish();
    return;
  }
  win.addEventListener('afterprint', afterPrint, { once: true });
  win.focus();
  win.print();
}
