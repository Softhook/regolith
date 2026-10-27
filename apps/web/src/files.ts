import { dataUrl } from '@regolith/art';

/** Browser file helpers: saving downloads, and drawing SVG documents to bitmaps. */

/** Saves a blob as a download. */
export function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

async function loadSvg(svg: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = dataUrl(svg);
  await img.decode();
  return img;
}

/** Draws an SVG document to a `w` × `h` px transparent canvas. */
export async function drawSvg(svg: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const img = await loadSvg(svg);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** The most pixels one canvas holds here: under iOS Safari's limit (16.7 M px, 4096²), which an A4 page at 600 dpi (35 M) is over. */
const CANVAS_PIXELS = 16_000_000;

/**
 * Draws an SVG document at `w` × `h` px over an opaque `background`: its RGBA pixels in bands of rows, top
 * to bottom. Drawn `oversample` times larger and scaled down, because the art's lighting filters work pixel
 * by pixel, so at the drawn size the light along every outline steps from pixel to pixel; drawn larger, the
 * steps are averaged away and the edges stay hard. In one band when it fits a canvas (every card, tile and
 * aid); a bigger page is drawn in bands with `overlap` px drawn above and below each and dropped, because
 * Chromium and WebKit draw filters (displacement, blur) near a band's edge a little differently from the
 * whole: with 200 px at 300 dpi the bands differ from the whole by 2/255 at most (Firefox: not at all).
 */
export async function* drawBands(
  svg: string,
  w: number,
  h: number,
  background: string,
  overlap = 0,
  canvasPixels = CANVAS_PIXELS,
  oversample = 2,
) {
  const img = await loadSvg(svg);
  const k = oversample;
  const single = w * h * k * k <= canvasPixels;
  const pad = single ? 0 : overlap;
  const rows = single ? h : Math.max(1, Math.floor(canvasPixels / (w * k * k)) - 2 * pad);
  const big = document.createElement('canvas');
  big.width = w * k;
  big.height = Math.min(h, rows + 2 * pad) * k;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = big.height / k;
  const drawn = big.getContext('2d')!;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  try {
    for (let y = 0; y < h; y += rows) {
      const top = Math.min(pad, y);
      drawn.fillStyle = background;
      drawn.fillRect(0, 0, big.width, big.height);
      drawn.drawImage(img, 0, (top - y) * k, w * k, h * k);
      ctx.drawImage(big, 0, 0, w, canvas.height);
      yield ctx.getImageData(0, top, w, Math.min(rows, h - y)).data;
    }
  } finally {
    // Safari frees a canvas's memory only once it's sized to nothing.
    big.width = big.height = canvas.width = canvas.height = 0;
  }
}

/** A canvas encoded as `type` (browsers that can't encode it give PNG). */
export const encode = (canvas: HTMLCanvasElement, type = 'image/png', quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('drawing the SVG failed'))), type, quality),
  );

/**
 * Draws an SVG document to a `w` × `h` px bitmap, encoded as `type`, and the same bitmap cut out by a
 * second, `mask` (kept where the mask is drawn): drawn once, for both.
 */
export async function rasteriseWithCutout(
  svg: string,
  mask: string,
  w: number,
  h: number,
  type = 'image/png',
  quality?: number,
): Promise<[Blob, Blob]> {
  const [canvas, cutter] = await Promise.all([drawSvg(svg, w, h), loadSvg(mask)]);
  try {
    const whole = await encode(canvas, type, quality);
    const ctx = canvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(cutter, 0, 0, w, h);
    return [whole, await encode(canvas, type, quality)];
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Draws an SVG document to a `w` × `h` px bitmap, encoded as `type`. */
export async function rasterise(svg: string, w: number, h: number, type = 'image/png', quality?: number): Promise<Blob> {
  const canvas = await drawSvg(svg, w, h);
  try {
    return await encode(canvas, type, quality);
  } finally {
    canvas.width = canvas.height = 0;
  }
}
