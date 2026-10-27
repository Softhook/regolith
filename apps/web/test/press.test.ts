/** Files for a press: the CMYK conversion follows its table, and the CMYK PDF is well formed with the boxes and intent PDF/X wants. */
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SPACE_BASE, hslToRgb } from '@regolith/art';
import { CMYK_TABLE } from '../src/print/cmykTable';
import { cmykPdf, deflate, fullPage } from '../src/print/pdf';
import { encodePng, toCmyk } from '../src/print/press';
import { crc32, zip } from '../src/print/zip';

const table = Uint8Array.from(atob(CMYK_TABLE.data), (c) => c.charCodeAt(0));
const N = CMYK_TABLE.grid;
const px = (...rgb: number[]) => toCmyk(Uint8ClampedArray.from([...rgb, 255]));

describe('CMYK conversion', () => {
  it('gives the table exactly at its grid points', () => {
    for (const [i, j, k] of [
      [0, 0, 0],
      [N - 1, N - 1, N - 1],
      [3, 9, 14],
      [17, 0, 8],
    ]) {
      const v = (g: number) => Math.round((g * 255) / (N - 1));
      const at = ((i * N + j) * N + k) * 4;
      expect([...px(v(i), v(j), v(k))]).toEqual([...table.subarray(at, at + 4)]);
    }
  });

  it('prints white as no ink and black as a rich black within the press limit', () => {
    expect([...px(255, 255, 255)]).toEqual([0, 0, 0, 0]);
    const black = [...px(0, 0, 0)];
    const total = black.reduce((a, b) => a + b, 0) / 2.55;
    expect(black[3]).toBeGreaterThan(200);
    expect(total).toBeGreaterThan(280);
    expect(total).toBeLessThanOrEqual(340);
  });

  it('keeps the darkest tones of the art apart (black point compensation)', () => {
    const ink = (v: number) => px(v, v, v).reduce((a, b) => a + b, 0);
    expect(ink(0)).toBeGreaterThan(ink(8));
    expect(ink(8)).toBeGreaterThan(ink(16));
  });
});

describe('CMYK deep black', () => {
  const base = hslToRgb(...SPACE_BASE).map((v) => Math.round(v * 255));
  /** The base's brightest channel: the deep black fades out from it to twice it. */
  const top = Math.max(...base);
  const deep = (...rgb: number[]) => [...toCmyk(Uint8ClampedArray.from([...rgb, 255]), true)];
  const pct = (cmyk: number[]) => cmyk.map((v) => Math.round(v / 2.55));
  const total = (cmyk: number[]) => cmyk.reduce((a, b) => a + b, 0) / 2.55;

  it('prints black and the space base with full black ink, black the deeper', () => {
    expect(pct(deep(0, 0, 0))).toEqual([90, 70, 35, 100]);
    expect(pct(deep(...base))).toEqual([80, 65, 42, 100]);
    expect(pct(deep(5, 6, 11))[3]).toBe(100);
  });

  it('fades back to the profile above the base, within the press limit throughout', () => {
    for (let v = 0; v <= 2 * top + 10; v++) {
      expect(total(deep(v, v, v))).toBeLessThanOrEqual(300.5);
      expect(total(deep(v / 2, v * 0.7, v))).toBeLessThanOrEqual(300.5);
    }
    const k = (v: number) => deep(v / 3, v / 2, v)[3];
    expect(k(top * 1.15)).toBeGreaterThan(k(top * 1.5));
    expect(k(top * 1.5)).toBeGreaterThan(k(top * 1.85));
  });

  it('leaves everything lighter than twice the base as the profile has it', () => {
    for (const rgb of [
      [42, 55, 77],
      [84, 21, 61],
      [2 * top + 10, 5, 5],
      [255, 255, 255],
      [99, 152, 227],
    ])
      expect(deep(...rgb)).toEqual([...px(...rgb)]);
  });
});

describe('CMYK PDF', () => {
  const image = async (w: number, h: number) => ({ width: w, height: h, data: await deflate([new Uint8Array(w * h * 4).fill(100)]) });

  it('has an xref pointing at every object, page boxes and the output intent', async () => {
    const pdf = cmykPdf({
      title: 'Test (cards)',
      w: 69.5,
      h: 94.9,
      bleed: 3,
      condition: 'FOGRA39',
      conditionInfo: 'Coated FOGRA39',
      images: [await image(4, 6), await image(4, 6)],
      pages: [0, 1, 0, 1].map((k) => fullPage(k, 69.5, 94.9)),
    });
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.3')).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const entries = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(4 + 2 + 2 * 4);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    expect(text).toContain('/Count 4');
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2);
    expect(text).toContain('/MediaBox [0 0 197.008 269.008]');
    expect(text).toContain('/TrimBox [8.504 8.504 188.504 260.504]');
    expect(text).toContain('/OutputConditionIdentifier (FOGRA39)');
    expect(text).toContain('/RegistryName (http://www.color.org)');
    expect(text).not.toContain('/DestOutputProfile');
    expect(text).toContain('/GTS_PDFXVersion (PDF/X-1:2001)');
    expect(text).toContain('/Title (Test \\(cards\\))');
    expect(text).not.toMatch(/DeviceRGB|\/Font|\/SMask/);
  });

  it('clips an image to polygons that join into a shape', async () => {
    const pdf = cmykPdf({
      title: 'Shape',
      w: 210,
      h: 297,
      bleed: 0,
      condition: 'FOGRA39',
      conditionInfo: 'Coated FOGRA39',
      images: [await image(2, 2)],
      pages: [
        {
          images: [
            {
              image: 0,
              at: { x: 0, y: 0, w: 10, h: 10 },
              clip: [
                [
                  [0, 0],
                  [10, 0],
                  [0, 10],
                ],
              ],
            },
          ],
        },
      ],
    });
    const text = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    expect(text).toContain('q 0 841.89 m 28.346 841.89 l 0 813.543 l h W n ');
  });

  it('draws die-cut lines in a CutContour spot colour that overprints, only on pages that have them', async () => {
    const pdf = cmykPdf({
      title: 'Hex',
      w: 210,
      h: 297,
      bleed: 0,
      condition: 'FOGRA39',
      conditionInfo: 'Coated FOGRA39',
      images: [await image(2, 2)],
      pages: [
        { images: [{ image: 0, at: { x: 0, y: 0, w: 10, h: 10 } }], cuts: [[0, 0, 10, 0]] },
        { images: [{ image: 0, at: { x: 0, y: 0, w: 10, h: 10 } }] },
      ],
    });
    const text = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    expect(text.match(/\/Separation \/CutContour \/DeviceCMYK/g)).toHaveLength(1);
    expect(text).toContain('/OP true');
    expect(text).toContain('q /Cut gs /Cut CS 1 SCN 0.709 w\n0 841.89 m 28.346 841.89 l S\nQ');
    expect(text).not.toMatch(/DeviceRGB/);
  });

  it('places clipped images and crop marks on a sheet, from the top left', async () => {
    const pdf = cmykPdf({
      title: 'Sheet',
      w: 210,
      h: 297,
      bleed: 0,
      condition: 'FOGRA39',
      conditionInfo: 'Coated FOGRA39',
      images: [await image(2, 2)],
      pages: [
        { images: [{ image: 0, at: { x: 10, y: 20, w: 50, h: 50 }, clip: { x: 13, y: 23, w: 44, h: 44 } }], marks: [[13, 0, 13, 5]] },
      ],
    });
    const text = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    expect(text).toContain('/TrimBox [0 0 595.276 841.89]');
    expect(text).toContain('/XObject << /Im0 5 0 R >>');
    expect(text).toContain('q 36.85 651.969 124.724 124.724 re W n 141.732 0 0 141.732 28.346 643.465 cm /Im0 Do Q');
    expect(text).toContain('0 0 0 1 K 0.567 w\n36.85 841.89 m 36.85 827.717 l S');
  });
});

describe('PNG', () => {
  /** Undoes the PNG filters, so the encoder's pixels can be read back. */
  function unfilter(data: Uint8Array, w: number, h: number) {
    const n = w * 3;
    const out = new Uint8Array(n * h);
    for (let r = 0; r < h; r++) {
      const type = data[r * (n + 1)];
      for (let i = 0; i < n; i++) {
        const a = i < 3 ? 0 : out[r * n + i - 3];
        const b = r ? out[(r - 1) * n + i] : 0;
        const c = r && i >= 3 ? out[(r - 1) * n + i - 3] : 0;
        const p = a + b - c;
        const pred =
          type === 4
            ? Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
              ? a
              : Math.abs(p - b) <= Math.abs(p - c)
                ? b
                : c
            : 0;
        out[r * n + i] = data[r * (n + 1) + 1 + i] + pred;
      }
    }
    return out;
  }

  it('writes RGB pixels from bands of rows, with an sRGB profile and the resolution, and nothing else', async () => {
    const w = 5;
    const h = 7;
    const rgba = Uint8ClampedArray.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256));
    // Bands of 3, 3 and 1 rows, as drawBands gives them.
    async function* bands() {
      for (let y = 0; y < h; y += 3) yield rgba.slice(y * w * 4, Math.min(h, y + 3) * w * 4);
    }
    const out = new Uint8Array(await (await encodePng(bands(), w, h, 300)).arrayBuffer());
    expect([...out.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(out.buffer);
    const types: string[] = [];
    const idat: Uint8Array[] = [];
    for (let at = 8; at < out.length;) {
      const len = view.getUint32(at);
      const type = new TextDecoder().decode(out.subarray(at + 4, at + 8));
      types.push(type);
      expect(view.getUint32(at + 8 + len)).toBe(crc32(out.subarray(at + 4, at + 8 + len)));
      if (type === 'IHDR') expect([view.getUint32(at + 8), view.getUint32(at + 12), out[at + 16], out[at + 17]]).toEqual([w, h, 8, 2]);
      if (type === 'pHYs') expect(view.getUint32(at + 8)).toBe(11811);
      if (type === 'IDAT') idat.push(out.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    expect([...new Set(types)]).toEqual(['IHDR', 'iCCP', 'pHYs', 'IDAT', 'IEND']);
    const pixels = unfilter(inflateSync(Buffer.concat(idat)), w, h);
    expect([...pixels]).toEqual([...rgba].filter((_, i) => i % 4 !== 3));
  });
});

describe('ZIP', () => {
  it('stores each file whole, with its name, size and checksum, readable by unzip tools', async () => {
    const files = [
      { name: 'skill/01-agile.pdf', blob: new Blob([new Uint8Array(3000).fill(9)]) },
      { name: 'order.csv', blob: new Blob(['file,quantity\n']) },
    ];
    const bytes = new Uint8Array(await (await zip(files)).arrayBuffer());
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    let at = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer());
      expect(view.getUint32(at, true)).toBe(0x04034b50);
      expect(view.getUint32(at + 14, true)).toBe(crc32(data));
      expect(view.getUint32(at + 18, true)).toBe(data.length);
      const nameLength = view.getUint16(at + 26, true);
      expect(new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLength))).toBe(f.name);
      expect(bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + data.length)).toEqual(data);
      at += 30 + nameLength + data.length;
    }
    expect(view.getUint32(at, true)).toBe(0x02014b50);
  });
});
