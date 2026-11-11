import { GAME_NAME } from '../appId';

/**
 * A print PDF of CMYK images placed on pages, with crop marks when it's a sheet, made to the PDF/X-1a rules print services ask for: PDF 1.3,
 * CMYK only, no transparency or fonts (the faces are flattened images), each page's TrimBox and
 * BleedBox, and an output intent naming the press's registered printing condition (FOGRA39), so a
 * preflight and the printer's RIP know exactly what the CMYK means. A registered condition needs no
 * embedded profile, which keeps each PDF 1.4 MB smaller. Only a preflight (e.g. Acrobat's) can certify it.
 */

/** One flattened CMYK image: `width` × `height` px, its C M Y K bytes zlib-compressed (`deflate`). */
export interface PdfImage {
  width: number;
  height: number;
  data: Uint8Array<ArrayBuffer>;
}

/** A rectangle on the page, mm from its top left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A line from x1 y1 to x2 y2, mm from the top left. */
export type Line = readonly [number, number, number, number];

/** A polygon's corners [x, y], mm from the top left: polygons going the same way round join into one shape. */
export type Polygon = readonly (readonly [number, number])[];

export interface PdfPage {
  /**
   * Images drawn into `at`, an index into the PDF's `images` (one image can appear many times); only `clip`
   * of it shows, when given: a rectangle, or polygons that join into a shape.
   */
  images: { image: number; at: Rect; clip?: Rect | Polygon[] }[];
  /** Crop marks, 0.2 mm in black. */
  marks?: readonly Line[];
  /** Die-cut lines, in the `CutContour` spot colour print services cut along and don't print, overprinting so they knock nothing out. */
  cuts?: readonly Line[];
  /**
   * Lines printed to cut along by hand, in place of `cuts`: thin, in mid grey (`GUIDE`), so one stays visible on
   * a light ground or a dark one, and what's left of it on a tile's edge after a cut reads as an edge, not a frame.
   */
  guides?: readonly Line[];
}

/**
 * A hand-cutting guide's ink, CMYK 0–1, the sRGB it prints as for the home print sheets, and width, mm. To check
 * on a test print against each world's ground.
 */
export const GUIDE = { cmyk: [0, 0, 0, 0.5], rgb: '#8c8c8c', width: 0.15 } as const;

export interface PdfOptions {
  title: string;
  /** The page with its bleed, and the bleed on each side, mm: the TrimBox is the page less the bleed (none for a sheet). */
  w: number;
  h: number;
  bleed: number;
  /** The printing condition the CMYK was made for: an identifier in the ICC registry and its description. */
  condition: string;
  conditionInfo: string;
  images: PdfImage[];
  /** In print order (for duplex: front, back, front, back…). */
  pages: PdfPage[];
}

/** A page that is one image, edge to edge. */
export const fullPage = (image: number, w: number, h: number): PdfPage => ({ images: [{ image, at: { x: 0, y: 0, w, h } }] });

/**
 * Compresses bytes for a PDF `FlateDecode` stream or a PNG's image data (zlib format, which `deflate`
 * gives), taking them in pieces so a big image never has to be held whole: the compressed pieces.
 */
export async function deflateChunks(
  pieces: Iterable<Uint8Array<ArrayBuffer>> | AsyncIterable<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>[]> {
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const out: Uint8Array<ArrayBuffer>[] = [];
  // Read while writing, or the stream's queue fills and the writes never finish.
  const read = (async () => {
    for (let r = await reader.read(); !r.done; r = await reader.read()) out.push(r.value as Uint8Array<ArrayBuffer>);
  })();
  try {
    for await (const p of pieces) await writer.write(p);
    await writer.close();
  } catch (e) {
    read.catch(() => undefined);
    await writer.abort(e);
    throw e;
  }
  await read;
  return out;
}

/** The same, as one block of bytes. */
export async function deflate(
  pieces: Iterable<Uint8Array<ArrayBuffer>> | AsyncIterable<Uint8Array<ArrayBuffer>>,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Blob(await deflateChunks(pieces)).arrayBuffer());
}

/**
 * A page's resources for its cut lines: the `CutContour` spot colour (shown as magenta where it's
 * previewed) and overprinting, so the line takes nothing out of the art under it.
 */
const CUT_RESOURCES =
  ' /ColorSpace << /Cut [/Separation /CutContour /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 1 0 0] /N 1 >>] >>' +
  ' /ExtGState << /Cut << /Type /ExtGState /OP true /op true /OPM 1 >> >>';

const pt = (mm: number) => Math.round((mm / 25.4) * 72 * 1000) / 1000;
/** A PDF text string: brackets and backslashes escaped, ASCII only. */
const str = (s: string) => `(${s.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&')})`;
const date = (d: Date) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;

export function cmykPdf(o: PdfOptions): Blob {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const offsets: number[] = [];
  let at = 0;
  const write = (p: string | Uint8Array<ArrayBuffer>) => {
    const bytes = typeof p === 'string' ? enc.encode(p) : p;
    parts.push(bytes);
    at += bytes.length;
  };
  /** Object numbers: 1 catalog, 2 page tree, 3 info, 4 output intent, then the images, then a page and its content per page. */
  const imageRef = (k: number) => 5 + k;
  const pageRef = (k: number) => 5 + o.images.length + 2 * k;
  const object = (num: number, body: string | (() => void)) => {
    offsets[num] = at;
    write(`${num} 0 obj\n`);
    if (typeof body === 'string') write(body);
    else body();
    write('\nendobj\n');
  };

  // Binary marker in the header comment, so transfer tools treat the file as binary.
  write('%PDF-1.3\n%\xe2\xe3\xcf\xd3\n');
  const kids = o.pages.map((_, k) => `${pageRef(k)} 0 R`).join(' ');
  object(1, `<< /Type /Catalog /Pages 2 0 R /OutputIntents [4 0 R] >>`);
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${o.pages.length} >>`);
  const now = date(new Date());
  object(
    3,
    `<< /Title ${str(o.title)} /Creator (${GAME_NAME} Art Lab) /Producer (${GAME_NAME} Art Lab) /CreationDate (${now}) /ModDate (${now})` +
      ` /Trapped /False /GTS_PDFXVersion (PDF/X-1:2001) /GTS_PDFXConformance (PDF/X-1a:2001) >>`,
  );
  object(
    4,
    `<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier ${str(o.condition)} /OutputCondition ${str(o.conditionInfo)}` +
      ` /Info ${str(o.conditionInfo)} /RegistryName (http://www.color.org) >>`,
  );
  o.images.forEach((img, k) =>
    object(imageRef(k), () => {
      write(
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceCMYK` +
          ` /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.data.length} >>\nstream\n`,
      );
      write(img.data);
      write('\nendstream');
    }),
  );
  const W = pt(o.w);
  const H = pt(o.h);
  const b = pt(o.bleed);
  // PDF space is in points from the bottom left: a rectangle's bottom edge, and the rectangle as `re` takes it.
  const bottom = (r: Rect) => pt(o.h - r.y - r.h);
  const box = (r: Rect) => `${pt(r.x)} ${bottom(r)} ${pt(r.w)} ${pt(r.h)}`;
  // A clip as a path: a rectangle, or polygons the nonzero rule joins.
  const clipPath = (clip: Rect | Polygon[]) =>
    Array.isArray(clip)
      ? clip.map((poly) => poly.map(([x, y], i) => `${pt(x)} ${pt(o.h - y)} ${i ? 'l' : 'm'}`).join(' ') + ' h').join(' ')
      : `${box(clip)} re`;
  const lines = (list: readonly Line[]) =>
    list.map(([x1, y1, x2, y2]) => `${pt(x1)} ${pt(o.h - y1)} m ${pt(x2)} ${pt(o.h - y2)} l S`).join('\n');
  o.pages.forEach((page, k) => {
    const used = [...new Set(page.images.map((i) => i.image))];
    object(
      pageRef(k),
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /BleedBox [0 0 ${W} ${H}] /TrimBox [${b} ${b} ${pt(o.w - o.bleed)} ${pt(o.h - o.bleed)}]` +
        ` /Resources << /XObject << ${used.map((i) => `/Im${i} ${imageRef(i)} 0 R`).join(' ')} >>${page.cuts?.length ? CUT_RESOURCES : ''} >>` +
        ` /Contents ${pageRef(k) + 1} 0 R >>`,
    );
    let content = page.images
      .map(
        ({ image, at, clip }) =>
          `q ${clip ? `${clipPath(clip)} W n ` : ''}${pt(at.w)} 0 0 ${pt(at.h)} ${pt(at.x)} ${bottom(at)} cm /Im${image} Do Q`,
      )
      .join('\n');
    if (page.marks?.length) content += `\n0 0 0 1 K ${pt(0.2)} w\n` + lines(page.marks);
    if (page.guides?.length) content += `\nq ${GUIDE.cmyk.join(' ')} K ${pt(GUIDE.width)} w\n${lines(page.guides)}\nQ`;
    if (page.cuts?.length) content += `\nq /Cut gs /Cut CS 1 SCN ${pt(0.25)} w\n${lines(page.cuts)}\nQ`;
    const stream = enc.encode(content);
    object(pageRef(k) + 1, () => {
      write(`<< /Length ${stream.length} >>\nstream\n`);
      write(stream);
      write('\nendstream');
    });
  });

  const count = pageRef(o.pages.length);
  const xref = at;
  write(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) write(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('');
  write(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
