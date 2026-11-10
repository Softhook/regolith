import type { Line, PdfPage, Rect } from './pdf';
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

/**
 * Where a sheet puts a piece: its grid centred on the paper, pieces butted so one cut serves two, and
 * crop marks on every cut, in the margin from `gap` mm outside the grid to `margin` mm from the edge (5 mm long at most).
 */
function sheetLayout(piece: Piece, size: { w: number; h: number }, gap: number, margin: number) {
  const { w, h, cols, rows } = piece;
  const x0 = (size.w - cols * w) / 2;
  const y0 = (size.h - rows * h) / 2;
  const x1 = x0 + cols * w;
  const y1 = y0 + rows * h;
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
  // margin it heads for, as far out as the grid's marks there.
  for (const e of piece.die?.exits ?? []) {
    const across = e.y < 1e-6 || e.y > h - 1e-6; // leaves by the top or bottom
    const out = across ? Math.abs(e.dy) : Math.abs(e.dx); // how fast it heads into the margin
    const [from, to] = [gap / out, (gap + (across ? lenV : lenH)) / out];
    const starts = across
      ? Array.from({ length: cols }, (_, c) => [x0 + c * w + e.x, e.y < 1e-6 ? y0 : y1])
      : Array.from({ length: rows }, (_, r) => [e.x < 1e-6 ? x0 : x1, y0 + r * h + e.y]);
    for (const [x, y] of starts) marks.push([x + from * e.dx, y + from * e.dy, x + to * e.dx, y + to * e.dy]);
  }
  return { size, cell: (col: number, row: number): Rect => ({ x: x0 + col * w, y: y0 + row * h, w, h }), marks };
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
 * Print sheets for home printing: faces (image URLs) at trim size, crop marks 1 mm outside the grid. A
 * piece die-cut other than at its trim (a hex tile) is knocked out past its cut, so the paper shows where to cut.
 * With backs, each page of fronts is followed by its backs, columns mirrored so they land behind their
 * fronts when printed double-sided on the long edge.
 */
export function sheetsHtml(
  piece: Piece,
  faces: { front: string; back?: string }[],
  o: { paper?: Paper; withBacks?: boolean } = {},
): string {
  const { size, cell, marks } = sheetLayout(piece, PAPER[o.paper ?? 'a4'], 1, HOME_MARGIN);
  // Less half the 0.2 mm line, so each mark is centred on its cut.
  const marksHtml = marks
    .map(([x1, y1, x2, y2]) => {
      if (x1 === x2) return `<i class="v" style="left:${x1 - 0.1}mm;top:${Math.min(y1, y2)}mm;height:${Math.abs(y2 - y1)}mm"></i>`;
      if (y1 === y2) return `<i class="h" style="top:${y1 - 0.1}mm;left:${Math.min(x1, x2)}mm;width:${Math.abs(x2 - x1)}mm"></i>`;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      return `<i class="d" style="left:${x1}mm;top:${y1 - 0.1}mm;width:${len}mm;transform:rotate(${angle}deg);transform-origin:0 0.1mm"></i>`;
    })
    .join('');
  const page = (cells: { src: string; col: number; row: number }[]) =>
    `<section class="sheet">${cells
      .map((c) => {
        const { x, y } = cell(c.col, c.row);
        return `<img src="${c.src}" style="left:${x}mm;top:${y}mm">`;
      })
      .join('')}${marksHtml}</section>`;
  let html = '';
  for (const cells of pagesOf(piece, faces)) {
    html += page(cells.map((c) => ({ src: c.face.front, col: c.col, row: c.row })));
    if (o.withBacks && cells.some((c) => c.face.back))
      html += page(cells.flatMap((c) => (c.face.back ? [{ src: c.face.back, col: piece.cols - 1 - c.col, row: c.row }] : [])));
  }
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${GAME_NAME} ${piece.plural}</title><style>` +
    `@page{size:${size.w}mm ${size.h}mm;margin:0}html,body{margin:0}` +
    `.sheet{position:relative;width:${size.w}mm;height:${size.h}mm;overflow:hidden;break-after:page}` +
    `.sheet:last-child{break-after:auto}` +
    `.sheet img{position:absolute;width:${piece.w}mm;height:${piece.h}mm}.sheet i{position:absolute;width:0;height:0}` +
    // Borders, not backgrounds: browsers drop background colours when printing unless "Background graphics" is on.
    `.sheet i.v{border-left:.2mm solid #000}.sheet i.h,.sheet i.d{border-top:.2mm solid #000}` +
    `</style></head><body>${html}</body></html>`
  );
}

/**
 * Press sheets, as pdf.ts pages: the print sheets' layout, each face (an index into the PDF's images)
 * drawn with its bleed, so each block of pieces has its bleed all round. Faces are drawn in reading
 * order and each is clipped at its cell's left and top where a piece is there: it covers the bleed of the
 * piece before it, which runs under it, so no seam can show between two pieces. Crop marks start clear of the bleed.
 * A piece die-cut other than at its trim (a hex tile, pieces.ts `Die`) shows only its shape with its bleed,
 * so no neighbour's knocked-out corner covers its bleed, and has its cut line on the page (pdf.ts `cuts`).
 */
export function pressPages(piece: Piece, faces: number[]): PdfPage[] {
  const { cell, marks } = sheetLayout(piece, A4, piece.bleed, 0.5);
  const b = piece.bleed;
  return pagesOf(piece, faces).map((cells) => {
    const has = (col: number, row: number) => cells.some((c) => c.col === col && c.row === row);
    const dies = cells.map(({ col, row }) => {
      const c = cell(col, row);
      return piece.die && dieAt(piece.die, c.x, c.y);
    });
    const images = cells.map(({ face, col, row }, k) => {
      const c = cell(col, row);
      const left = has(col - 1, row) ? 0 : b;
      const top = has(col, row - 1) ? 0 : b;
      return {
        image: face,
        at: { x: c.x - b, y: c.y - b, w: c.w + 2 * b, h: c.h + 2 * b },
        clip: dies[k]?.shape(b) ?? { x: c.x - left, y: c.y - top, w: c.w + left + b, h: c.h + top + b },
      };
    });
    const cuts: Line[] = dies.flatMap((d) => d?.line ?? []);
    return { images, marks, ...(cuts.length ? { cuts } : {}) };
  });
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
