import { dieLine } from '@regolith/art';
import { download, drawBands } from '../files';
import { cmykPdf, deflate, fullPage, type PdfImage, type PdfOptions } from './pdf';
import {
  cmykName,
  dieAt,
  fileName,
  pieceSize,
  printSvg,
  setName,
  sheetName,
  sizeNote,
  type Format,
  type Piece,
  type Printable,
} from './pieces';
import { PRESS, encodePng, pressTag, toCmyk } from './press';
import { A4, pressPages, printDocument, sheetsHtml, type Paper } from './sheets';
import { zip } from './zip';
import { GAME_NAME } from '../appId';

/** Print exports: one face as PNG, a whole set as PNGs, print sheets, and CMYK PDFs for a press (a file per card, or press sheets). */

export type Progress = (message: string) => void;

/** A file in a ZIP. */
type ZipFile = { name: string; blob: Blob };

/** A text file for a ZIP: a README, an order list. */
const textFile = (name: string, text: string, type = 'text/plain'): ZipFile => ({ name, blob: new Blob([text], { type }) });

const px = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

/** Lets the browser paint a new progress message before main-thread-bound work runs. */
const paint = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Draws an SVG document of `w` × `h` mm at a print resolution, opaque. A page too big for one canvas (the
 * A4 press test at 600 dpi, in iOS Safari) draws in bands overlapping by 17 mm, as far as the art's filters reach (files.ts `drawBands`).
 */
function drawForPrint(svg: string, w: number, h: number, dpi: number) {
  const width = px(w, dpi);
  const height = px(h, dpi);
  return { width, height, bands: drawBands(svg, width, height, '#fff', px(17, dpi)) };
}

/** Rasterises an SVG document of `w` × `h` mm at a print resolution: an opaque PNG, tagged sRGB and with its dpi. */
export async function svgToPng(svg: string, w: number, h: number, dpi: number): Promise<Blob> {
  const { width, height, bands } = drawForPrint(svg, w, h, dpi);
  return encodePng(bands, width, height, dpi);
}

/** One face as a PNG at the format's dpi. */
export async function exportPng(f: Format, item: Printable, bleed: boolean): Promise<void> {
  const { w, h } = pieceSize(f, bleed);
  download(fileName(f, item, { bleed, dpi: f.dpi, ext: 'png' }), await svgToPng(await printSvg(item, bleed), w, h, f.dpi));
}

/** A set as a ZIP: one PNG per face, named and foldered by the face's name, and a README. */
export async function exportZip(
  piece: Piece,
  items: Printable[],
  o: { bleed: boolean; part?: string; notes?: string },
  progress: Progress,
): Promise<void> {
  const { w, h } = pieceSize(piece, o.bleed);
  const files: ZipFile[] = [];
  for (const [k, item] of items.entries()) {
    progress(`Rendering ${k + 1}/${items.length}`);
    await paint();
    files.push({ name: `${item.name}.png`, blob: await svgToPng(await printSvg(item, o.bleed), w, h, piece.dpi) });
  }
  const readme =
    `${GAME_NAME} ${piece.plural}, ${sizeNote(piece, o.bleed)}.\n` +
    `PNG at ${piece.dpi} dpi, one file per face. RGB, tagged sRGB: please convert with your press profile.\n` +
    cutNote(piece, 'in cut.svg (the same size as each PNG)') +
    (o.notes ?? '');
  const cut = cutFile(piece, o.bleed);
  if (cut) files.push(cut);
  files.push(textFile('README.txt', readme));
  progress('Packing…');
  await paint();
  download(setName(piece, { part: o.part, tag: o.bleed ? 'bleed' : undefined }), await zip(files));
}

/** For a set's README: where a piece cut other than at its trim is cut, and where its cut line is. */
const cutNote = (piece: Piece, where: string) => (piece.die ? `Die-cut along the line ${where}, not at the trim.\n` : '');

/** A piece's die-cut line as an SVG the size of its PNGs (`cut.svg`), for a set's ZIP; none when it's cut at the trim. */
function cutFile(piece: Piece, bleed: boolean): ZipFile | null {
  if (!piece.die) return null;
  const b = bleed ? piece.bleed : 0;
  const { w, h } = pieceSize(piece, bleed);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">${dieLine(piece.die.line, b, b)}</svg>`;
  return textFile('cut.svg', svg, 'image/svg+xml');
}

/** Opens the print dialog on sheets of these faces at trim size; each distinct face is drawn once. */
export async function printSheets(
  piece: Piece,
  faces: { front: Printable; back?: Printable }[],
  o: { withBacks: boolean; paper: Paper },
  progress: Progress,
): Promise<void> {
  const unique = new Map<string, Printable>();
  for (const f of faces) {
    unique.set(f.front.name, f.front);
    if (o.withBacks && f.back) unique.set(f.back.name, f.back);
  }
  const { w, h } = pieceSize(piece, false);
  const urls = new Map<string, string>();
  const revokeAll = () => urls.forEach((u) => URL.revokeObjectURL(u));
  try {
    for (const [name, item] of unique) {
      progress(`Rendering ${urls.size + 1}/${unique.size}`);
      await paint();
      urls.set(name, URL.createObjectURL(await svgToPng(await printSvg(item, false), w, h, piece.dpi)));
    }
    progress('Opening print dialog…');
    await paint();
    const images = faces.map((f) => ({ front: urls.get(f.front.name)!, back: f.back && urls.get(f.back.name) }));
    await printDocument(sheetsHtml(piece, images, o), revokeAll);
  } catch (e) {
    revokeAll();
    throw e;
  }
}

/** A face drawn with its bleed at the format's dpi and converted to the press's CMYK (with the deep black or not), ready for a PDF page. */
async function cmykImage(f: Format, item: Printable, deep: boolean): Promise<PdfImage> {
  const { w, h } = pieceSize(f, true);
  const { width, height, bands } = drawForPrint(await printSvg(item, true), w, h, f.dpi);
  const data = await deflate(
    (async function* () {
      for await (const rgba of bands) yield toCmyk(rgba, deep);
    })(),
  );
  return { width, height, data };
}

/** A CMYK PDF for the press (pdf.ts), its output intent the press's printing condition. */
const pressPdf = (o: Omit<PdfOptions, 'condition' | 'conditionInfo'>) =>
  cmykPdf({ ...o, condition: PRESS.condition, conditionInfo: PRESS.profile });

/** A CMYK PDF of these images, one per page with the format's bleed, and a piece's cut line when it isn't cut at the trim. */
function cmykFile(f: Format, title: string, images: PdfImage[]): Blob {
  const { w, h } = pieceSize(f, true);
  const cuts = f.die && dieAt(f.die, f.bleed, f.bleed).line;
  const pages = images.map((_, k) => ({ ...fullPage(k, w, h), ...(cuts ? { cuts } : {}) }));
  return pressPdf({ title, w, h, bleed: f.bleed, images, pages });
}

/** One face as a CMYK PDF: the press test. */
export async function exportCmykPdf(f: Format, item: Printable, deep: boolean, progress?: Progress): Promise<void> {
  if (progress) {
    progress('Converting…');
    await paint();
  }
  const image = await cmykImage(f, item, deep);
  if (progress) {
    progress('Writing PDF…');
    await paint();
  }
  download(cmykName(f, item, deep), cmykFile(f, `${GAME_NAME} ${f.id} ${item.name}`, [image]));
}

/**
 * A set as CMYK PDFs for a print service that takes one file per piece (cards, Doxzoo): a ZIP with a
 * PDF per front, its back as page 2 when it has one (double-sided printing takes pages front, back),
 * every page with its bleed and no crop marks, converted for the press (press.ts `toCmyk`). `faces` has
 * every copy; how many of each to order goes in `order.csv`, not as repeated pages. Each back is drawn once.
 */
export async function exportCmykFiles(
  piece: Piece,
  faces: { front: Printable; back?: Printable }[],
  o: { part?: string; deep: boolean },
  progress: Progress,
): Promise<void> {
  const fronts = new Map<string, { face: (typeof faces)[number]; copies: number }>();
  for (const f of faces) {
    const seen = fronts.get(f.front.name);
    if (seen) seen.copies++;
    else fronts.set(f.front.name, { face: f, copies: 1 });
  }
  const total = fronts.size + new Set(faces.flatMap((f) => (f.back ? [f.back.name] : []))).size;
  let step = 0;
  const backs = new Map<string, PdfImage>();
  const files: ZipFile[] = [];
  const order = ['file,quantity,pages'];
  for (const { face, copies } of fronts.values()) {
    progress(`Converting ${++step}/${total}`);
    await paint();
    const images = [await cmykImage(piece, face.front, o.deep)];
    if (face.back) {
      if (!backs.has(face.back.name)) {
        progress(`Converting ${++step}/${total}`);
        await paint();
        backs.set(face.back.name, await cmykImage(piece, face.back, o.deep));
      }
      images.push(backs.get(face.back.name)!);
    }
    const name = `${face.front.name}.pdf`;
    files.push({ name, blob: cmykFile(piece, `${GAME_NAME} ${piece.id} ${face.front.name}`, images) });
    order.push(`${name},${copies},${images.length}`);
  }
  const readme =
    `${GAME_NAME} ${piece.plural}, ${sizeNote(piece, true)}.\n` +
    `One CMYK PDF per ${piece.id}, converted for ${PRESS.described}${o.deep ? ' (the darkest tones as a 100 % K rich black, within 300 % total ink)' : ''}, ${piece.dpi} dpi, no crop marks` +
    (faces.some((f) => f.back) ? ': page 1 the front, page 2 the back, for double-sided printing' : '') +
    `.\n${cutNote(piece, 'in each PDF’s CutContour spot colour')}How many of each to order: order.csv. Upload with "Do not scale".\n`;
  files.push(textFile('order.csv', order.join('\n') + '\n', 'text/csv'));
  files.push(textFile('README.txt', readme));
  progress('Packing…');
  await paint();
  download(setName(piece, { part: o.part, tag: pressTag(o.deep) }), await zip(files));
}

/** Pieces that print together on one stock, as one CMYK PDF of A4 press sheets (`exportCmykSheets`). */
export interface PressSheets {
  /** For the file name and the panel: `tiles-aids`, "Tiles + aids". */
  name: string;
  label: string;
  /** What's on the sheets, for the panel's note. */
  contents: string;
  /** Each piece and every copy of its faces, in page order; rejects if the fonts didn't load. */
  groups: () => Promise<{ piece: Piece; faces: Printable[] }[]>;
}

/**
 * Press sheets as one CMYK PDF: each piece in its sheet grid (sheets.ts `pressPages`), butted with crop
 * marks, single-sided, a new page for each piece. Every copy is placed; each distinct face is converted once.
 */
export async function exportCmykSheets(sheets: PressSheets, deep: boolean, progress: Progress): Promise<void> {
  const groups = await sheets.groups();
  const images: PdfImage[] = [];
  const index = new Map<string, number>();
  const total = new Set(groups.flatMap((g) => g.faces.map((f) => `${g.piece.id}/${f.name}`))).size;
  const pages = [];
  for (const { piece, faces } of groups) {
    const placed: number[] = [];
    for (const f of faces) {
      const key = `${piece.id}/${f.name}`;
      if (!index.has(key)) {
        progress(`Converting ${index.size + 1}/${total}`);
        await paint();
        index.set(key, images.push(await cmykImage(piece, f, deep)) - 1);
      }
      placed.push(index.get(key)!);
    }
    pages.push(...pressPages(piece, placed));
  }
  progress('Writing PDF…');
  await paint();
  download(sheetName(sheets.name, deep), pressPdf({ title: `${GAME_NAME} ${sheets.label}`, ...A4, bleed: 0, images, pages }));
}
